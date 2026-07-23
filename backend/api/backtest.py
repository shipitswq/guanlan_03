"""
回测 API
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.engine.backtest import BacktestEngine
from backend.strategies import BuiltinStrategies
from backend.models.database import BacktestResult, Strategy, get_session

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


class BacktestRequest(BaseModel):
    strategy_code: str                          # 策略代码 (如 "ma_crossover")
    symbol: str                                 # 标的代码
    params: Optional[dict] = None               # 策略参数
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    initial_capital: float = 100000.0
    freq: str = "daily"


@router.post("/run")
def run_backtest(req: BacktestRequest):
    """执行回测"""
    try:
        strategy = BuiltinStrategies.get(req.strategy_code, req.params)
    except ValueError as e:
        raise HTTPException(400, str(e))

    engine = BacktestEngine()
    result = engine.run(
        strategy=strategy,
        symbol=req.symbol,
        start_date=req.start_date,
        end_date=req.end_date,
        initial_capital=req.initial_capital,
        freq=req.freq,
    )

    if "error" in result:
        raise HTTPException(400, result["error"])

    # 用用户指定的起止日期覆盖回测引擎返回的（引擎返回的是实际第一条K线日期）
    if req.start_date:
        result["start_date"] = req.start_date
    if req.end_date:
        result["end_date"] = req.end_date

    # 保存回测结果
    try:
        session = get_session()
        br = BacktestResult(
            strategy_id=0,
            strategy_name=result["strategy"]["name"],
            symbol=req.symbol,
            start_date=result.get("start_date", ""),
            end_date=result.get("end_date", ""),
            initial_capital=req.initial_capital,
            total_return=result["total_return"],
            annual_return=result["annual_return"],
            max_drawdown=result["max_drawdown"],
            win_rate=result["win_rate"],
            total_trades=result["total_trades"],
            sharpe_ratio=result["sharpe_ratio"],
            profit_factor=result.get("profit_factor"),
            equity_curve=result.get("equity_curve", []),
            trade_details=result.get("trade_details", []),
            hold_return=result.get("hold_return", 0),
            stock_name=result.get("stock_name", ""),
            freq=req.freq,
            signal_events=result.get("signal_events", []),
        )
        session.add(br)
        session.commit()
        result["result_id"] = br.id
        session.close()
    except Exception as e:
        result["save_error"] = str(e)

    return result


@router.get("/history")
def list_backtest_history(limit: int = 20):
    """获取回测历史记录"""
    session = get_session()
    try:
        results = session.query(BacktestResult)\
            .order_by(BacktestResult.created_at.desc())\
            .limit(limit).all()

        return {"results": [
            {
                "id": r.id,
                "strategy_name": r.strategy_name,
                "symbol": r.symbol,
                "start_date": r.start_date,
                "end_date": r.end_date,
                "total_return": r.total_return,
                "annual_return": r.annual_return,
                "max_drawdown": r.max_drawdown,
                "win_rate": r.win_rate,
                "total_trades": r.total_trades,
                "sharpe_ratio": r.sharpe_ratio,
                "initial_capital": r.initial_capital,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                "freq": r.freq,
            }
            for r in results
        ]}
    finally:
        session.close()


@router.get("/history/{result_id}")
def get_backtest_detail(result_id: int):
    """获取回测详情"""
    session = get_session()
    try:
        r = session.query(BacktestResult).filter(BacktestResult.id == result_id).first()
        if not r:
            raise HTTPException(404, "回测结果不存在")
        return {
            "id": r.id, "strategy_name": r.strategy_name, "symbol": r.symbol,
            "start_date": r.start_date, "end_date": r.end_date,
            "initial_capital": r.initial_capital,
            "total_return": r.total_return, "annual_return": r.annual_return,
            "max_drawdown": r.max_drawdown, "win_rate": r.win_rate,
            "total_trades": r.total_trades, "sharpe_ratio": r.sharpe_ratio,
            "profit_factor": r.profit_factor,
            "equity_curve": r.equity_curve,
            "trade_details": r.trade_details,
            "signal_events": r.signal_events,
            "hold_return": r.hold_return,
            "stock_name": r.stock_name,
            "freq": r.freq,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
    finally:
        session.close()
