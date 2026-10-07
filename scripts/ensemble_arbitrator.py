import math
import logging

logger = logging.getLogger("EnsembleArbitrator")

def technical_specialist(ema_fast: float, ema_slow: float, current_price: float):
    """
    Especialista Gráfico: Analisa médias móveis e tendência.
    """
    if current_price > ema_fast and ema_fast > ema_slow:
        return "BUY", 0.85
    elif current_price < ema_fast and ema_fast < ema_slow:
        return "SELL", 0.85
    else:
        return "HOLD", 0.50

def momentum_specialist(rsi_value: float):
    """
    Especialista de Oscilação (Momentum): Analisa exaustão usando RSI.
    """
    if rsi_value < 30:
        return "BUY", 0.90
    elif rsi_value > 70:
        return "SELL", 0.90
    else:
        return "HOLD", 0.50

def flow_specialist(volume_change_pct: float):
    """
    Especialista de Fluxo: Analisa volume para confirmação do fluxo.
    """
    if volume_change_pct > 15:
        return "BUY", 0.80
    elif volume_change_pct < -15:
        return "SELL", 0.80
    else:
        return "HOLD", 0.50

def risk_specialist(atr_pct: float, risk_veto_limit_atr: float = 5.0):
    """
    Especialista de Risco: Avalia volatilidade extrema e aplica veto absoluto.
    """
    if atr_pct >= risk_veto_limit_atr:
        return "BLOCK", 1.0
    return "ALLOW", 0.0

# ==============================================================================
# Ensemble Arbitrator
# ==============================================================================

class EnsembleArbitrator:
    def __init__(self, soft_threshold: float = 0.70, risk_veto_limit_atr: float = 5.0):
        self.soft_threshold = soft_threshold
        self.risk_veto_limit_atr = risk_veto_limit_atr
        # Pesos institucionais do Stacking
        self.weights = {
            'technical': 0.40,
            'momentum': 0.35,
            'flow': 0.25
        }

    def hard_voting(self, votes):
        buy_votes = votes.count("BUY")
        sell_votes = votes.count("SELL")
        if buy_votes >= 2:
            return "BUY"
        elif sell_votes >= 2:
            return "SELL"
        return "HOLD"

    def soft_voting(self, tech_pred, tech_conf, momentum_pred, momentum_conf, flow_pred, flow_conf):
        p_tech = tech_conf if tech_pred == "BUY" else (1 - tech_conf if tech_pred == "SELL" else 0.5)
        p_mom = momentum_conf if momentum_pred == "BUY" else (1 - momentum_conf if momentum_pred == "SELL" else 0.5)
        p_flow = flow_conf if flow_pred == "BUY" else (1 - flow_conf if flow_pred == "SELL" else 0.5)
        
        final_p = (
            (p_tech * self.weights['technical']) +
            (p_mom * self.weights['momentum']) +
            (p_flow * self.weights['flow'])
        )
        return final_p

    def calculate_indicators(self, buffer):
        """
        Calcula indicadores técnicos em tempo real a partir de um buffer de ticks.
        """
        if len(buffer) < 14:
            return None
            
        prices = [float(tick['price']) for tick in buffer]
        volumes = [float(tick['volume']) for tick in buffer]
        
        current_price = prices[-1]
        
        # 1. EMA (Média Móvel Exponencial)
        def calc_ema(data, span):
            if len(data) < span:
                span = len(data)
            alpha = 2.0 / (span + 1)
            ema = data[0]
            for val in data[1:]:
                ema = val * alpha + ema * (1 - alpha)
            return ema

        ema_fast = calc_ema(prices, 50)
        ema_slow = calc_ema(prices, 150)
        
        # 2. RSI (Relative Strength Index)
        deltas = []
        for i in range(len(prices) - 1):
            deltas.append(prices[i+1] - prices[i])
            
        rsi_len = min(14, len(deltas))
        recent_deltas = deltas[-rsi_len:]
        
        gains = [d for d in recent_deltas if d > 0]
        losses = [-d for d in recent_deltas if d < 0]
        
        avg_gain = sum(gains) / rsi_len if gains else 0
        avg_loss = sum(losses) / rsi_len if losses else 0
        
        if avg_loss == 0:
            rsi_value = 100.0 if avg_gain > 0 else 50.0
        else:
            rs = avg_gain / avg_loss
            rsi_value = 100.0 - (100.0 / (1.0 + rs))
            
        # 3. Volume Change Pct (Volume do último tick vs média dos 20 anteriores)
        vol_len = min(20, len(volumes))
        avg_vol = sum(volumes[-vol_len:-1]) / (vol_len - 1) if vol_len > 1 else volumes[0]
        current_vol = volumes[-1]
        volume_change_pct = ((current_vol - avg_vol) / avg_vol) * 100.0 if avg_vol > 0 else 0.0
        
        # 4. Volatilidade ATR aproximada (Desvio padrão percentual dos retornos de 14 períodos)
        returns = []
        for i in range(len(prices) - 1):
            if prices[i] > 0:
                returns.append((prices[i+1] - prices[i]) / prices[i])
        
        ret_len = min(14, len(returns))
        if ret_len > 1:
            recent_returns = returns[-ret_len:]
            mean_ret = sum(recent_returns) / ret_len
            variance = sum((r - mean_ret) ** 2 for r in recent_returns) / (ret_len - 1)
            vol_std = (variance ** 0.5) * 100.0
        else:
            vol_std = 0.1
            
        return {
            'ema_fast': ema_fast,
            'ema_slow': ema_slow,
            'current_price': current_price,
            'rsi_value': rsi_value,
            'volume_change_pct': volume_change_pct,
            'atr_pct': vol_std
        }

    def evaluate_buffer(self, tick_buffer):
        """
        Calcula indicadores usando o buffer de ticks e avalia o mercado.
        """
        indicators = self.calculate_indicators(tick_buffer)
        if not indicators:
            return "AGUARDAR"
            
        return self.evaluate_market(
            ema_fast=indicators['ema_fast'],
            ema_slow=indicators['ema_slow'],
            current_price=indicators['current_price'],
            rsi_value=indicators['rsi_value'],
            volume_change_pct=indicators['volume_change_pct'],
            atr_pct=indicators['atr_pct']
        )

    def evaluate_market(self, ema_fast, ema_slow, current_price, rsi_value, volume_change_pct, atr_pct):
        """
        Combina os micro-especialistas, executa o comitê e aplica a regra de veto do Especialista de Risco.
        """
        # 1. Regra de Veto Absoluto (Failsafe) do Especialista de Risco
        risk_decision, _ = risk_specialist(atr_pct, self.risk_veto_limit_atr)
        if risk_decision == "BLOCK":
            logger.warning(f"🛑 VETO DE RISCO ATIVADO: Volatilidade ATR de {atr_pct:.2f}% excede limite de {self.risk_veto_limit_atr}%.")
            return "AGUARDAR"

        # 2. Consultar os especialistas
        tech_act, tech_conf = technical_specialist(ema_fast, ema_slow, current_price)
        mom_act, mom_conf = momentum_specialist(rsi_value)
        flow_act, flow_conf = flow_specialist(volume_change_pct)

        # 3. Hard Voting (Maioria)
        votes = [tech_act, mom_act, flow_act]
        hard_decision = self.hard_voting(votes)
        
        # 4. Soft Voting Ponderado
        final_confidence = self.soft_voting(tech_act, tech_conf, mom_act, mom_conf, flow_act, flow_conf)
        
        # Regra de decisão ponderada baseada no threshold
        if final_confidence >= self.soft_threshold:
            decision = "EXECUTAR_COMPRA"
        elif final_confidence <= (1 - self.soft_threshold):
            decision = "EXECUTAR_VENDA"
        else:
            decision = "AGUARDAR"

        return decision

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    arbitrator = EnsembleArbitrator(soft_threshold=0.70, risk_veto_limit_atr=5.0)
    logger.info("Testando árbitro...")
    res = arbitrator.evaluate_market(100.0, 95.0, 102.0, 28.0, 20.0, 2.5)
    logger.info(f"Resultado: {res}")
