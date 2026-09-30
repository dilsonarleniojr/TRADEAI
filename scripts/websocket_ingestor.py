import asyncio
from collections import deque
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebSocketIngestor")

class WebSocketIngestor:
    """
    Ingestor assíncrono de dados de mercado para alta frequência.
    Utiliza um buffer em memória do tipo collections.deque limitado (maxlen)
    para evitar vazamentos de memória (memory leaks) sob estresse de ticks.
    """
    def __init__(self, max_buffer_size: int = 10000):
        self.max_buffer_size = max_buffer_size
        # deque é thread-safe para appends e pops rápidos
        self.buffer = deque(maxlen=max_buffer_size)
        # asyncio.Queue para desacoplar a recepção rápida do processamento
        self.queue = asyncio.Queue()
        self.processed_count = 0
        self.is_running = False
        self._process_task = None

    async def ingest(self, tick: dict):
        """
        Recebe um tick (dicionário de variação de preço) e adiciona na fila de processamento.
        Não bloqueia a thread de ingestão.
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
        Drena a fila continuamente e joga no buffer limitado de ticks.
        """
        while self.is_running:
            try:
                # wait_for permite checar o flag is_running periodicamente
                tick = await asyncio.wait_for(self.queue.get(), timeout=0.1)
                self.buffer.append(tick)
                self.processed_count += 1
                self.queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Erro no loop de processamento do buffer: {e}")
