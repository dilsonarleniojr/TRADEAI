# -*- coding: utf-8 -*-
"""
Módulo Conector Binance Assíncrono e Resiliente para HFT

Instruções de Instalação:
$ pip install python-binance asyncio aiohttp python-dotenv

As credenciais da API devem ser configuradas em um arquivo `.env` na raiz do projeto:
BINANCE_API_KEY="sua_chave_publica"
BINANCE_API_SECRET="sua_chave_privada"
"""

import os
import asyncio
import logging
import functools
import aiohttp
from binance import AsyncClient, BinanceAPIException

# Carregar dotenv se disponível
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Configuração básica de Logging para HFT
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("BinanceConnector")

# ==============================================================================
# Decorador de Retry Resiliente
# ==============================================================================

def retry_on_rate_limit_and_timeout(max_retries: int = 3, initial_backoff: float = 1.0):
    """
    Decorador para tentar novamente uma chamada de API assíncrona caso ocorra:
    - asyncio.TimeoutError ou aiohttp.ClientError (problemas de rede)
    - BinanceAPIException com código -1003 (Rate Limit excedido)
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            backoff = initial_backoff
            for attempt in range(1, max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except (asyncio.TimeoutError, aiohttp.ClientError) as e:
                    logger.warning(
                        f"⚠️ Erro de rede/Timeout em {func.__name__} (tentativa {attempt}/{max_retries}): {e}"
                    )
                    if attempt == max_retries:
                        raise
                    await asyncio.sleep(backoff)
                    backoff *= 2 # Backoff Exponencial
                except BinanceAPIException as e:
                    if e.code == -1003: # Rate Limit
                        logger.warning(
                            f"🚨 Rate Limit Binance (-1003) em {func.__name__} (tentativa {attempt}/{max_retries}). Dormindo {backoff}s..."
                        )
                        if attempt == max_retries:
                            raise
                        await asyncio.sleep(backoff)
                        backoff *= 2
                    else:
                        # Outros erros da API (como fundos insuficientes ou ordens inválidas) não devem ter retry
                        raise
        return wrapper
    return decorator

# ==============================================================================
# Binance Connector
# ==============================================================================

class BinanceConnector:
    def __init__(self, testnet: bool = True):
        self.api_key = os.getenv("BINANCE_API_KEY")
        self.api_secret = os.getenv("BINANCE_API_SECRET")
        self.testnet = testnet
        self.client = None
        self.step_size_cache = {} # Caching de LOT_SIZE para evitar requests excessivos
        self.prices_cache = {} # Cache de preços: {symbol: {'bid': float, 'ask': float, 'last': float}}
        self._ticker_tasks = {} # Tarefas de escuta de ticker
        
        if not self.api_key or not self.api_secret:
            logger.warning("⚠️ Chaves de API (BINANCE_API_KEY / BINANCE_API_SECRET) não detectadas no ambiente.")

    async def start(self):
        """
        Inicializa o cliente assíncrono AsyncClient.
        """
        logger.info(f"Conectando à API da Binance (Testnet={self.testnet})...")
        try:
            self.client = await AsyncClient.create(
                api_key=self.api_key,
                api_secret=self.api_secret,
                testnet=self.testnet
            )
            logger.info("✅ Conexão assíncrona com a Binance estabelecida com sucesso.")
        except Exception as e:
            logger.error(f"❌ Falha crítica ao inicializar AsyncClient: {e}")
            raise

    async def close(self):
        """
        Fecha a sessão de conexão HTTP do cliente assíncrono e encerra as streams.
        """
        # Cancelar streams de preço em background
        for symbol, task in list(self._ticker_tasks.items()):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._ticker_tasks.clear()

        if self.client:
            logger.info("Fechando conexão com a Binance...")
            await self.client.close_connection()
            logger.info("✅ Conexão encerrada.")

    async def start_ticker_stream(self, symbol: str):
        """
        Inicia uma tarefa assíncrona em background para escutar o stream de ticker da Binance
        e manter a cache local de preços atualizada em tempo real (latência O(1) de acesso).
        """
        symbol = symbol.upper()
        if symbol in self._ticker_tasks:
            return
        
        task = asyncio.create_task(self._ticker_stream_loop(symbol))
        self._ticker_tasks[symbol] = task
        # Aguarda um pequeno momento para dar tempo do stream inicializar e popular o cache
        for _ in range(20):
            if symbol in self.prices_cache:
                break
            await asyncio.sleep(0.1)

    async def _ticker_stream_loop(self, symbol: str):
        """
        Conecta ao WebSocket público da Binance e atualiza a cache.
        """
        ws_base = "wss://testnet.binance.vision/ws" if self.testnet else "wss://stream.binance.com:9443/ws"
        url = f"{ws_base}/{symbol.lower()}@bookTicker"
        
        while True:
            try:
                logger.info(f"🔄 Conectando ao WebSocket de Preço para {symbol}: {url}...")
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(url) as ws:
                        logger.info(f"✅ WebSocket conectado para {symbol}.")
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                data = msg.json()
                                self.prices_cache[symbol] = {
                                    'bid': float(data.get('b', 0)),
                                    'ask': float(data.get('a', 0)),
                                    'last': (float(data.get('b', 0)) + float(data.get('a', 0))) / 2.0
                                }
                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Erro no WebSocket de Preço para {symbol}: {e}. Reconectando em 3s...")
                await asyncio.sleep(3)

    async def get_cached_price(self, symbol: str) -> dict:
        """
        Retorna o preço bid/ask/last da cache local de forma síncrona/instantânea.
        Caso não esteja na cache, faz o fallback rápido via REST.
        """
        symbol = symbol.upper()
        if symbol in self.prices_cache:
            return self.prices_cache[symbol]
        
        logger.warning(f"⚠️ Preço de {symbol} não encontrado na cache. Usando fallback REST...")
        ticker = await self.get_orderbook_ticker(symbol)
        price_data = {
            'bid': float(ticker.get('bidPrice', 0)),
            'ask': float(ticker.get('askPrice', 0)),
            'last': (float(ticker.get('bidPrice', 0)) + float(ticker.get('askPrice', 0))) / 2.0
        }
        self.prices_cache[symbol] = price_data
        return price_data

    @retry_on_rate_limit_and_timeout()
    async def get_symbol_step_size(self, symbol: str) -> float:
        """
        Busca a precisão do ativo (LOT_SIZE / stepSize) e faz cache do resultado.
        """
        symbol = symbol.upper()
        if symbol in self.step_size_cache:
            return self.step_size_cache[symbol]

        try:
            logger.info(f"Buscando LOT_SIZE para {symbol} na API...")
            info = await self.client.get_symbol_info(symbol)
            if not info:
                raise ValueError(f"Símbolo {symbol} não encontrado na Binance.")
                
            for filter_data in info.get("filters", []):
                if filter_data.get("filterType") == "LOT_SIZE":
                    step_size = float(filter_data["stepSize"])
                    self.step_size_cache[symbol] = step_size
                    logger.info(f"💾 Cache atualizado: Step Size de {symbol} = {step_size}")
                    return step_size

            # Fallback seguro caso não encontre
            return 0.00001
        except BinanceAPIException as e:
            logger.error(f"❌ Erro de API ao obter step size para {symbol}: {e.message} (código={e.code})")
            raise
        except Exception as e:
            logger.error(f"❌ Erro de rede/desconhecido ao obter step size para {symbol}: {e}")
            raise

    @retry_on_rate_limit_and_timeout()
    async def get_orderbook_ticker(self, symbol: str) -> dict:
        """
        Busca o preço atual de compra/venda (bid/ask) do livro de ordens.
        """
        symbol = symbol.upper()
        try:
            return await self.client.get_orderbook_ticker(symbol=symbol)
        except BinanceAPIException as e:
            logger.error(f"❌ Erro de API ao buscar livro de ordens para {symbol}: {e.message} (código={e.code})")
            raise
        except Exception as e:
            logger.error(f"❌ Erro de rede em get_orderbook_ticker para {symbol}: {e}")
            raise

    @retry_on_rate_limit_and_timeout()
    async def create_order(
        self, symbol: str, side: str, type: str, quantity: float, price: float = None, timeInForce: str = None
    ) -> dict:
        """
        Envia e roteia uma nova ordem.
        """
        symbol = symbol.upper()
        side = side.upper()
        type = type.upper()
        
        params = {
            "symbol": symbol,
            "side": side,
            "type": type,
            "quantity": quantity
        }
        if price is not None:
            params["price"] = price
        if timeInForce is not None:
            params["timeInForce"] = timeInForce

        try:
            logger.info(f"Roteando ordem: {side} {type} {quantity} {symbol}")
            return await self.client.create_order(**params)
        except BinanceAPIException as e:
            if e.code == -2010: # Account has insufficient balance
                logger.error(f"❌ Fundo Insuficiente: Saldo inadequado para a ordem {side} em {symbol}")
            elif e.code == -1013: # Filter failure (ex: invalid size/price step)
                logger.error(f"❌ Filtro Inválido (LOT_SIZE/PRICE_FILTER) ao criar ordem em {symbol}: {e.message}")
            else:
                logger.error(f"❌ Erro de API ao criar ordem para {symbol}: {e.message} (código={e.code})")
            raise
        except Exception as e:
            logger.error(f"❌ Erro de Rede/Desconhecido ao criar ordem para {symbol}: {e}")
            raise

    @retry_on_rate_limit_and_timeout()
    async def get_order(self, symbol: str, orderId: str) -> dict:
        """
        Consulta o status de uma ordem ativa ou preenchida.
        """
        symbol = symbol.upper()
        try:
            return await self.client.get_order(symbol=symbol, orderId=orderId)
        except BinanceAPIException as e:
            logger.error(f"❌ Erro de API ao consultar ordem {orderId} de {symbol}: {e.message}")
            raise
        except Exception as e:
            logger.error(f"❌ Erro de Rede ao consultar ordem {orderId} de {symbol}: {e}")
            raise

    @retry_on_rate_limit_and_timeout()
    async def cancel_order(self, symbol: str, orderId: str) -> dict:
        """
        Cancela uma ordem ativa na Binance.
        """
        symbol = symbol.upper()
        try:
            logger.info(f"Cancelando ordem {orderId} para {symbol}...")
            return await self.client.cancel_order(symbol=symbol, orderId=orderId)
        except BinanceAPIException as e:
            logger.error(f"❌ Erro de API ao cancelar ordem {orderId} de {symbol}: {e.message}")
            raise
        except Exception as e:
            logger.error(f"❌ Erro de Rede ao cancelar ordem {orderId} de {symbol}: {e}")
            raise

    @retry_on_rate_limit_and_timeout()
    async def create_oco_order(
        self, symbol: str, side: str, quantity: float, price: float, stop_price: float, stop_limit_price: float
    ) -> dict:
        """
        Cria uma ordem OCO (Order Cancels Other) para fechar posição com Stop Loss e Take Profit.
        """
        symbol = symbol.upper()
        side = side.upper()
        try:
            logger.info(f"Criando ordem OCO para {symbol}: Qtd={quantity}, TakeProfit={price}, Stop={stop_price}, StopLimit={stop_limit_price}")
            return await self.client.create_oco_order(
                symbol=symbol,
                side=side,
                quantity=quantity,
                price=price,
                stopPrice=stop_price,
                stopLimitPrice=stop_limit_price,
                stopLimitTimeInForce="GTC"
            )
        except BinanceAPIException as e:
            if e.code == -2010:
                logger.error(f"❌ Fundo Insuficiente: Saldo inadequado para a ordem OCO {side} em {symbol}")
            else:
                logger.error(f"❌ Erro de API ao criar ordem OCO em {symbol}: {e.message} (código={e.code})")
            raise
        except Exception as e:
            logger.error(f"❌ Erro de Rede ao criar ordem OCO em {symbol}: {e}")
            raise


# ==============================================================================
# Bloco de Teste de Conexão Simulado (Testnet)
# ==============================================================================

async def main():
    logger.info("=== Testando BinanceConnector de Simulação ===")
    
    # Instanciar apontando para a Testnet
    connector = BinanceConnector(testnet=True)
    await connector.start()
    
    try:
        # 1. Testar step size
        btc_step = await connector.get_symbol_step_size("BTCUSDT")
        print(f"\nStep size BTCUSDT: {btc_step}")
        
        # 2. Testar cache do step size (deve ler do cache instantaneamente)
        btc_step_cached = await connector.get_symbol_step_size("BTCUSDT")
        print(f"Step size BTCUSDT (Cached): {btc_step_cached}")
        
        # 3. Testar bid/ask do ticker
        ticker = await connector.get_orderbook_ticker("BTCUSDT")
        print(f"Ticker BTCUSDT: Bid = {ticker.get('bidPrice')}, Ask = {ticker.get('askPrice')}\n")
        
    except Exception as e:
        logger.error(f"Ocorreu um erro no teste: {e}")
    finally:
        await connector.close()

if __name__ == "__main__":
    # Roda o teste caso seja chamado diretamente
    asyncio.run(main())
