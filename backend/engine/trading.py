"""
模拟交易引擎 — 实时接收行情，运行策略，执行模拟交易
每个注册策略独立管理资金，无共享现金池
"""
import asyncio
import logging
import time
from datetime import datetime, time as dt_time
from typing import Optional, Callable
from threading import Thread

from backend.data import DataService
from backend.strategies import BaseStrategy, SignalType
from backend.models.database import TradeRecord, TradeLog, get_session

logger = logging.getLogger("quant.trading")


class SimTradingEngine:
    """模拟交易引擎 — 每策略独立资金"""

    def __init__(self, data_service: Optional[DataService] = None):
        self.data = data_service or DataService()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._on_event: Optional[Callable] = None
        self._thread: Optional[Thread] = None
        self._active_strategies: dict[str, dict] = {}  # {symbol: {strategy, config, cash, capital, position}}

    def set_event_callback(self, callback: Callable):
        self._on_event = callback

    def _emit_event(self, event_type: str, data: dict):
        event = {
            "event_type": event_type,
            "timestamp": datetime.now().isoformat(),
            "data": data,
        }
        if self._on_event:
            try: self._on_event(event)
            except Exception as e: logger.error(f"事件推送失败: {e}")

    def register_strategy(self, symbol: str, strategy: BaseStrategy, config: dict = None):
        conf = config or {}
        capital = conf.get("capital", 100000.0)
        info = self.data.get_stock_info(symbol)
        self._active_strategies[symbol] = {
            "strategy": strategy,
            "config": conf,
            "name": info.get("name", symbol),
            "cash": capital,
            "capital": capital,
        }
        logger.info(f"注册策略 [{strategy.name}] → {symbol}({info.get('name','')}) 资金={capital:.0f}")

    def unregister_strategy(self, symbol: str):
        if symbol in self._active_strategies:
            del self._active_strategies[symbol]
            logger.info(f"取消注册策略 → {symbol}")

    def get_active_strategies(self) -> list[dict]:
        return [{"symbol": k,
                 "strategy_name": v["strategy"].name,
                 "stock_name": v.get("name", ""),
                 "freq": v.get("config", {}).get("freq", "daily"),
                 "params": v.get("config", {}).get("params"),
                 "capital": v.get("capital", 0),
                 "cash": round(v.get("cash", 0), 2),
                 }
                for k, v in self._active_strategies.items()]

    def get_portfolio(self) -> dict:
        """组合概览：各策略净值之和"""
        total_value = 0
        total_pnl = 0
        total_initial = 0
        positions_detail = []

        for symbol, stg in self._active_strategies.items():
            cash = stg.get("cash", 0)
            stg_capital = stg.get("capital", 0)
            mkt_val = 0
            # 如果有持仓，计算市值
            pos = stg.get("position")
            if pos and pos["quantity"] > 0:
                quote = self.data.get_realtime_quote([symbol])
                current_price = quote.get(symbol, {}).get("price", pos.get("avg_price", 0))
                mkt_val = pos["quantity"] * current_price
                cost = pos["quantity"] * pos["avg_price"]
                pnl = mkt_val - cost
                positions_detail.append({
                    "symbol": symbol,
                    "name": stg.get("name", ""),
                    "quantity": pos["quantity"],
                    "avg_price": round(pos["avg_price"], 2),
                    "current_price": round(current_price, 2),
                    "market_value": round(mkt_val, 2),
                    "cost": round(cost, 2),
                    "pnl": round(pnl, 2),
                    "pnl_pct": round((pnl / cost) * 100, 2) if cost > 0 else 0,
                    "updated_at": pos.get("updated_at", ""),
                })

            net = cash + mkt_val
            total_value += net
            total_initial += stg_capital
            total_pnl += net - stg_capital

        return {
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_return_pct": round((total_pnl / total_initial) * 100, 2) if total_initial > 0 else 0,
            "positions": positions_detail,
        }

    async def execute_tick(self):
        if not self._active_strategies:
            return

        symbols = list(self._active_strategies.keys())
        quotes = self.data.get_realtime_quote(symbols)
        self._emit_event("info", {"type": "tick", "symbols": list(quotes.keys())})

        for symbol, stg in list(self._active_strategies.items()):
            try:
                strategy = stg["strategy"]
                freq = stg.get("config", {}).get("freq", "daily")
                df = self.data.get_kline(symbol, freq=freq, count=200)
                if df.empty or len(df) < 50:
                    continue

                signal = strategy.on_data(df)
                current_price = float(df["close"].iloc[-1])
                current_date = str(df["date"].iloc[-1])

                self._emit_event("signal", {
                    "symbol": symbol, "name": stg.get("name", ""),
                    "signal": signal.type.value, "price": current_price,
                    "reason": signal.reason, "date": current_date,
                })

                if signal.type == SignalType.BUY:
                    await self._execute_buy(symbol, stg, current_price, signal.reason)
                elif signal.type == SignalType.SELL:
                    await self._execute_sell(symbol, stg, current_price, signal.reason)

            except Exception as e:
                logger.error(f"策略执行失败 {symbol}: {e}")
                self._emit_event("error", {"symbol": symbol, "error": str(e)})

    async def _execute_buy(self, symbol: str, stg: dict, price: float, reason: str):
        cash = stg.get("cash", 0)
        if cash <= 0:
            return
        quantity = int(cash / price / 100) * 100
        if quantity <= 0:
            return
        cost = round(quantity * price, 2)
        stg["cash"] = cash - cost

        pos = stg.get("position")
        if pos and pos["quantity"] > 0:
            total_qty = pos["quantity"] + quantity
            total_cost = pos["quantity"] * pos["avg_price"] + cost
            pos["avg_price"] = total_cost / total_qty
            pos["quantity"] = total_qty
        else:
            stg["position"] = {
                "quantity": quantity, "avg_price": price,
                "name": stg.get("name", ""),
                "updated_at": datetime.now().isoformat(),
            }

        trade_data = {"symbol": symbol, "direction": "buy", "price": price,
                      "quantity": quantity, "amount": cost,
                      "trade_time": datetime.now().isoformat(), "reason": reason}
        try:
            session = get_session()
            session.add(TradeRecord(**trade_data))
            session.commit(); session.close()
        except Exception as e:
            logger.error(f"保存交易记录失败: {e}")
        logger.info(f"BUY {symbol}: {quantity}股 @ {price} = {cost}元 | {reason}")
        self._emit_event("order", {"type": "buy", **trade_data})

    async def _execute_sell(self, symbol: str, stg: dict, price: float, reason: str):
        pos = stg.get("position")
        if not pos or pos["quantity"] <= 0:
            return
        quantity = pos["quantity"]
        revenue = round(quantity * price, 2)
        pnl = revenue - (quantity * pos["avg_price"])
        stg["cash"] = stg.get("cash", 0) + revenue

        trade_time = datetime.now().isoformat()
        trade_data = {"symbol": symbol, "direction": "sell", "price": price,
                      "quantity": quantity, "amount": revenue,
                      "trade_time": trade_time, "reason": reason, "pnl": round(pnl, 2)}
        stg["position"] = {"quantity": 0, "avg_price": 0, "name": stg.get("name", ""), "updated_at": trade_time}
        del stg["position"]

        try:
            session = get_session()
            session.add(TradeRecord(**trade_data))
            session.commit(); session.close()
        except Exception as e:
            logger.error(f"保存交易记录失败: {e}")
        logger.info(f"SELL {symbol}: {quantity}股 @ {price} = {revenue}元 PnL={pnl:.2f} | {reason}")
        self._emit_event("order", {"type": "sell", **trade_data})

    # ── 后台运行 ──
    def start(self, interval_seconds: int = 60):
        if self._running: return
        self._running = True
        self._thread = Thread(target=self._run_loop, args=(interval_seconds,), daemon=True)
        self._thread.start()
        logger.info(f"模拟交易引擎已启动 (轮询间隔: {interval_seconds}s)")

    def stop(self):
        self._running = False
        logger.info("模拟交易引擎已停止")

    def _run_loop(self, interval: int):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        while self._running:
            try:
                now = datetime.now()
                if now.weekday() < 5:
                    market_open = dt_time(9, 25)
                    market_close = dt_time(15, 5)
                    if market_open <= now.time() <= market_close:
                        loop.run_until_complete(self.execute_tick())
            except Exception as e:
                logger.error(f"轮询异常: {e}")
            for _ in range(interval):
                if not self._running: break
                time.sleep(1)
        loop.close()
