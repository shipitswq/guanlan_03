"""
策略基类 — 所有策略继承此类
"""
from enum import Enum
from typing import Optional
import pandas as pd


class SignalType(Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"


class Signal:
    """交易信号"""
    def __init__(self, signal_type: SignalType, price: float = 0,
                 reason: str = "", timestamp: str = "",
                 position_target: Optional[float] = None):
        """
        position_target: 目标仓位比例
          - None 或 1.0 = 满仓/全平（默认）
          - 0.5 = 半仓
          - 0.0 = 空仓/清仓
        买入时: target 为预期持仓比例（相对初始资金）
        卖出时: target 为预期持仓比例（相对当前持仓）
        """
        self.type = signal_type
        self.price = price
        self.reason = reason
        self.timestamp = timestamp
        self.position_target = position_target

    def to_dict(self):
        return {
            "type": self.type.value,
            "price": self.price,
            "reason": self.reason,
            "timestamp": self.timestamp,
            "position_target": self.position_target,
        }


class BaseStrategy:
    """策略基类"""

    def __init__(self, name: str = "", params: dict = None):
        self.name = name or self.__class__.__name__
        self.params = params or {}

    def on_data(self, df: pd.DataFrame) -> Signal:
        """
        核心方法: 输入K线数据，输出交易信号
        df 必须包含: open, high, low, close, volume, date
        返回: Signal (buy / sell / hold)
        """
        raise NotImplementedError

    def get_meta(self) -> dict:
        """策略元信息"""
        return {
            "name": self.name,
            "params": self.params,
            "class": self.__class__.__name__,
        }
