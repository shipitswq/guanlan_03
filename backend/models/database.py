"""
数据库模型 — 策略、回测结果、交易记录
"""
import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, JSON, select
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "quant.db")

class Base(DeclarativeBase):
    pass


class Strategy(Base):
    """策略定义"""
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)              # 策略名称
    code = Column(String(20), nullable=False, unique=True)   # 策略代码标识
    description = Column(Text, default="")
    params = Column(JSON, default=dict)                      # 策略参数（dict）
    source_code = Column(Text, default="")                   # Python策略代码
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class BacktestResult(Base):
    """回测结果"""
    __tablename__ = "backtest_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    strategy_id = Column(Integer, nullable=False)
    strategy_name = Column(String(100), default="")
    symbol = Column(String(10), nullable=False)              # 标的代码
    start_date = Column(String(20), default="")
    end_date = Column(String(20), default="")
    initial_capital = Column(Float, default=100000.0)

    # 回测指标
    total_return = Column(Float, default=0.0)                # 总收益率(%)
    annual_return = Column(Float, default=0.0)               # 年化收益率(%)
    max_drawdown = Column(Float, default=0.0)                # 最大回撤(%)
    win_rate = Column(Float, default=0.0)                    # 胜率(%)
    total_trades = Column(Integer, default=0)                # 总交易次数
    sharpe_ratio = Column(Float, default=0.0)                # 夏普比率
    profit_factor = Column(Float, default=0.0)               # 盈亏比

    # 详细数据（JSON 序列化）
    equity_curve = Column(JSON, default=list)                 # 净值曲线
    trade_details = Column(JSON, default=list)                # 交易明细
    signal_events = Column(JSON, default=list)                # 所有策略信号
    hold_return = Column(Float, default=0.0)                  # 持仓不动收益率
    stock_name = Column(String(50), default="")               # 股票名称
    freq = Column(String(10), default="daily")                # K线周期
    created_at = Column(DateTime, default=datetime.now)


class TradeRecord(Base):
    """模拟盘交易记录"""
    __tablename__ = "trade_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    strategy_id = Column(Integer, nullable=False)
    strategy_name = Column(String(100), default="")
    symbol = Column(String(10), nullable=False)               # 标的代码
    direction = Column(String(4), nullable=False)             # "buy" / "sell"
    price = Column(Float, nullable=False)                     # 成交价格
    quantity = Column(Integer, nullable=False)                # 成交数量
    amount = Column(Float, nullable=False)                    # 成交金额
    trade_time = Column(String(30), nullable=False)           # 成交时间
    reason = Column(String(200), default="")                  # 交易原因
    position_snapshot = Column(JSON, default=dict)            # 成交时持仓快照
    created_at = Column(DateTime, default=datetime.now)


class TradeLog(Base):
    """交易日志 / Feed 事件"""
    __tablename__ = "trade_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(20), nullable=False)           # signal / order / position / pnl / info
    strategy_id = Column(Integer, default=0)
    symbol = Column(String(10), default="")
    content = Column(JSON, default=dict)                      # 事件内容
    created_at = Column(DateTime, default=datetime.now)


engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
SessionLocal = sessionmaker(bind=engine)


def init_db():
    """初始化数据库表"""
    Base.metadata.create_all(engine)


def get_session():
    """获取数据库会话"""
    return SessionLocal()
