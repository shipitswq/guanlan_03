"""
数据查询 API
"""
from fastapi import APIRouter, Query
from typing import Optional

from backend.data import DataService

router = APIRouter(prefix="/api/data", tags=["data"])
data_service = DataService()


@router.get("/quote")
def get_quote(codes: str = Query(..., description="逗号分隔的股票代码")):
    """获取实时行情"""
    code_list = [c.strip() for c in codes.split(",")]
    result = data_service.get_realtime_quote(code_list)
    return {"quotes": result}


@router.get("/kline")
def get_kline(code: str = Query(...), freq: str = "daily", count: int = 200):
    """获取K线数据"""
    df = data_service.get_kline(code, freq=freq, count=count)
    if df.empty:
        return {"error": f"获取{code}K线数据失败"}
    return {
        "symbol": code,
        "freq": freq,
        "count": len(df),
        "data": df.to_dict(orient="records"),
    }


@router.get("/orderbook")
def get_orderbook(code: str = Query(...)):
    """获取五档盘口"""
    ob = data_service.get_order_book(code)
    if not ob:
        return {"error": f"获取{code}盘口数据失败"}
    return ob


@router.get("/stock-info")
def get_stock_info(code: str = Query(...)):
    """获取股票基本信息"""
    info = data_service.get_stock_info(code)
    return info


@router.get("/search")
def search_stock(keyword: str = Query(...)):
    """搜索股票"""
    results = data_service.search_stock(keyword)
    return {"results": results}


@router.get("/finance")
def get_finance(code: str = Query(...)):
    """获取财务快照"""
    fin = data_service.get_finance(code)
    return fin
