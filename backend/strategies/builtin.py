"""
内置策略 — 双均线交叉 / RSI / MACD
使用纯 pandas 实现，不依赖 stockstats
"""
import math
import pandas as pd
import numpy as np
from .base import BaseStrategy, Signal, SignalType


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """计算 RSI 指标（纯 pandas）"""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1/period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def compute_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """计算 MACD 指标（纯 pandas）"""
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


class MACrossoverStrategy(BaseStrategy):
    """双均线金叉死叉策略"""

    def __init__(self, params: dict = None):
        p = params or {"fast": 5, "slow": 20}
        super().__init__(name="双均线交叉", params=p)

    def on_data(self, df: pd.DataFrame) -> Signal:
        df = df.copy()
        fast = self.params.get("fast", 5)
        slow = self.params.get("slow", 20)

        if len(df) < slow:
            return Signal(SignalType.HOLD)

        ma_fast = df["close"].rolling(window=fast).mean()
        ma_slow = df["close"].rolling(window=slow).mean()

        fp = round(ma_fast.iloc[-2], 4)
        fc = round(ma_fast.iloc[-1], 4)
        sp = round(ma_slow.iloc[-2], 4)
        sc = round(ma_slow.iloc[-1], 4)

        if pd.isna(fp) or pd.isna(fc) or pd.isna(sc):
            return Signal(SignalType.HOLD)
        sp_valid = not pd.isna(sp)

        price = float(df["close"].iloc[-1])
        date = str(df["date"].iloc[-1]) if "date" in df.columns else ""

        # 金叉: 快线上穿慢线
        if fp <= sp and fc > sc:
            return Signal(SignalType.BUY, price, f"MA{fast}金叉MA{slow}", date)

        # 死叉: 快线下穿慢线
        if fp >= sp and fc < sc:
            return Signal(SignalType.SELL, price, f"MA{fast}死叉MA{slow}", date)

        return Signal(SignalType.HOLD)


class RSIStrategy(BaseStrategy):
    """RSI超买超卖策略"""

    def __init__(self, params: dict = None):
        p = params or {"period": 14, "oversold": 30, "overbought": 70}
        super().__init__(name="RSI反转", params=p)

    def on_data(self, df: pd.DataFrame) -> Signal:
        df = df.copy()
        period = self.params.get("period", 14)
        oversold = self.params.get("oversold", 30)
        overbought = self.params.get("overbought", 70)

        if len(df) < period + 2:
            return Signal(SignalType.HOLD)

        ic = df["close"].copy()
        rsi = compute_rsi(ic, period)
        rsi_prev = round(rsi.iloc[-2], 4)
        rsi_curr = round(rsi.iloc[-1], 4)

        if pd.isna(rsi_prev) or pd.isna(rsi_curr):
            return Signal(SignalType.HOLD)

        price = float(df["close"].iloc[-1])
        date = str(df["date"].iloc[-1]) if "date" in df.columns else ""

        # RSI从超卖区上穿 → 买入
        if rsi_prev < oversold and rsi_curr >= oversold:
            return Signal(SignalType.BUY, price, f"RSI从{oversold}上穿({rsi_curr:.1f})", date)

        # RSI从超买区下穿 → 卖出
        if rsi_prev > overbought and rsi_curr <= overbought:
            return Signal(SignalType.SELL, price, f"RSI从{overbought}下穿({rsi_curr:.1f})", date)

        return Signal(SignalType.HOLD)


class MACDStrategy(BaseStrategy):
    """MACD金叉死叉策略"""

    def __init__(self, params: dict = None):
        p = params or {"fast": 12, "slow": 26, "signal": 9}
        super().__init__(name="MACD金叉死叉", params=p)

    def on_data(self, df: pd.DataFrame) -> Signal:
        df = df.copy()
        fast = self.params.get("fast", 12)
        slow = self.params.get("slow", 26)
        signal = self.params.get("signal", 9)

        if len(df) < slow + signal + 2:
            return Signal(SignalType.HOLD)

        ic = df["close"].copy()
        macd_line, signal_line, _ = compute_macd(ic, fast, slow, signal)

        mp = round(macd_line.iloc[-2], 4)
        mc = round(macd_line.iloc[-1], 4)
        sp = round(signal_line.iloc[-2], 4)
        sc = round(signal_line.iloc[-1], 4)

        if pd.isna(mp) or pd.isna(mc) or pd.isna(sp) or pd.isna(sc):
            return Signal(SignalType.HOLD)

        price = float(df["close"].iloc[-1])
        date = str(df["date"].iloc[-1]) if "date" in df.columns else ""

        # MACD金叉: MACD线上穿信号线
        if mp <= sp and mc > sc:
            return Signal(SignalType.BUY, price, "MACD金叉", date)

        # MACD死叉: MACD线下穿信号线
        if mp >= sp and mc < sc:
            return Signal(SignalType.SELL, price, "MACD死叉", date)

        return Signal(SignalType.HOLD)


class MA135Strategy(BaseStrategy):
    """
    一三五策略
    三线: MA13 / MA34 / MA55
    ┌──────────────────────┬────────────────┐
    │ 触发条件              │ 操作            │
    ├──────────────────────┼────────────────┤
    │ MA13 上穿 MA34 (空仓) │ 买入半仓        │
    │ MA13 上穿 MA55 (半仓) │ 加仓至满仓      │
    │ MA13 下穿 MA34        │ 卖半仓          │
    │ MA13 下穿 MA55        │ 全平仓          │
    └──────────────────────┴────────────────┘
    """

    def __init__(self, params: dict = None):
        p = params or {"fast": 13, "mid": 34, "slow": 55}
        super().__init__(name="一三五", params=p)

    def on_data(self, df: pd.DataFrame) -> Signal:
        df = df.copy()
        fast = self.params.get("fast", 13)
        mid = self.params.get("mid", 34)
        slow = self.params.get("slow", 55)

        if len(df) < slow:
            return Signal(SignalType.HOLD)

        ma_f = df["close"].rolling(window=fast).mean()
        ma_m = df["close"].rolling(window=mid).mean()
        ma_s = df["close"].rolling(window=slow).mean()

        f_prev, f_curr = round(ma_f.iloc[-2], 4), round(ma_f.iloc[-1], 4)
        m_prev, m_curr = round(ma_m.iloc[-2], 4), round(ma_m.iloc[-1], 4)
        s_prev, s_curr = round(ma_s.iloc[-2], 4), round(ma_s.iloc[-1], 4)

        if any(pd.isna(x) for x in [f_prev, f_curr, m_prev, m_curr, s_prev, s_curr]):
            return Signal(SignalType.HOLD)

        price = float(df["close"].iloc[-1])
        date = str(df["date"].iloc[-1]) if "date" in df.columns else ""

        # 交叉检测
        ma13_up_34  = f_prev <= m_prev and f_curr > m_curr   # MA13 上穿 MA34
        ma13_up_55  = f_prev <= s_prev and f_curr > s_curr   # MA13 上穿 MA55
        ma13_dn_34  = f_prev >= m_prev and f_curr < m_curr   # MA13 下穿 MA34
        ma13_dn_55  = f_prev >= s_prev and f_curr < s_curr   # MA13 下穿 MA55

        # 优先级: 清仓 > 减半仓 > 加满仓 > 建半仓
        if ma13_dn_55:
            return Signal(SignalType.SELL, price,
                          f"MA{fast}下穿MA{slow} 全平仓", date,
                          position_target=0.0)

        if ma13_dn_34:
            return Signal(SignalType.SELL, price,
                          f"MA{fast}下穿MA{mid} 卖半仓", date,
                          position_target=0.5)

        if ma13_up_55:
            return Signal(SignalType.BUY, price,
                          f"MA{fast}上穿MA{slow} 加满仓", date,
                          position_target=1.0)

        if ma13_up_34:
            return Signal(SignalType.BUY, price,
                          f"MA{fast}上穿MA{mid} 建半仓", date,
                          position_target=0.5)

        return Signal(SignalType.HOLD)


class CoolMAStrategy(BaseStrategy):
    """
    冷静双均线策略
    金叉买入 / 死叉卖出 / 跌破快线风控 / 跳空风控 / 冷却防假信号

    参数:
      fast: 快线周期 (默认 5)
      slow: 慢线周期 (默认 20)
      below: 连续收盘跌破快线天数 (默认 2)
      below_pct: 跌破快线的幅度%(默认0=只要低过就算, 1=需低过1%)
      cooldown: 卖出后冷却N天不买入 (默认 5)
      gap_exit: 开盘跳空低开超N%则平仓 (默认 0=关闭)
      fast_angle: 快线坡度过滤 (度, 默认0=关闭, MA5坡度小于此不买入)

    信号优先级: 跳空风控 > 死叉 > 跌破风控 > 冷却 > 金叉
    """

    def __init__(self, params: dict = None):
        p = params or {"fast": 5, "slow": 20, "below": 2, "below_pct": 1, "cooldown": 5, "gap_exit": 0}
        super().__init__(name="冷静双均线", params=p)

    def on_data(self, df: pd.DataFrame) -> Signal:
        df = df.copy()
        fast = self.params.get("fast", 5)
        slow = self.params.get("slow", 20)
        below = self.params.get("below", 2)
        vol_confirm = self.params.get("vol_confirm", False)
        vol_threshold = self.params.get("vol_threshold", 1.0)
        cooldown = self.params.get("cooldown", 0)
        gap_exit = self.params.get("gap_exit", 0)
        below_pct = self.params.get("below_pct", 0)
        fast_angle = self.params.get("fast_angle", 0)  # 快线斜率角度(度),0=关闭

        if len(df) < slow:
            return Signal(SignalType.HOLD)

        close = df["close"]
        ma_fast = close.rolling(window=fast).mean()
        ma_slow = close.rolling(window=slow).mean()

        fp = round(ma_fast.iloc[-2], 4)
        fc = round(ma_fast.iloc[-1], 4)
        sp = round(ma_slow.iloc[-2], 4)
        sc = round(ma_slow.iloc[-1], 4)
        cp = float(close.iloc[-1])

        if pd.isna(fp) or pd.isna(fc) or pd.isna(sc):
            return Signal(SignalType.HOLD)
        # 允许 sp 为 NaN（MA20 刚出第一个有效值）
        sp_valid = not pd.isna(sp)

        price = cp
        date = str(df["date"].iloc[-1]) if "date" in df.columns else ""

        # 0. 跳空低开风控（最高优先级）
        if gap_exit > 0 and len(df) >= 2 and 'open' in df.columns:
            prev_close = float(close.iloc[-2])
            curr_open = float(df['open'].iloc[-1])
            if prev_close > 0:
                gap_pct = (curr_open - prev_close) / prev_close * 100
                if gap_pct <= -gap_exit:
                    return Signal(SignalType.SELL, price,
                                  f"跳空低开{gap_pct:.1f}% 风控平仓", date)

        # 1. 死叉 → 平仓
        if fp >= sp and fc < sc:
            return Signal(SignalType.SELL, price, f"MA{fast}死叉MA{slow}", date)

        # 2. 连续收盘跌破快线 → 风控平仓
        consecutive_below = 0
        for i in range(len(df) - 1, -1, -1):
            if pd.isna(ma_fast.iloc[i]):
                break
            threshold = ma_fast.iloc[i] * (1 - below_pct / 100)
            if close.iloc[i] < threshold:
                consecutive_below += 1
            else:
                break

        if consecutive_below >= below:
            reason = f"连续{consecutive_below}日收盘<MA{fast}"
            if below_pct > 0:
                reason += f"超{below_pct}%"
            reason += " 风控平仓"
            return Signal(SignalType.SELL, price, reason, date)

        # 3. 金叉 → 买入（可选量能确认 + 冷却期）
        if (not sp_valid or fp <= sp) and fc > sc:
            # 冷却期检查: 最近 cooldown 天内是否有过死叉
            if cooldown > 0 and len(df) > cooldown + 3:
                has_recent_death = False
                for j in range(1, cooldown + 1):
                    idx = -j - 1
                    if abs(idx) >= len(df):
                        break
                    fp_j = round(ma_fast.iloc[idx-1], 4) if idx-1 >= -len(df) else None
                    fc_j = round(ma_fast.iloc[idx], 4)
                    sp_j = round(ma_slow.iloc[idx-1], 4) if idx-1 >= -len(df) else None
                    sc_j = round(ma_slow.iloc[idx], 4)
                    if not pd.isna(fp_j) and not pd.isna(sp_j):
                        if fp_j >= sp_j and fc_j < sc_j:
                            has_recent_death = True
                            break
                if has_recent_death:
                    return Signal(SignalType.HOLD)

            # 快线斜率过滤: 小于指定角度不参与
            if fast_angle > 0:
                ma5_change_pct = (fc - fp) / abs(fp) * 100
                angle = math.atan(ma5_change_pct) * 180 / math.pi
                if angle < fast_angle:
                    return Signal(SignalType.HOLD)

            if vol_confirm:
                # 量能确认: 当日成交量 > 20日均量
                volume = df["volume"] if "volume" in df.columns else None
                if volume is not None and len(volume) >= 20:
                    avg_vol = volume.iloc[-20:].mean()
                    curr_vol = volume.iloc[-1]
                    vol_ratio = curr_vol / avg_vol if avg_vol > 0 else 1.0
                    if vol_ratio < vol_threshold:
                        return Signal(SignalType.HOLD)
                    return Signal(SignalType.BUY, price,
                                  f"MA{fast}金叉MA{slow} 量比{vol_ratio:.1f}倍", date)
            return Signal(SignalType.BUY, price, f"MA{fast}金叉MA{slow}", date)

        return Signal(SignalType.HOLD)


class BuiltinStrategies:
    """内置策略注册表"""

    _registry = {
        "cool_ma": CoolMAStrategy,
    }

    @classmethod
    def get(cls, code: str, params: dict = None) -> BaseStrategy:
        if code in cls._registry:
            return cls._registry[code](params)
        raise ValueError(f"未知策略: {code}，可选: {list(cls._registry.keys())}")

    @classmethod
    def list_all(cls) -> list[dict]:
        return [{"code": k, "name": v({}).name, "default_params": v({}).params}
                for k, v in cls._registry.items()]
