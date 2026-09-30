# -*- coding: utf-8 -*-
"""
TRADEAI — Incremental Technical Indicator Engine
Uses O(1) incremental math to update indicators per-tick/per-candle.
"""

import math
from collections import deque

class IncrementalIndicatorEngine:
    """
    Engine de cálculo incremental de indicadores técnicos com complexidade O(1).
    Evita recalcular dados históricos a cada tick/candle novo, poupando processamento de CPU.
    """
    def __init__(self, ema_fast_period=12, ema_slow_period=26, macd_signal_period=9, rsi_period=14, atr_period=14):
        self.ema_fast_period = ema_fast_period
        self.ema_slow_period = ema_slow_period
        self.macd_signal_period = macd_signal_period
        self.rsi_period = rsi_period
        self.atr_period = atr_period
        
        # Alphas de suavização
        self.alpha_fast = 2.0 / (ema_fast_period + 1.0)
        self.alpha_slow = 2.0 / (ema_slow_period + 1.0)
        self.alpha_signal = 2.0 / (macd_signal_period + 1.0)
        
        # Estado dos indicadores
        self.ema_fast = None
        self.ema_slow = None
        self.macd_line = None
        self.macd_signal = None
        
        self.rsi_avg_gain = None
        self.rsi_avg_loss = None
        self.rsi = 50.0
        
        self.atr = 0.0
        self.prev_close = None
        self.count = 0

    def update(self, close_price: float, high_price: float = None, low_price: float = None) -> dict:
        """
        Atualiza e retorna o estado de todos os indicadores em tempo de complexidade O(1).
        """
        self.count += 1
        
        if high_price is None:
            high_price = close_price
        if low_price is None:
            low_price = close_price
            
        # 1. Atualização incremental das EMAs e MACD
        if self.ema_fast is None:
            self.ema_fast = close_price
            self.ema_slow = close_price
            self.macd_line = 0.0
            self.macd_signal = 0.0
        else:
            self.ema_fast = close_price * self.alpha_fast + self.ema_fast * (1.0 - self.alpha_fast)
            self.ema_slow = close_price * self.alpha_slow + self.ema_slow * (1.0 - self.alpha_slow)
            self.macd_line = self.ema_fast - self.ema_slow
            self.macd_signal = self.macd_line * self.alpha_signal + self.macd_signal * (1.0 - self.alpha_signal)

        # 2. Atualização incremental do RSI (Wilder's Smooth)
        if self.prev_close is not None:
            change = close_price - self.prev_close
            gain = max(0.0, change)
            loss = max(0.0, -change)
            
            if self.rsi_avg_gain is None:
                self.rsi_avg_gain = gain
                self.rsi_avg_loss = loss
            else:
                self.rsi_avg_gain = (self.rsi_avg_gain * (self.rsi_period - 1) + gain) / self.rsi_period
                self.rsi_avg_loss = (self.rsi_avg_loss * (self.rsi_period - 1) + loss) / self.rsi_period
                
            if self.rsi_avg_loss == 0.0:
                self.rsi = 100.0 if self.rsi_avg_gain > 0.0 else 50.0
            else:
                rs = self.rsi_avg_gain / self.rsi_avg_loss
                self.rsi = 100.0 - (100.0 / (1.0 + rs))
                
        # 3. Atualização incremental do ATR (Wilder's Smooth)
        if self.prev_close is not None:
            tr = max(
                high_price - low_price,
                abs(high_price - self.prev_close),
                abs(low_price - self.prev_close)
            )
            if self.count <= self.atr_period:
                self.atr = (self.atr * (self.count - 2) + tr) / (self.count - 1) if self.count > 2 else tr
            else:
                self.atr = (self.atr * (self.atr_period - 1) + tr) / self.atr_period
        else:
            tr = high_price - low_price
            self.atr = tr
            
        self.prev_close = close_price
        
        return {
            "ema_fast": self.ema_fast,
            "ema_slow": self.ema_slow,
            "macd_line": self.macd_line,
            "macd_signal": self.macd_signal,
            "macd_hist": self.macd_line - self.macd_signal,
            "rsi": self.rsi,
            "atr": self.atr
        }
