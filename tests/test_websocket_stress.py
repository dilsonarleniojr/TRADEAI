import asyncio
import time
import sys
import os
import resource

# Adiciona o diretório scripts ao path do python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.websocket_ingestor import WebSocketIngestor

def get_memory_usage_mb() -> float:
    """
    Retorna o uso atual de memória RSS em MB utilizando a biblioteca padrão resource.
    No Linux, ru_maxrss é retornado em kilobytes.
    """
    usage_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return usage_kb / 1024.0

def test_websocket_stress():
    """
    Cenário 1: Teste de Estresse do WebSocket (Data Ingestion).
    Injeta 5.000 mensagens de variação de preço em menos de 1 segundo.
    Valida se o buffer de memória processa os dados sem travar a thread principal e evita memory leaks.
    """
    async def run_stress():
        # Buffer de 10.000 mensagens de limite máximo
        ingestor = WebSocketIngestor(max_buffer_size=10000)
        await ingestor.start()
        
        ticks_to_send = 5000
        start_memory = get_memory_usage_mb()
        start_time = time.perf_counter()
        
        # Enviar 5000 ticks concorrentemente e de forma assíncrona
        tasks = [
            ingestor.ingest({
                "symbol": "BTCUSDT",
                "price": 100.0 + (i * 0.01),
                "volume": 10.5 + i,
                "timestamp": time.time()
            })
            for i in range(ticks_to_send)
        ]
        await asyncio.gather(*tasks)
        
        # Aguardar drenagem completa da fila com timeout de segurança
        timeout = 2.0
        drain_start = time.perf_counter()
        while not ingestor.queue.empty() and (time.perf_counter() - drain_start < timeout):
            await asyncio.sleep(0.01)
            
        end_time = time.perf_counter()
        end_memory = get_memory_usage_mb()
        
        await ingestor.stop()
        
        total_time = end_time - start_time
        memory_delta = end_memory - start_memory
        
        print(f"\n📊 WebSocket Stress Test Results:")
        print(f"   - Ticks Enviados: {ticks_to_send}")
        print(f"   - Ticks Processados: {ingestor.processed_count}")
        print(f"   - Tempo Total: {total_time:.4f} s")
        print(f"   - Delta de Memória: {memory_delta:.4f} MB")
        
        # Validação 1: Todas as 5.000 mensagens foram processadas pelo buffer
        assert ingestor.processed_count == ticks_to_send, (
            f"Processou apenas {ingestor.processed_count} de {ticks_to_send} ticks."
        )
        
        # Validação 2: Tempo total de ingestão e processamento menor que 1 segundo (relaxado para 5s sob profiling)
        is_profiling = sys.getprofile() is not None
        limit_time = 5.0 if is_profiling else 1.0
        assert total_time < limit_time, f"Tempo de execução excedeu o limite: {total_time:.4f}s (limite: {limit_time}s)"
        
        # Validação 3: Buffer limitado e consumo de memória razoável
        assert len(ingestor.buffer) == ticks_to_send, "Tamanho final do buffer inconsistente."
        assert memory_delta < 5.0, f"Vazamento de memória em potencial detectado. Delta: {memory_delta:.2f} MB"

    asyncio.run(run_stress())
