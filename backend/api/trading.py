"""
模拟交易 API
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.engine.trading import SimTradingEngine
from backend.strategies import BuiltinStrategies
from backend.models.database import TradeRecord, get_session

router = APIRouter(prefix="/api/trading", tags=["trading"])


class RegisterStrategyRequest(BaseModel):
    symbol: str
    strategy_code: str
    params: Optional[dict] = None
    capital: Optional[float] = None
    freq: str = "daily"


# 全局交易引擎实例（由 main.py 注入）
trading_engine: Optional[SimTradingEngine] = None

def set_engine(engine: SimTradingEngine):
    global trading_engine
    trading_engine = engine


@router.post("/register")
def register_strategy(req: RegisterStrategyRequest):
    """注册策略到模拟盘"""
    if not trading_engine:
        raise HTTPException(500, "交易引擎未初始化")

    try:
        strategy = BuiltinStrategies.get(req.strategy_code, req.params)
    except ValueError as e:
        raise HTTPException(400, str(e))

    config = {
        "freq": req.freq,
        "params": req.params,
        "capital": req.capital or 100000.0,
    }

    trading_engine.register_strategy(req.symbol, strategy, config)
    return {"message": f"策略 [{strategy.name}] 已注册到 {req.symbol}"}


@router.post("/unregister")
def unregister_strategy(symbol: str):
    """取消注册策略"""
    if not trading_engine:
        raise HTTPException(500, "交易引擎未初始化")
    trading_engine.unregister_strategy(symbol)
    return {"message": f"已取消注册 {symbol}"}


@router.post("/update")
def update_strategy(req: RegisterStrategyRequest):
    """更新已注册策略的参数"""
    if not trading_engine:
        raise HTTPException(500, "交易引擎未初始化")
    if req.symbol not in trading_engine._active_strategies:
        raise HTTPException(404, f"{req.symbol} 未注册策略")
    old = trading_engine._active_strategies[req.symbol]
    new_config = {**old.get("config", {}), "freq": req.freq, "params": req.params}
    try:
        strategy = BuiltinStrategies.get(req.strategy_code, req.params)
    except ValueError as e:
        raise HTTPException(400, str(e))
    trading_engine._active_strategies[req.symbol] = {
        "strategy": strategy,
        "config": new_config,
        "name": old.get("name", req.symbol),
    }
    return {"message": f"策略 {req.symbol} 已更新"}


@router.get("/active")
def get_active_strategies():
    """获取当前运行策略"""
    if not trading_engine:
        raise HTTPException(500, "交易引擎未初始化")
    return {"strategies": trading_engine.get_active_strategies()}


@router.get("/portfolio")
def get_portfolio():
    """获取持仓概览"""
    if not trading_engine:
        raise HTTPException(500, "交易引擎未初始化")
    return trading_engine.get_portfolio()


@router.post("/start")
def start_engine(interval: int = 60):
    """启动模拟盘"""
    if not trading_engine:
        raise HTTPException(500, "交易引擎未初始化")
    trading_engine.start(interval)
    return {"message": f"模拟盘已启动 (轮询间隔: {interval}s)"}


@router.post("/stop")
def stop_engine():
    """停止模拟盘"""
    if not trading_engine:
        raise HTTPException(500, "交易引擎未初始化")
    trading_engine.stop()
    return {"message": "模拟盘已停止"}


@router.get("/status")
def engine_status():
    """获取引擎状态"""
    if not trading_engine:
        return {"running": False, "active_strategies": 0}
    return {
        "running": trading_engine._running,
        "active_strategies": len(trading_engine._active_strategies),
    }


@router.get("/trades")
def get_trade_history(limit: int = 50):
    """获取交易历史"""
    session = get_session()
    try:
        trades = session.query(TradeRecord)\
            .order_by(TradeRecord.created_at.desc())\
            .limit(limit).all()
        return {"trades": [
            {
                "id": t.id, "symbol": t.symbol,
                "direction": t.direction, "price": t.price,
                "quantity": t.quantity, "amount": t.amount,
                "trade_time": t.trade_time,
                "reason": t.reason,
                "strategy_name": t.strategy_name,
            }
            for t in trades
        ]}
    finally:
        session.close()
