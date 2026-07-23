"""
回测引擎 — 在历史数据上运行策略，计算绩效指标
"""
import pandas as pd
import numpy as np
from typing import Optional
from datetime import datetime

from backend.strategies import BaseStrategy, SignalType
from backend.data import DataService


class BacktestEngine:
    """回测引擎"""

    def __init__(self, data_service: Optional[DataService] = None):
        self.data = data_service or DataService()

    def run(self, strategy: BaseStrategy, symbol: str,
            start_date: str = "", end_date: str = "",
            initial_capital: float = 100000.0,
            freq: str = "daily") -> dict:
        """
        执行回测
        返回: 回测结果dict（含指标、净值曲线、交易明细）
        """
        # 1. 确定预热期: 从策略参数中提取最长的MA/指标周期
        params = strategy.params or {}
        # 可能包含周期值的字段名
        period_keys = ['slow', 'period', 'mid', 'fast', 'signal']
        found_periods = [params[k] for k in period_keys if isinstance(params.get(k), (int, float))]
        longest = max(found_periods) if found_periods else 20
        warmup = max(int(longest) - 1, 5)  # 预热期 = 最长周期-1（让刚满的MA能参与首次金叉）

        # 2. 获取K线数据
        df = self.data.get_kline(symbol, freq=freq, count=800)
        if df.empty:
            return {"error": f"获取{symbol}K线数据失败"}

        # 过滤日期范围
        if start_date:
            df = df[df["date"] >= start_date]
        if end_date:
            df = df[df["date"] <= end_date]
        if len(df) < warmup + 5:
            return {"error": f"数据不足({len(df)}根)，至少需要{warmup + 5}根K线"}

        # 2. 逐根K线模拟交易
        position = 0           # 持仓数量
        cash = initial_capital  # 现金
        trades = []             # 交易明细
        equity_curve = []       # 净值曲线
        signal_events = []      # 所有策略信号（含未成交的）
        prev_signal = SignalType.HOLD
        entry_price = 0.0       # 持仓成本价（用于止损判断）
        stop_loss = params.get("stop_loss", 0)  # 止损%(0=关闭)

        for idx in range(warmup, len(df)):
            window = df.iloc[:idx + 1].reset_index(drop=True)
            signal = strategy.on_data(window)

            current_row = df.iloc[idx]
            date = str(current_row["date"])
            close = float(current_row["close"])

            # 记录净值
            market_value = position * close
            total_value = cash + market_value
            equity_curve.append({
                "date": date,
                "total_value": round(total_value, 2),
                "cash": round(cash, 2),
                "position_value": round(market_value, 2),
                "position": position,
                "price": close,
            })

            executed = False

            # ── 止损检查 ──
            if stop_loss > 0 and position > 0 and entry_price > 0:
                loss_pct = (close - entry_price) / entry_price * 100
                if loss_pct <= -stop_loss:
                    revenue = position * close
                    trades.append({
                        "date": date, "price": close,
                        "quantity": position, "amount": round(revenue, 2),
                        "direction": "sell", "reason": f"止损{loss_pct:.1f}%",
                    })
                    cash += revenue
                    position = 0
                    entry_price = 0.0
                    executed = True
                    prev_signal = SignalType.SELL
                    # 记录止损信号
                    signal_events.append({
                        "date": date, "price": close,
                        "direction": "sell", "reason": f"止损触发({loss_pct:.1f}%)",
                        "executed": True,
                        "reason_detail": "硬性止损",
                    })
                    continue

            # ── 执行买入 ──
            if signal.type == SignalType.BUY and prev_signal != SignalType.BUY:
                if cash > 0:
                    # 确定买入金额: position_target 控制仓位比例
                    if signal.position_target is None or signal.position_target >= 1.0:
                        buy_cash = cash  # 满仓
                    else:
                        buy_cash = cash * signal.position_target  # 半仓/部分
                    quantity = int(buy_cash / close / 100) * 100  # 整手
                    if quantity > 0:
                        cost = quantity * close
                        cash -= cost
                        position += quantity
                        target_label = "满仓" if (signal.position_target is None or signal.position_target >= 1.0) else f"{int(signal.position_target*100)}%仓"
                        trades.append({
                            "date": date, "price": close,
                            "quantity": quantity, "amount": round(cost, 2),
                            "direction": "buy", "reason": f"{target_label} {signal.reason}",
                        })
                        executed = True
                        prev_signal = SignalType.BUY
                        entry_price = close

            # ── 执行卖出 ──
            elif signal.type == SignalType.SELL and prev_signal != SignalType.SELL:
                if position > 0:
                    # 确定卖出比例
                    if signal.position_target is None or signal.position_target <= 0:
                        sell_qty = position  # 全平
                    else:
                        sell_qty = max(int(position * signal.position_target), 0)  # 卖部分
                        # 不足1手则全卖
                        if sell_qty > 0 and sell_qty < 100:
                            sell_qty = position
                    if sell_qty > 0:
                        revenue = sell_qty * close
                        trades.append({
                            "date": date, "price": close,
                            "quantity": sell_qty, "amount": round(revenue, 2),
                            "direction": "sell", "reason": signal.reason,
                        })
                        cash += revenue
                        position -= sell_qty
                        executed = True
                        prev_signal = SignalType.SELL
                        entry_price = 0.0

            # 记录所有 BUY/SELL 信号（含未成交的）
            if signal.type in (SignalType.BUY, SignalType.SELL):
                if signal.type == SignalType.BUY:
                    detail = "有可用资金" if executed else "资金不足/无可用资金"
                else:
                    detail = "有持仓可平" if executed else "无持仓可平"
                signal_events.append({
                    "date": date,
                    "price": close,
                    "direction": signal.type.value,
                    "reason": signal.reason,
                    "executed": executed,
                    "reason_detail": detail,
                })

        # 3. 计算绩效指标
        if len(equity_curve) < 2:
            return {"error": "回测数据不足"}

        final_value = equity_curve[-1]["total_value"]
        total_return = (final_value - initial_capital) / initial_capital * 100

        # 年化收益率
        days = (pd.to_datetime(equity_curve[-1]["date"]) -
                pd.to_datetime(equity_curve[0]["date"])).days
        years = max(days / 365, 0.01)
        annual_return = ((1 + total_return / 100) ** (1 / years) - 1) * 100

        # 最大回撤
        values = [e["total_value"] for e in equity_curve]
        peak = values[0]
        max_dd = 0
        for v in values:
            if v > peak:
                peak = v
            dd = (peak - v) / peak * 100
            if dd > max_dd:
                max_dd = dd

        # 胜率和盈亏比
        win_count = 0
        total_profit = 0
        total_loss = 0
        for i in range(0, len(trades), 2):
            if i + 1 < len(trades):
                buy_t = trades[i]
                sell_t = trades[i + 1]
                profit = sell_t["amount"] - buy_t["amount"]
                if profit > 0:
                    win_count += 1
                    total_profit += profit
                else:
                    total_loss += abs(profit)

        trade_pairs = len(trades) // 2
        win_rate = (win_count / trade_pairs * 100) if trade_pairs > 0 else 0
        profit_factor = (total_profit / total_loss) if total_loss > 0 else float("inf")

        # 夏普比率（简化版）
        returns = []
        for i in range(1, len(values)):
            r = (values[i] - values[i-1]) / values[i-1]
            returns.append(r)
        sharpe = (np.mean(returns) / np.std(returns) * np.sqrt(252)) if np.std(returns) > 0 else 0

        # 4. 计算持仓不动收益率（基准）
        first_close_bt = float(df.iloc[warmup]["close"])
        last_close_bt = float(df.iloc[-1]["close"])
        hold_qty = int(initial_capital / first_close_bt / 100) * 100
        if hold_qty > 0:
            hold_cost = hold_qty * first_close_bt
            hold_revenue = hold_qty * last_close_bt
            hold_return = (hold_revenue - hold_cost) / hold_cost * 100
        else:
            hold_return = (last_close_bt - first_close_bt) / first_close_bt * 100

        # 获取股票名称
        stock_name = ""
        try:
            info = self.data.get_stock_info(symbol)
            stock_name = info.get("name", "")
        except:
            pass

        return {
            "strategy": strategy.get_meta(),
            "symbol": symbol,
            "stock_name": stock_name,
            "start_date": equity_curve[0]["date"],
            "end_date": equity_curve[-1]["date"],
            "initial_capital": initial_capital,
            "total_return": round(total_return, 2),
            "hold_return": round(hold_return, 2),
            "annual_return": round(annual_return, 2),
            "max_drawdown": round(max_dd, 2),
            "win_rate": round(win_rate, 2),
            "total_trades": len(trades),
            "trade_pairs": trade_pairs,
            "sharpe_ratio": round(sharpe, 2),
            "profit_factor": round(profit_factor, 2) if profit_factor != float("inf") else None,
            "equity_curve": equity_curve,
            "trade_details": trades,
            "freq": freq,
            "signal_events": signal_events,
        }
