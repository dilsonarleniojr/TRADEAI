import sys
import os
from unittest.mock import patch

# Adiciona o diretório scripts ao path do python
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from scripts.ensemble_arbitrator import EnsembleArbitrator

def test_ensemble_veto_logic():
    """
    Cenário 2: Teste Unitário do Comitê de IA (Ensemble Logic).
    Cria um mock das saídas de três modelos especialistas:
    - Especialista Técnico: Vota COMPRA (0.80)
    - Especialista de Fluxo: Vota VENDA (0.90)
    - Especialista de Risco: Bloqueia a operação (Volatilidade Extrema / BLOCK)
    Valide se o Árbitro (EnsembleArbitrator) respeita a regra de veto absoluto
    do modelo de risco e retorna o sinal correto ("AGUARDAR"), impedindo a execução.
    """
    # Instancia o árbitro
    arbitrator = EnsembleArbitrator(soft_threshold=0.70, risk_veto_limit_atr=5.0)
    
    # Aplica patches para interceptar as chamadas aos micro-especialistas
    with patch('scripts.ensemble_arbitrator.technical_specialist', return_value=("BUY", 0.80)) as mock_tech, \
         patch('scripts.ensemble_arbitrator.flow_specialist', return_value=("SELL", 0.90)) as mock_flow, \
         patch('scripts.ensemble_arbitrator.risk_specialist', return_value=("BLOCK", 1.0)) as mock_risk:
             
        # Executa a avaliação sob condições simuladas
        decision = arbitrator.evaluate_market(
            ema_fast=100.0,
            ema_slow=95.0,
            current_price=102.0,
            rsi_value=50.0,
            volume_change_pct=10.0,
            atr_pct=6.5 # Acionaria o bloco se não mockado, mas mock garante retorno "BLOCK"
        )
        
        # Asserções matemáticas e lógicas precisas
        
        # 1. A decisão final deve ser "AGUARDAR", pois o especialista de risco emitiu "BLOCK"
        assert decision == "AGUARDAR", f"Esperava a decisão 'AGUARDAR', mas obteve '{decision}'"
        
        # 2. O Especialista de Risco deve ser chamado exatamente uma vez
        mock_risk.assert_called_once()
        
        # 3. O Failsafe de Risco é executado antes dos demais para economizar processamento.
        #    Portanto, os especialistas Técnico e de Fluxo NÃO devem ser consultados.
        mock_tech.assert_not_called()
        mock_flow.assert_not_called()
        
        print("\n✅ AI Committee (Ensemble Logic) veto test passed successfully!")
