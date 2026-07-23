"""
策略管理 API
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from backend.models.database import Strategy, get_session
from backend.strategies import BuiltinStrategies

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


class StrategyCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = ""
    params: Optional[dict] = {}
    source_code: Optional[str] = ""


class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    params: Optional[dict] = None
    source_code: Optional[str] = None


@router.get("/builtin")
def list_builtin_strategies():
    """获取内置策略列表"""
    return {"strategies": BuiltinStrategies.list_all()}


@router.post("")
def create_strategy(data: StrategyCreate):
    """创建自定义策略"""
    session = get_session()
    try:
        existing = session.query(Strategy).filter(Strategy.code == data.code).first()
        if existing:
            raise HTTPException(400, f"策略代码 '{data.code}' 已存在")

        strategy = Strategy(
            name=data.name, code=data.code,
            description=data.description,
            params=data.params or {},
            source_code=data.source_code or "",
        )
        session.add(strategy)
        session.commit()
        return {"id": strategy.id, "code": strategy.code, "name": strategy.name}
    finally:
        session.close()


@router.get("")
def list_strategies():
    """获取所有策略"""
    session = get_session()
    try:
        strategies = session.query(Strategy).all()
        return {"strategies": [
            {
                "id": s.id, "name": s.name, "code": s.code,
                "description": s.description, "params": s.params,
                "created_at": s.created_at.isoformat() if s.created_at else "",
            }
            for s in strategies
        ]}
    finally:
        session.close()


@router.get("/{strategy_id}")
def get_strategy(strategy_id: int):
    """获取单个策略详情"""
    session = get_session()
    try:
        s = session.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not s:
            raise HTTPException(404, "策略不存在")
        return {
            "id": s.id, "name": s.name, "code": s.code,
            "description": s.description, "params": s.params,
            "source_code": s.source_code,
            "created_at": s.created_at.isoformat() if s.created_at else "",
            "updated_at": s.updated_at.isoformat() if s.updated_at else "",
        }
    finally:
        session.close()


@router.put("/{strategy_id}")
def update_strategy(strategy_id: int, data: StrategyUpdate):
    """更新策略"""
    session = get_session()
    try:
        s = session.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not s:
            raise HTTPException(404, "策略不存在")
        if data.name is not None:
            s.name = data.name
        if data.description is not None:
            s.description = data.description
        if data.params is not None:
            s.params = data.params
        if data.source_code is not None:
            s.source_code = data.source_code
        s.updated_at = datetime.now()
        session.commit()
        return {"message": "已更新", "id": s.id}
    finally:
        session.close()


@router.delete("/{strategy_id}")
def delete_strategy(strategy_id: int):
    """删除策略"""
    session = get_session()
    try:
        s = session.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not s:
            raise HTTPException(404, "策略不存在")
        session.delete(s)
        session.commit()
        return {"message": "已删除"}
    finally:
        session.close()
