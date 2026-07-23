"""
选股扫描器 API — 对所有A股执行策略，筛选出符合买入条件的标的
"""
import logging
import threading
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.data import DataService
from backend.strategies import BuiltinStrategies

router = APIRouter(prefix="/api/screener", tags=["screener"])
logger = logging.getLogger("quant.screener")

# 扫描进度（线程安全）
_scan_state = {"total": 0, "scanned": 0, "running": False}
_scan_lock = threading.Lock()


class ScanRequest(BaseModel):
    strategy_code: str = "cool_ma"
    params: Optional[dict] = None
    freq: str = "daily"
    lookback: int = 1


@router.post("/scan")
def scan_stocks(req: ScanRequest):
    """扫描全市场"""
    global _scan_state
    ds = DataService()
    strategy = BuiltinStrategies.get(req.strategy_code, req.params)

    # 1. 获取股票列表
    stocks = _get_stock_list(ds)
    stocks.sort(key=lambda s: (0 if s["code"][:3] == "159" or s["code"][:2] == "51" else 1))

    # 2. 初始化进度
    with _scan_lock:
        _scan_state["total"] = len(stocks)
        _scan_state["scanned"] = 0
        _scan_state["running"] = True

    # 3. 并行扫描
    results = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        fut_map = {}
        for s in stocks:
            fut = pool.submit(_check_stock, strategy, s["code"], s["name"], req.freq, req.lookback)
            fut_map[fut] = s

        for fut in as_completed(fut_map):
            with _scan_lock:
                _scan_state["scanned"] += 1
            try:
                r = fut.result(timeout=30)
                if r:
                    results.append(r)
            except Exception:
                pass

    with _scan_lock:
        _scan_state["running"] = False

    results.sort(key=lambda x: x.get("score", 0), reverse=True)
    return {"count": len(results), "results": results[:100]}


@router.get("/progress")
def scan_progress():
    """获取当前扫描进度"""
    with _scan_lock:
        return dict(_scan_state)


def _get_stock_list(ds: DataService) -> list[dict]:
    """获取沪深A股 + ETF 清单"""
    stocks = []
    try:
        df = ds.tdx.stocks(market=0)
        for _, row in df.iterrows():
            code = str(row["code"])
            name = str(row["name"]).strip().replace("\x00", "")
            if len(code) == 6 and len(name) > 1 and "指数" not in name and "DR" not in name:
                if code[0] in "023" or code[:3] == "159":
                    stocks.append({"code": code, "name": name})
    except Exception:
        pass
    try:
        df = ds.tdx.stocks(market=1)
        for _, row in df.iterrows():
            code = str(row["code"])
            name = str(row["name"]).strip().replace("\x00", "")
            if len(code) == 6 and len(name) > 1 and "指数" not in name and "DR" not in name:
                if code[0] == "6" or code[:2] == "51":
                    stocks.append({"code": code, "name": name})
    except Exception:
        pass
    return stocks


def _check_stock(strategy, code: str, name: str, freq: str, lookback: int = 1) -> Optional[dict]:
    """对单只股票运行策略，返回买入信号结果"""
    local_ds = DataService()
    df = local_ds.get_kline(code, freq=freq, count=80)
    if df.empty or len(df) < 25:
        return None
    for offset in range(lookback):
        idx = len(df) - offset
        if idx < 25:
            break
        window = df.iloc[:idx].reset_index(drop=True)
        signal = strategy.on_data(window)
        if signal.type.value == "buy":
            bar = df.iloc[idx - 1]
            close = float(bar["close"])
            score = round((close - float(df["close"].iloc[-5])) / float(df["close"].iloc[-5]) * 100, 2) if len(df) >= 5 else 0
            return {
                "code": code, "name": name,
                "price": round(close, 4),
                "signal": signal.reason or "买入信号",
                "date": str(bar["date"]) if "date" in df.columns else "",
                "score": score,
            }
    return None
