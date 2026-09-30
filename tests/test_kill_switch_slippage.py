import sys
import os
import time

# Adiciona o diretório scripts ao path do python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.risk_manager import RiskManager

def test_kill_switch_slippage():
    """
    Cenário 3: Teste de Integração do Kill Switch (Risk Management).
    Simula uma queda livre de preços com gap de baixa (slippage severo).
    Valida se a ordem de mercado é disparada no exato momento da violação e mede a latência.
    """
    # 1. Setup: Capital alocado e limite de perda em 2%
    capital = 10000.0
    max_loss_pct = 0.02
    risk_manager = RiskManager(capital=capital, max_loss_pct=max_loss_pct)
    
    # Preço de entrada: 100.0 (Stop loss limite teórico: 98.0)
    entry_price = 100.0
    qty = 100.0
    risk_manager.open_position(entry_price=entry_price, qty=qty)
    
    # 2. Ingestão de ticks saudáveis / normais (perdas dentro do aceitável)
    risk_manager.on_tick(99.5) # Perda de 0.5% (Sem disparar)
    assert risk_manager.position['active'] is True
    assert len(risk_manager.market_orders) == 0
    
    risk_manager.on_tick(98.5) # Perda de 1.5% (Sem disparar)
    assert risk_manager.position['active'] is True
    assert len(risk_manager.market_orders) == 0
    
    # 3. Gap de Baixa violento (Slippage): Pula de 98.5 para 95.0 direto (Pula o stop de 98.0)
    # Deve disparar o Kill Switch imediatamente neste tick.
    trigger_tick = 95.0
    risk_manager.on_tick(trigger_tick)
    
    # 4. Asserções e Validações Matemáticas
    
    # A posição deve ser desativada imediatamente
    assert risk_manager.position['active'] is False, "A posição deveria estar inativa."
    
    # Uma ordem de mercado (Market Order) deve ter sido preenchida
    assert len(risk_manager.market_orders) == 1, "Deveria ter emitido exatamente uma ordem de venda."
    order = risk_manager.market_orders[0]
    
    assert order['type'] == 'MARKET', "A ordem de liquidação deve ser a mercado (Kill Switch)."
    assert order['side'] == 'SELL', "A ordem de liquidação deve ser de venda."
    assert order['price'] == trigger_tick, f"A ordem deveria ter sido executada a {trigger_tick} (preço do gap)."
    
    # Tempo de reação medido em nanossegundos
    reaction_ns = risk_manager.reaction_time_ns
    assert reaction_ns is not None, "O tempo de reação deveria ter sido gravado."
    assert reaction_ns > 0, "O tempo de reação deve ser maior que zero."
    
    reaction_ms = reaction_ns / 1_000_000.0
    print(f"\n⚡ Kill Switch Slippage Test Results:")
    print(f"   - Limite de Perda: {max_loss_pct*100:.1f}%")
    print(f"   - Perda Efetiva no Gap: {((entry_price - trigger_tick)/entry_price)*100:.1f}%")
    print(f"   - Latência/Tempo de Reação da Lógica: {reaction_ms:.4f} ms")
    
    # Para HFT de alto desempenho local, a latência de tomada de decisão/emissão deve ser sub-milissegundo (< 2.0 ms de segurança, relaxado para 10 ms sob profiling)
    is_profiling = sys.getprofile() is not None
    limit_ms = 10.0 if is_profiling else 2.0
    assert reaction_ms < limit_ms, f"Tempo de reação muito alto detectado: {reaction_ms:.4f} ms (limite: {limit_ms} ms)"
