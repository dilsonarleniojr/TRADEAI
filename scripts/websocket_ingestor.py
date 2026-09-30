import asyncio
import time
from collections import deque
import logging

# Include scripts folder in path for imports if executed directly
import os
import sys
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from indicator_engine import IncrementalIndicatorEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebSocketIngestor")

class WebSocketIngestor:
    """
    Ingestor assíncrono de dados de mercado para alta frequência.
    Utiliza buffers circulares (collections.deque) limitados para candles e timeframes
    para evitar vazamentos e pausas de Garbage Collection sob estresse.
    """
    def __init__(self, max_buffer_size: int = 10000):
        self.max_buffer_size = max_buffer_size
        self.buffer = deque(maxlen=max_buffer_size)
        self.queue = asyncio.Queue()
        self.processed_count = 0
        self.is_running = False
        self._process_task = None
        
        # Estruturas Multi-Timeframe (deques rápidos de tamanho 1000)
        # Timeframes em segundos: 1m (60s), 5m (300s), 1h (3600s), 4h (14400s), 1d (86400s)
        self.timeframes = [60, 300, 3600, 14400, 86400]
        self.candles = {tf: deque(maxlen=1000) for tf in self.timeframes}
        self.indicator_engines = {tf: IncrementalIndicatorEngine() for tf in self.timeframes}
        self.indicator_states = {tf: {} for tf in self.timeframes}

    async def ingest(self, tick: dict):
        """
        Recebe um tick (dicionário de variação de preço) e adiciona na fila de processamento.
        """
        await self.queue.put(tick)

    async def start(self):
        """
        Inicia a tarefa assíncrona em background para drenar a fila e popular o buffer.
        """
        self.is_running = True
        self._process_task = asyncio.create_task(self._process_loop())

    async def stop(self):
        """
        Para o loop de processamento de forma limpa.
        """
        self.is_running = False
        if self._process_task:
            self._process_task.cancel()
            try:
                await self._process_task
            except asyncio.CancelledError:
                pass

    async def _process_loop(self):
        """
        Drena a fila continuamente, agrega em candles multi-timeframe de forma concorrente
        e atualiza os indicadores técnicos incrementais O(1).
        """
        while self.is_running:
            try:
                tick = await self.queue.get()
                self.buffer.append(tick)
                self.processed_count += 1
                
                # Extrair dados do tick
                price = float(tick.get("price", 0))
                volume = float(tick.get("volume", 0))
                ts = float(tick.get("timestamp", time.time()))
                
                # Agregação Multi-Timeframe concorrente (complexidade O(1) por tick)
                for tf in self.timeframes:
                    bar_start = ts - (ts % tf)
                    history = self.candles[tf]
                    
                    if history and history[-1]["timestamp"] == bar_start:
                        # Atualiza candle atual
                        candle = history[-1]
                        candle["high"] = max(candle["high"], price)
                        candle["low"] = min(candle["low"], price)
                        candle["close"] = price
                        candle["volume"] += volume
                    else:
                        # Cria um novo candle para o período
                        new_candle = {
                            "timestamp": bar_start,
                            "open": price,
                            "high": price,
                            "low": price,
                            "close": price,
                            "volume": volume
                        }
                        history.append(new_candle)
                    
                    # Atualiza o indicador técnico incremental do timeframe de forma ultra-rápida
                    candle = history[-1]
                    self.indicator_states[tf] = self.indicator_engines[tf].update(
                        close_price=candle["close"],
                        high_price=candle["high"],
                        low_price=candle["low"]
                    )
                
                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Erro no loop de processamento do buffer: {e}")
