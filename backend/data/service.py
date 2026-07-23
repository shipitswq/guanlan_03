"""
数据服务层 — 通达信(mootdx) + 腾讯财经 + 东财
数据源优先级: mootdx(TCP) > 腾讯(HTTP) > 东财(HTTP, 限流)
"""
import time
import random
import requests
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional
from mootdx.quotes import Quotes
import urllib.request
import logging

logger = logging.getLogger("quant.data")

# ── 东财防封 ──
EM_SESSION = requests.Session()
EM_SESSION.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0.0.0"})
EM_MIN_INTERVAL = 1.0
_em_last_call = [0.0]

def em_get(url: str, params: dict = None, headers: dict = None, timeout: int = 15):
    """东财统一请求入口（内置节流）"""
    wait = EM_MIN_INTERVAL - (time.time() - _em_last_call[0])
    if wait > 0:
        time.sleep(wait + random.uniform(0.1, 0.5))
    try:
        return EM_SESSION.get(url, params=params, headers=headers, timeout=timeout)
    finally:
        _em_last_call[0] = time.time()


class DataService:
    """A股数据服务 — 统一接口"""

    def __init__(self):
        self._tdx_client: Optional[Quotes] = None
        self._last_tdx_check = 0

    @property
    def tdx(self) -> Quotes:
        """懒加载 mootdx client（TCP连接，重连机制）"""
        now = time.time()
        if self._tdx_client is None or (now - self._last_tdx_check) > 300:
            try:
                self._tdx_client = Quotes.factory(market='std')
                self._last_tdx_check = now
            except Exception as e:
                logger.warning(f"mootdx连接失败: {e}, 5秒后重试")
                time.sleep(5)
                self._tdx_client = Quotes.factory(market='std')
                self._last_tdx_check = now
        return self._tdx_client

    def get_market(self, code: str) -> int:
        """获取mootdx市场编码: 0=深圳, 1=上海"""
        if code.startswith(("6", "9")):
            return 1
        return 0

    # ── 1. K线数据（通达信 + baostock分钟级） ──
    def get_kline(self, code: str, freq: str = "daily", count: int = 500) -> pd.DataFrame:
        """
        获取K线数据
        freq: daily / weekly / monthly / 1min / 5min / 15min / 30min / 60min
        分钟级: 使用baostock（通达信不支持）
        日线: 使用通达信
        """
        # 分钟级 → 走AkShare新浪源
        if freq in ("1min", "5min", "15min", "30min", "60min"):
            return self._get_kline_akshare_min(code, freq)

        # 日线/周线/月线 → 走通达信
        category_map = {
            "daily": 9, "weekly": 5, "monthly": 6,
        }
        cat = category_map.get(freq, 9)
        market = self.get_market(code)
        try:
            bars = self.tdx.bars(symbol=code, category=cat, offset=count, market=market)
        except Exception as e:
            # fallback: 尝试不传 market
            try:
                bars = self.tdx.bars(symbol=code, category=cat, offset=count)
            except Exception as e2:
                logger.error(f"获取K线失败 {code}: {e2}")
                return pd.DataFrame()

        if bars is None or len(bars) == 0:
            return pd.DataFrame()

        df = pd.DataFrame(bars)
        # 统一列名
        if "datetime" in df.columns:
            df["date"] = pd.to_datetime(df["datetime"]).dt.strftime("%Y-%m-%d")
        df = df.rename(columns={
            "open": "open", "high": "high", "low": "low",
            "close": "close", "vol": "volume", "amount": "amount"
        })
        # 只保留关键列，去除重复列
        cols = [c for c in ["date", "open", "high", "low", "close", "volume", "amount"] if c in df.columns]
        df = df[cols]
        # 去重列名（防止mootdx返回重复列）
        df = df.loc[:, ~df.columns.duplicated()]
        df = df.sort_values("date").reset_index(drop=True)
        return df

    # ── 1b. 分钟级K线（AkShare 新浪源） ──
    def _get_kline_akshare_min(self, code: str, freq: str = "60min") -> pd.DataFrame:
        """用AkShare(新浪财经)获取分钟级K线数据，支持60min/30min/15min等"""
        import akshare as ak

        period_map = {"60min": "60", "30min": "30", "15min": "15", "5min": "5", "1min": "1"}
        period = period_map.get(freq, "60")

        # 新浪格式: sz159569 或 sh600519
        market = "sz" if code.startswith(("0", "1", "2", "3")) else "sh"
        sina_code = f"{market}{code}"

        try:
            df = ak.stock_zh_a_minute(symbol=sina_code, period=period, adjust="qfq")
            if df is None or df.empty:
                return pd.DataFrame()

            df = df.rename(columns={
                "day": "date",
                "open": "open", "high": "high", "low": "low",
                "close": "close", "volume": "volume", "amount": "amount",
            })
            # AkShare 返回字符串，转数值
            for col in ["open", "high", "low", "close"]:
                df[col] = pd.to_numeric(df[col], errors="coerce")
            df["volume"] = pd.to_numeric(df["volume"], errors="coerce").astype(int)
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
            # date 列带时间 "2024-08-22 10:30:00"，只保留日期
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
            return df[["date", "open", "high", "low", "close", "volume", "amount"]]

        except Exception as e:
            logger.error(f"AkShare获取分钟K线失败 {code}: {e}")
            return pd.DataFrame()

    # ── 2. 实时行情（腾讯API） ──
    def get_realtime_quote(self, codes: list[str]) -> dict:
        """
        批量获取实时行情
        返回: {code: {name, price, last_close, change_pct, pe_ttm, pb, mcap_yi, ...}}
        """
        prefixed = []
        for c in codes:
            if c.startswith(("6", "9")):
                prefixed.append(f"sh{c}")
            elif c.startswith("8"):
                prefixed.append(f"bj{c}")
            else:
                prefixed.append(f"sz{c}")

        url = "https://qt.gtimg.cn/q=" + ",".join(prefixed)
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0")
        try:
            resp = urllib.request.urlopen(req, timeout=10)
            data = resp.read().decode("gbk")
        except Exception as e:
            logger.error(f"腾讯行情失败: {e}")
            return {}

        result = {}
        for line in data.strip().split(";"):
            if not line.strip() or "=" not in line or '"' not in line:
                continue
            key = line.split("=")[0].split("_")[-1]
            vals = line.split('"')[1].split("~")
            if len(vals) < 53:
                continue
            code = key[2:]
            try:
                result[code] = {
                    "code": code,
                    "name": vals[1],
                    "price": float(vals[3]) if vals[3] else 0,
                    "last_close": float(vals[4]) if vals[4] else 0,
                    "open": float(vals[5]) if vals[5] else 0,
                    "change_amt": float(vals[31]) if vals[31] else 0,
                    "change_pct": float(vals[32]) if vals[32] else 0,
                    "high": float(vals[33]) if vals[33] else 0,
                    "low": float(vals[34]) if vals[34] else 0,
                    "amount_wan": float(vals[37]) if vals[37] else 0,
                    "turnover_pct": float(vals[38]) if vals[38] else 0,
                    "pe_ttm": float(vals[39]) if vals[39] else 0,
                    "amplitude_pct": float(vals[43]) if vals[43] else 0,
                    "mcap_yi": float(vals[44]) if vals[44] else 0,
                    "float_mcap_yi": float(vals[45]) if vals[45] else 0,
                    "pb": float(vals[46]) if vals[46] else 0,
                    "limit_up": float(vals[47]) if vals[47] else 0,
                    "limit_down": float(vals[48]) if vals[48] else 0,
                    "vol_ratio": float(vals[49]) if vals[49] else 0,
                    "pe_static": float(vals[52]) if vals[52] else 0,
                }
            except (ValueError, IndexError):
                continue
        return result

    # ── 3. 五档盘口（通达信） ──
    def get_order_book(self, code: str) -> dict:
        """获取五档盘口"""
        try:
            quotes = self.tdx.quotes(symbol=[code])
            if quotes is None or len(quotes) == 0:
                return {}
            q = quotes[0]
            return {
                "code": code,
                "price": float(q.get("price", 0)),
                "open": float(q.get("open", 0)),
                "high": float(q.get("high", 0)),
                "low": float(q.get("low", 0)),
                "last_close": float(q.get("last_close", 0)),
                "volume": int(q.get("vol", 0)),
                "amount": float(q.get("amount", 0)),
                "bid": [float(q.get(f"bid{i}", 0)) for i in range(1, 6)],
                "ask": [float(q.get(f"ask{i}", 0)) for i in range(1, 6)],
                "bid_vol": [int(q.get(f"bid_vol{i}", 0)) for i in range(1, 6)],
                "ask_vol": [int(q.get(f"ask_vol{i}", 0)) for i in range(1, 6)],
                "servertime": q.get("servertime", ""),
            }
        except Exception as e:
            logger.error(f"获取盘口失败 {code}: {e}")
            return {}

    # ── 4. 财务快照（通达信） ──
    def get_finance(self, code: str) -> dict:
        """获取财务快照"""
        try:
            fin = self.tdx.finance(symbol=code)
            if fin is None or len(fin) == 0:
                return {}
            return dict(fin[0])
        except Exception as e:
            logger.error(f"获取财务数据失败 {code}: {e}")
            return {}

    # ── 5. 股票基本信息（东财） ──
    def get_stock_info(self, code: str) -> dict:
        """获取股票基本信息"""
        market_code = 1 if code.startswith("6") else 0
        url = "https://push2.eastmoney.com/api/qt/stock/get"
        params = {
            "fltt": "2", "invt": "2",
            "fields": "f57,f58,f84,f85,f127,f116,f117,f189,f43",
            "secid": f"{market_code}.{code}",
        }
        headers = {"Referer": "https://quote.eastmoney.com/"}
        try:
            r = em_get(url, params=params, headers=headers, timeout=10)
            d = r.json().get("data", {})
            return {
                "code": d.get("f57", code),
                "name": d.get("f58", ""),
                "industry": d.get("f127", ""),
                "total_shares": d.get("f84", 0),
                "float_shares": d.get("f85", 0),
                "mcap": d.get("f116", 0),
                "float_mcap": d.get("f117", 0),
                "list_date": str(d.get("f189", "")),
                "price": d.get("f43", 0),
            }
        except Exception as e:
            logger.error(f"获取股票信息失败 {code}: {e}")
            # 降级: 从腾讯实时行情获取名称
            try:
                quote = self.get_realtime_quote([code])
                q = quote.get(code, {})
                if q.get("name"):
                    return {"code": code, "name": q["name"]}
            except:
                pass
            return {"code": code}

    # ── 6. 搜索股票 ──
    def search_stock(self, keyword: str) -> list[dict]:
        """搜索股票（支持代码/名称）"""
        url = "https://push2.eastmoney.com/api/qt/clist/get"
        params = {
            "pn": "1", "pz": "30", "po": "1", "np": "1",
            "fltt": "2", "invt": "2",
            "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
            "fields": "f12,f14,f2,f3,f4,f100,f20",
        }
        try:
            r = em_get(url, params=params, timeout=10)
            items = r.json().get("data", {}).get("diff", [])
            results = []
            kw = keyword.upper()
            for item in items:
                code = str(item.get("f12", ""))
                name = item.get("f14", "")
                if kw in code or kw in name.upper():
                    results.append({
                        "code": code,
                        "name": name,
                        "price": item.get("f2", 0),
                        "change_pct": item.get("f3", 0),
                    })
            return results
        except Exception as e:
            logger.error(f"搜索股票失败: {e}")
            return []

    # ── 7. 获取历史K线（备用: 百度） ──
    def get_kline_with_ma(self, code: str, count: int = 120) -> pd.DataFrame:
        """百度K线 — 自带MA5/MA10/MA20"""
        url = "https://finance.pae.baidu.com/selfselect/getstockquotation"
        params = {
            "all": "1", "isIndex": "false", "isBk": "false", "isBlock": "false",
            "isFutures": "false", "isStock": "true", "newFormat": "1",
            "group": "quotation_kline_ab", "finClientType": "pc",
            "code": code,
        }
        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/vnd.finance-web.v1+json",
            "Origin": "https://gushitong.baidu.com",
            "Referer": "https://gushitong.baidu.com/",
        }
        try:
            r = requests.get(url, params=params, headers=headers, timeout=10)
            d = r.json()
            md = d.get("Result", {}).get("newMarketData", {})
            keys = md.get("keys", [])
            rows = md.get("marketData", "").split(";")
            records = []
            for row_str in rows[-count:]:
                parts = row_str.split(",")
                if len(parts) >= len(keys):
                    record = dict(zip(keys, parts))
                    records.append(record)
            return pd.DataFrame(records)
        except Exception as e:
            logger.error(f"百度K线失败 {code}: {e}")
            return pd.DataFrame()
