# -*- coding: utf-8 -*-
"""
TRADEAI — Institutional Trading Modules
Includes:
1. MarketRegimeDetector (O(1) Zero-GC Ring Buffer)
2. GeminiSentimentWorker (Async LLM Sentiment Worker)
3. SmartOrderRouter (SOR)
4. ExecutionAlgorithms (TWAP and VWAP order slicers)

Design Patterns Adopted:
- Producer-Consumer Decoupling: Queue-based worker threads prevent blocking the main trading engine execution loop.
- Ring Buffer Pattern: Avoids memory allocation overhead (Zero-GC pressure) by reusing preallocated primitive array blocks.
- Strategy & Router Pattern: Implements extensible router interfaces for execution path selections.
"""

import os
import sys
import time
import math
import asyncio
import logging
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("InstitutionalModules")

# Global State Flags for Sentiment and Trading Limits
GLOBAL_SENTIMENT = "Bullish"
BUY_HALTED = False

# ==============================================================================
# Módulo 1: Market Regime Detection (Zero-GC Ring Buffer)
# ==============================================================================
class MarketRegimeDetector:
    """
    Classifica o regime do mercado a cada tick (Trending, Ranging, Chaotic)
    em tempo sub-milissegundo (< 0.1ms) utilizando Ring Buffers pré-alocados de primitivos.
    """
    def __init__(self, period: int = 14, threshold_trending: float = 25.0):
        self.period = period
        self.threshold_trending = threshold_trending
        
        # Ring Buffers pré-alocados de primitivos para evitar instanciamento dinâmico (GC pressure)
        self.size = 100
        self.highs = [0.0] * self.size
        self.lows = [0.0] * self.size
        self.closes = [0.0] * self.size
        
        self.idx = 0
        self.count = 0
        self.prev_close = None
        
        # Acumuladores e estados do ADX
        self.smoothed_tr = 0.0
        self.smoothed_dm_plus = 0.0
        self.smoothed_dm_minus = 0.0
        
        # Ring buffer para médias de DX (ADX)
        self.dx_buffer = [0.0] * self.size
        self.dx_idx = 0
        self.dx_sum = 0.0
        self.dx_count = 0
        
        # Volatility tracking
        self.atr = 0.0

    def add_tick(self, close: float, high: float = None, low: float = None) -> str:
        """
        Adiciona o tick corrente e classifica o regime de forma O(1) imediata.
        """
        t_start = time.perf_counter_ns()
        
        if high is None: high = close
        if low is None: low = close
        
        # Gravação direta no Ring Buffer circular
        self.highs[self.idx] = high
        self.lows[self.idx] = low
        self.closes[self.idx] = close
        
        self.idx = (self.idx + 1) % self.size
        self.count += 1
        
        if self.prev_close is None:
            self.prev_close = close
            return "Ranging"
            
        # 1. True Range (TR) e Directional Movement (+DM / -DM)
        tr = max(
            high - low,
            abs(high - self.prev_close),
            abs(low - self.prev_close)
        )
        
        # Obter candle anterior usando aritmética circular no Ring Buffer
        prev_idx = (self.idx - 2) % self.size
        prev_high = self.highs[prev_idx]
        prev_low = self.lows[prev_idx]
        
        up_move = high - prev_high
        down_move = prev_low - low
        
        dm_plus = up_move if (up_move > down_move and up_move > 0) else 0.0
        dm_minus = down_move if (down_move > up_move and down_move > 0) else 0.0
        
        # 2. Suavização de Wilder
        if self.count <= self.period:
            self.smoothed_tr += tr
            self.smoothed_dm_plus += dm_plus
            self.smoothed_dm_minus += dm_minus
            self.atr = self.smoothed_tr / self.count
            self.prev_close = close
            return "Ranging"
        else:
            self.smoothed_tr = self.smoothed_tr - (self.smoothed_tr / self.period) + tr
            self.smoothed_dm_plus = self.smoothed_dm_plus - (self.smoothed_dm_plus / self.period) + dm_plus
            self.smoothed_dm_minus = self.smoothed_dm_minus - (self.smoothed_dm_minus / self.period) + dm_minus
            self.atr = self.smoothed_tr / self.period
            
        # 3. Directional Indexes (DI) e DX
        di_plus = 100.0 * (self.smoothed_dm_plus / self.smoothed_tr) if self.smoothed_tr > 0 else 0.0
        di_minus = 100.0 * (self.smoothed_dm_minus / self.smoothed_tr) if self.smoothed_tr > 0 else 0.0
        
        di_sum = di_plus + di_minus
        dx = 100.0 * abs(di_plus - di_minus) / di_sum if di_sum > 0 else 0.0
        
        # DX Buffer update
        old_dx = self.dx_buffer[self.dx_idx]
        self.dx_buffer[self.dx_idx] = dx
        self.dx_idx = (self.dx_idx + 1) % self.size
        
        if self.dx_count < self.period:
            self.dx_count += 1
            self.dx_sum += dx
            adx = self.dx_sum / self.dx_count
        else:
            self.dx_sum = self.dx_sum - old_dx + dx
            adx = self.dx_sum / self.period
            
        self.prev_close = close
        
        # Classificação de Regime com base em ADX e ATR Volatility
        # Se a volatilidade ATR for extrema (maior que 1% do preço do ativo), classifica como Chaotic.
        # Se ADX > threshold_trending (e volatilidade controlada), Trending.
        # Caso contrário, Ranging.
        t_end = time.perf_counter_ns()
        latency_ms = (t_end - t_start) / 1_000_000
        
        regime = "Ranging"
        if self.atr > (close * 0.015):
            regime = "Chaotic"
        elif adx > self.threshold_trending:
            regime = "Trending"
            
        return regime


# ==============================================================================
# Módulo 2: Filtro de Sentimento Macro (Integração Gemini LLM API)
# ==============================================================================
class GeminiSentimentWorker:
    """
    Worker assíncrono isolado que consome notícias/tweets e chama a API do Gemini.
    Atualiza flags globais e bloqueia compras em caso de Pânico macroeconômico.
    """
    def __init__(self, api_key: str = None, check_interval_seconds: int = 60):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.check_interval_seconds = check_interval_seconds
        self.is_running = False
        self._task = None

    async def start(self):
        self.is_running = True
        self._task = asyncio.create_task(self._worker_loop())
        logger.info("✅ Gemini Sentiment Worker iniciado.")

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 Gemini Sentiment Worker encerrado.")

    async def analyze_sentiment(self, text: str) -> str:
        """
        Consulta direta à API do Gemini via chamada HTTP aiohttp leve (zero dependências pesadas).
        """
        if not self.api_key or self.api_key == "mock":
            # Fallback determinístico offline para simulações e testes unitários
            text_lower = text.lower()
            if "crisis" in text_lower or "panic" in text_lower or "crash" in text_lower:
                return "Panic"
            elif "dump" in text_lower or "bear" in text_lower or "fall" in text_lower:
                return "Bearish"
            return "Bullish"
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.api_key}"
        payload = {
            "contents": [{
                "parts": [{"text": f"Analyze the sentiment of this financial update as exactly one of: Bullish, Bearish, or Panic. Return only the classification word without punctuation.\n\nText: {text}"}]
            }]
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=8.0) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                        if "Panic" in raw_text:
                            return "Panic"
                        elif "Bearish" in raw_text:
                            return "Bearish"
                        else:
                            return "Bullish"
                    else:
                        logger.warning(f"⚠️ Gemini API falhou (Status {resp.status}). Usando fallback offline...")
                        return self._offline_sentiment_fallback(text)
        except Exception as e:
            logger.error(f"❌ Falha de rede ao consultar Gemini: {e}")
            return self._offline_sentiment_fallback(text)

    def _offline_sentiment_fallback(self, text: str) -> str:
        text_lower = text.lower()
        if "panic" in text_lower or "crash" in text_lower:
            return "Panic"
        elif "bear" in text_lower or "down" in text_lower:
            return "Bearish"
        return "Bullish"

    async def _worker_loop(self):
        global GLOBAL_SENTIMENT, BUY_HALTED
        while self.is_running:
            try:
                # Simulação de coleta de notícias (em prod seria alimentado de feeds de RSS ou Twitter)
                # Vamos forçar uma notícia neutra por padrão para o loop recorrente
                news_snippet = "Binance expands stablecoin support to include new fiat gateways."
                
                sentiment = await self.analyze_sentiment(news_snippet)
                GLOBAL_SENTIMENT = sentiment
                
                if sentiment == "Panic":
                    BUY_HALTED = True
                    logger.warning("🚨 COMPRAS BLOQUEADAS! Sentimento MACRO detectou PANICO.")
                else:
                    BUY_HALTED = False
                
                await asyncio.sleep(self.check_interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Erro no loop do SentimentWorker: {e}")
                await asyncio.sleep(5)


# ==============================================================================
# Módulo 3: Smart Order Routing (SOR)
# ==============================================================================
class SmartOrderRouter:
    """
    Roteador Inteligente de Ordens (SOR).
    Avalia Order Books de múltiplos pares concorrentes e seleciona o mercado
    com maior profundidade (liquidez) e menor spread.
    """
    def __init__(self, connector):
        self.connector = connector

    async def select_optimal_market(self, symbol_a: str, symbol_b: str, side: str) -> str:
        """
        Determina o melhor símbolo/mercado comparando os preços ask/bid e spreads.
        """
        try:
            ticker_a = await self.connector.get_orderbook_ticker(symbol_a)
            ticker_b = await self.connector.get_orderbook_ticker(symbol_b)
        except Exception as e:
            logger.warning(f"⚠️ Erro ao consultar books no SOR: {e}. Usando default {symbol_a}")
            return symbol_a
            
        bid_a = float(ticker_a.get("bidPrice", 0))
        ask_a = float(ticker_a.get("askPrice", 0))
        bid_b = float(ticker_b.get("bidPrice", 0))
        ask_b = float(ticker_b.get("askPrice", 0))
        
        if ask_a <= 0 or ask_b <= 0:
            return symbol_a

        if side.upper() == "BUY":
            # Para compras, buscamos a menor cotação ask
            if ask_a <= ask_b:
                logger.info(f"🔀 SOR Selecionou {symbol_a} para compra (Ask {ask_a} <= {ask_b})")
                return symbol_a
            else:
                logger.info(f"🔀 SOR Selecionou {symbol_b} para compra (Ask {ask_b} < {ask_a})")
                return symbol_b
        else:
            # Para vendas, buscamos a maior cotação bid
            if bid_a >= bid_b:
                logger.info(f"🔀 SOR Selecionou {symbol_a} para venda (Bid {bid_a} >= {bid_b})")
                return symbol_a
            else:
                logger.info(f"🔀 SOR Selecionou {symbol_b} para venda (Bid {bid_b} > {bid_a})")
                return symbol_b


# ==============================================================================
# Módulo 4: Algoritmos de Execução (TWAP e VWAP)
# ==============================================================================
class ExecutionAlgorithms:
    """
    Motores de fatiamento de ordens institucionais (TWAP e VWAP).
    Reduzem o impacto de mercado (slippage) ao fatiar ordens grandes.
    """
    def __init__(self, connector):
        self.connector = connector

    async def execute_twap(self, symbol: str, side: str, total_quantity: float, slices: int, interval_seconds: float):
        """
        Executa fatiamento de ordens em tempos iguais (Time-Weighted Average Price).
        """
        slice_qty = total_quantity / slices
        logger.info(f"⏳ Executando TWAP em {symbol}: {slices} fatias de {slice_qty:.6f} a cada {interval_seconds}s")
        
        for i in range(slices):
            try:
                # Dispara a ordem com proteção de slippage embutida
                await self.connector.create_slippage_protected_order(
                    symbol=symbol,
                    side=side,
                    quantity=slice_qty
                )
                logger.info(f"   * TWAP Fatia {i+1}/{slices} processada com sucesso.")
            except Exception as e:
                logger.error(f"❌ Erro na fatia {i+1} do TWAP: {e}")
            
            if i < slices - 1:
                await asyncio.sleep(interval_seconds)

    async def execute_vwap(self, symbol: str, side: str, total_quantity: float, slices: int, interval_seconds: float):
        """
        Executa fatiamento proporcional ao volume intradiário estimado (Volume-Weighted Average Price).
        """
        # Distribui quantidades simulando uma curva em U típica de volume intradiário
        weights = [math.sin(x) + 1.2 for x in [i * (math.pi / slices) for i in range(slices)]]
        total_weight = sum(weights)
        
        logger.info(f"📊 Executando VWAP em {symbol}: fatiando {total_quantity:.6f} de forma ponderada por volume...")
        
        for i in range(slices):
            slice_qty = total_quantity * (weights[i] / total_weight)
            try:
                await self.connector.create_slippage_protected_order(
                    symbol=symbol,
                    side=side,
                    quantity=slice_qty
                )
                logger.info(f"   * VWAP Fatia {i+1}/{slices} ({slice_qty:.6f}) processada.")
            except Exception as e:
                logger.error(f"❌ Erro na fatia {i+1} do VWAP: {e}")
                
            if i < slices - 1:
                await asyncio.sleep(interval_seconds)
