"""
量化交易平台 — 后端入口
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from backend.models.database import init_db, get_session
from backend.api.strategies import router as strategies_router
from backend.api.backtest import router as backtest_router
from backend.api.trading import router as trading_router, set_engine
from backend.api.data import router as data_router
from backend.api.screener import router as screener_router
from backend.engine.feed import FeedManager
from backend.engine.trading import SimTradingEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("quant")


# ── 全局单例 ──
feed_manager = FeedManager()
trading_engine = SimTradingEngine(data_service=None)

# 将feed回调注入交易引擎
trading_engine.set_event_callback(feed_manager.push_event_sync)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    # 启动时
    init_db()
    logger.info("数据库初始化完成")
    set_engine(trading_engine)
    yield
    # 关闭时
    trading_engine.stop()
    logger.info("引擎已停止")


app = FastAPI(
    title="量化交易平台",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — 允许前端开发服务器
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST API ──
app.include_router(strategies_router)
app.include_router(backtest_router)
app.include_router(trading_router)
app.include_router(data_router)
app.include_router(screener_router)


# ── WebSocket Feed ──
@app.websocket("/ws/feed")
async def websocket_feed(ws: WebSocket):
    """WebSocket Feed 端点"""
    await feed_manager.connect(ws)
    try:
        while True:
            # 接收客户端消息（用于客户端订阅/心跳）
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws.send_json({"event_type": "pong", "timestamp": data})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        feed_manager.disconnect(ws)
    except Exception as e:
        logger.error(f"WebSocket异常: {e}")
        feed_manager.disconnect(ws)


# ── SSE Feed（备选推送方案） ──

@app.get("/api/feed/sse")
async def sse_feed(request: Request):
    """SSE推送端点"""
    async def event_generator():
        client_connected = True
        while client_connected:
            if await request.is_disconnected():
                client_connected = False
                break
            # SSE 心跳
            yield {"event": "heartbeat", "data": "ping"}
            await asyncio.sleep(15)

    return EventSourceResponse(event_generator())


# ── 静态文件（前端构建产物） ──
import os
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


# ── 状态端点 ──
@app.get("/api/status")
def get_status():
    return {
        "status": "running",
        "feed_clients": feed_manager.get_client_count(),
        "trading_engine_running": trading_engine._running,
        "active_strategies": len(trading_engine._active_strategies),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
