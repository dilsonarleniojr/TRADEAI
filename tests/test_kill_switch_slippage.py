import sys
import os
import time
import asyncio
import aiohttp

# Adiciona o diretório scripts ao path do python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.risk_manager import RiskManager

async def fetch_real_ticks(symbol: str = "BTCUSDT", limit: int = 50) -> list:
    """
    Busca ticks reais de mercado de forma pública (sem chaves de API).
    """
    url = f"https://api.binance.com/api/v3/aggTrades?symbol={symbol}&limit={limit}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status == 200:
                data = await resp.json()
                return [float(trade['p']) for trade in data]
            else:
                raise RuntimeError(f"Erro ao buscar ticks de mercado da Binance: HTTP {resp.status}")

async def run_kill_switch_slippage():
    """
    Cenário 3: Teste de Integração do Kill Switch (Risk Management).
    Simula uma queda livre de preços com gap de baixa (slippage severo).
    Valida se a ordem de mercado é disparada no exato momento da violação e mede a latência.
    """
    # 1. Fetch real market ticks
    real_prices = await fetch_real_ticks("BTCUSDT", 50)
    print(f"📊 Replayed {len(real_prices)} real BTCUSDT ticks from Binance.")
    
    # 2. Setup: Capital alocado e limite de perda em 0.5% (50 bps)
    capital = 10000.0
    max_loss_pct = 0.005 # 0.5%
    risk_manager = RiskManager(capital=capital, max_loss_pct=max_loss_pct)
    
    first_price = real_prices[0]
    risk_manager.open_position(entry_price=first_price, qty=100.0, symbol="BTCUSDT")
    
    # 3. Feed standard non-triggering ticks
    for price in real_prices[1:5]:
        loss_pct = (first_price - price) / first_price
        if loss_pct < max_loss_pct:
            await risk_manager.on_tick(price)
            assert risk_manager.position['active'] is True
            assert len(risk_manager.market_orders) == 0
            
    # 4. Trigger gap slippage tick (flash crash drop of -1.5%)
    trigger_tick = first_price * (1.0 - max_loss_pct * 3.0)
    await risk_manager.on_tick(trigger_tick)
    
    # 5. Assert safety bounds
    assert risk_manager.position['active'] is False, "A posição deveria estar inativa."
    assert len(risk_manager.market_orders) == 1, "Deveria ter emitido exatamente uma ordem de venda."
    
    order = risk_manager.market_orders[0]
    assert order['type'] == 'MARKET', "A ordem de liquidação deve ser a mercado (Kill Switch)."
    assert order['side'] == 'SELL', "A ordem de liquidação deve ser de venda."
    assert order['price'] == trigger_tick, f"A ordem deveria ter sido executada a {trigger_tick}."
    
    reaction_ns = risk_manager.reaction_time_ns
    assert reaction_ns is not None, "O tempo de reação deveria ter sido gravado."
    assert reaction_ns > 0, "O tempo de reação deve ser maior que zero."
    
    reaction_ms = reaction_ns / 1_000_000.0
    print(f"\n⚡ Kill Switch Slippage Test Results:")
    print(f"   - Limite de Perda: {max_loss_pct*100:.2f}%")
    print(f"   - Perda Efetiva no Gap: {((first_price - trigger_tick)/first_price)*100:.2f}%")
    print(f"   - Latência/Tempo de Reação da Lógica: {reaction_ms:.4f} ms")
    
    # HFT latency check
    is_profiling = sys.getprofile() is not None
    limit_ms = 10.0 if is_profiling else 2.0
    assert reaction_ms < limit_ms, f"Tempo de reação muito alto detectado: {reaction_ms:.4f} ms"

def test_kill_switch_slippage():
    asyncio.run(run_kill_switch_slippage())

if __name__ == "__main__":
    test_kill_switch_slippage()
