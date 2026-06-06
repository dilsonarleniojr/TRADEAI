import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RiskManager")

class RiskManager:
    """
    Gerenciador de Risco de alta frequência para robôs de trading quantitativo.
    Contém um Kill Switch projetado para liquidar posições imediatamente a mercado
    em caso de drawdown extremo ou slippage severo.
    """
    def __init__(self, capital: float, max_loss_pct: float = 0.02):
        self.capital = capital
        self.max_loss_pct = max_loss_pct
        self.position = None # Contém dict: {'entry_price': float, 'qty': float, 'active': bool}
        self.market_orders = [] # Histórico de ordens emitidas
        self.reaction_time_ns = None # Tempo de reação medido em nanosegundos

    def open_position(self, entry_price: float, qty: float):
        """
        Abre uma posição LONG.
        """
        self.position = {
            'entry_price': entry_price,
            'qty': qty,
            'active': True
        }
        self.reaction_time_ns = None
        logger.info(f"Posição aberta: Preço de entrada = {entry_price}, Qtd = {qty}")

    def on_tick(self, price: float):
        """
        Método chamado em cada tick (atualização de preço) para monitorar risco.
        Se o preço romper o limite de perda (mesmo pulando o stop exato), aciona o Kill Switch.
        """
        start_time = time.perf_counter_ns()
        
        if not self.position or not self.position['active']:
            return

        # Calcular perda percentual
        entry_price = self.position['entry_price']
        loss_pct = (entry_price - price) / entry_price
        
        # Rompeu o limite de perda (ex: 2%)?
        if loss_pct >= self.max_loss_pct:
            self._trigger_kill_switch(price, loss_pct, start_time)

    def _trigger_kill_switch(self, trigger_price: float, actual_loss_pct: float, start_time_ns: int):
        """
        Dispara a ordem a mercado imediatamente para fechar a posição.
        """
        # Desativa a posição imediatamente
        self.position['active'] = False
        
        # Simula o envio de uma ordem a mercado (Market Order)
        order = {
            'timestamp_ns': time.perf_counter_ns(),
            'side': 'SELL',
            'type': 'MARKET',
            'qty': self.position['qty'],
            'price': trigger_price,
            'status': 'FILLED'
        }
        self.market_orders.append(order)
        
        # Calcular tempo de reação desde a leitura do tick até o fim da emissão da ordem
        end_time = time.perf_counter_ns()
        self.reaction_time_ns = end_time - start_time_ns
        
        logger.warning(
            f"🚨 KILL SWITCH ATIVADO! Perda de {actual_loss_pct*100:.2f}% excede limite de {self.max_loss_pct*100:.2f}%. "
            f"Ordem de Mercado emitida a {trigger_price}. Tempo de reação: {self.reaction_time_ns / 1_000_000:.4f} ms."
        )
