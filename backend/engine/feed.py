"""
Feed 管理器 — 基于 WebSocket 的实时事件推送
支持多客户端订阅，事件类型: signal / order / position / pnl / info / error
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Set, Optional
from fastapi import WebSocket

logger = logging.getLogger("quant.feed")


class FeedManager:
    """Feed 管理器 — 管理WebSocket连接和事件分发"""

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._broadcast_task: Optional[asyncio.Task] = None

    async def connect(self, ws: WebSocket):
        """新客户端连接"""
        await ws.accept()
        self._connections.add(ws)
        logger.info(f"Feed客户端连接 ({len(self._connections)} 个在线)")

        # 发送连接成功消息
        await ws.send_json({
            "event_type": "info",
            "timestamp": datetime.now().isoformat(),
            "data": {"message": "已连接到量化交易Feed", "clients": len(self._connections)}
        })

    def disconnect(self, ws: WebSocket):
        """客户端断开"""
        self._connections.discard(ws)
        logger.info(f"Feed客户端断开 ({len(self._connections)} 个在线)")

    async def push_event(self, event: dict):
        """推送事件到所有客户端"""
        if not self._connections:
            return

        # 确保事件有timestamp
        if "timestamp" not in event:
            event["timestamp"] = datetime.now().isoformat()

        disconnected = set()
        for ws in self._connections:
            try:
                await ws.send_json(event)
            except Exception:
                disconnected.add(ws)

        # 清理断开的连接
        for ws in disconnected:
            self._connections.discard(ws)

    def push_event_sync(self, event: dict):
        """同步版推送（供非异步环境使用）"""
        if not self._connections:
            return
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(self.push_event(event))
            else:
                loop.run_until_complete(self.push_event(event))
        except RuntimeError:
            # 没有事件循环，创建新的
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(self.push_event(event))
            finally:
                loop.close()
        except Exception as e:
            logger.error(f"同步推送事件失败: {e}")

    def get_client_count(self) -> int:
        """获取在线客户端数"""
        return len(self._connections)
