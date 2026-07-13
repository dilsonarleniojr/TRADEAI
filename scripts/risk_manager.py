# -*- coding: utf-8 -*-
"""
TRADEAI — RiskManager
Implements Volatility-Adjusted Trailing Stop (using ATR) and dynamic microsecond Position Sizing.
"""

import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RiskManager")

class RiskManager:
    """
    Gerenciador de Risco de alta frequência para robôs de trading quantitativo.
    Contém um Kill Switch projetado para liquidar posições imediatamente a mercado
    em caso de drawdown extremo ou violação de trailing stop baseado em volatilidade (ATR).
    """
    def __init__(self, capital: float, max_loss_pct: float = 0.02, atr_multiplier: float = 2.5, connector = None):
        self.capital = capital
        self.max_loss_pct = max_loss_pct
        self.atr_multiplier = atr_multiplier
        self.connector = connector
        self.position = None # Contém dict: {'symbol': str, 'entry_price': float, 'qty': float, 'active': bool}
        self.market_orders = [] # Histórico de ordens emitidas
        self.reaction_time_ns = None # Tempo de reação medido em nanosegundos
        
        # Volatility Trailing Stop state
        self.highest_price = None
        self.trailing_stop_price = None

    def calculate_position_size(self, capital: float, entry_price: float, atr: float, risk_pct: float = 0.01) -> float:
        """
        Mapeia e dimensiona o tamanho da posição com base na volatilidade ATR do mercado (Position Sizing).
        Execução em microssegundos para HFT.
        """
        if atr <= 0:
            # Fallback seguro caso o ATR seja nulo ou inválido (2% de distância de stop)
            stop_loss_distance = entry_price * 0.02
        else:
            stop_loss_distance = atr * self.atr_multiplier
            
        capital_at_risk = capital * risk_pct
        quantity = capital_at_risk / stop_loss_distance
        return quantity

    def open_position(self, entry_price: float, qty: float, symbol: str = "BTCUSDT", initial_atr: float = 0.0, side: str = "LONG"):
        """
        Abre uma posição LONG ou SHORT e define os parâmetros do trailing stop dinâmico.
        """
        self.position = {
            'symbol': symbol,
            'entry_price': entry_price,
            'qty': qty,
            'side': side.upper(),
            'active': True
        }
        self.reaction_time_ns = None
        self.best_price = entry_price
        self.highest_price = entry_price
        
        distance = (initial_atr * self.atr_multiplier) if initial_atr > 0 else (entry_price * self.max_loss_pct)
        if self.position['side'] == 'LONG':
            self.trailing_stop_price = entry_price - distance
            logger.info(f"Posição aberta: {symbol} (LONG) | Entrada = {entry_price}, Qtd = {qty}, StopInicial = {self.trailing_stop_price:.2f}")
        else:
            self.trailing_stop_price = entry_price + distance
            logger.info(f"Posição aberta: {symbol} (SHORT) | Entrada = {entry_price}, Qtd = {qty}, StopInicial = {self.trailing_stop_price:.2f}")

    async def on_tick(self, price: float, current_atr: float = 0.0):
        """
        Monitora o risco a cada tick recebido.
        Se o preço romper o trailing stop dinâmico (ATR) ou o limite fixo, dispara o Kill Switch.
        """
        start_time = time.perf_counter_ns()
        
        if not self.position or not self.position['active']:
            return

        entry_price = self.position['entry_price']
        side = self.position['side']
        
        distance = (current_atr * self.atr_multiplier) if current_atr > 0 else (price * self.max_loss_pct)
        
        if side == 'LONG':
            if price > self.best_price:
                self.best_price = price
                self.highest_price = price
                self.trailing_stop_price = self.best_price - distance
            if price <= self.trailing_stop_price:
                loss_pct = (entry_price - price) / entry_price
                await self._trigger_kill_switch(price, loss_pct, start_time)
        else: # SHORT
            if price < self.best_price:
                self.best_price = price
                self.trailing_stop_price = self.best_price + distance
            if price >= self.trailing_stop_price:
                loss_pct = (price - entry_price) / entry_price
                await self._trigger_kill_switch(price, loss_pct, start_time)

    async def _trigger_kill_switch(self, trigger_price: float, actual_loss_pct: float, start_time_ns: int):
        """
        Dispara a ordem a mercado imediatamente para fechar a posição.
        """
        # Desativa a posição imediatamente
        self.position['active'] = False
        
        if self.connector:
            try:
                logger.warning(f"🚨 DISPARANDO LIQUIDAÇÃO DE RISCO REAL PARA {self.position['symbol']}...")
                order = await self.connector.create_order(
                    symbol=self.position['symbol'],
                    side='SELL',
                    type='MARKET',
                    quantity=self.position['qty']
                )
                self.market_orders.append(order)
            except Exception as e:
                logger.error(f"❌ CRITICAL: Falha ao enviar ordem do Kill Switch: {e}")
        else:
            # Simula o envio de uma ordem a mercado em modo de teste off-line
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
            f"🚨 KILL SWITCH ATIVADO! Stop violado a {trigger_price}. "
            f"Ordem de Mercado emitida. Tempo de reação: {self.reaction_time_ns / 1_000_000:.4f} ms."
        )
