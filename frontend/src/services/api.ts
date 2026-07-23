/**
 * API 服务层
 */
const API_BASE = 'http://localhost:8000/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `HTTP ${res.status}`)
  }
  return res.json()
}

// 行情数据
export const dataApi = {
  quote: (codes: string) => request<any>(`/data/quote?codes=${codes}`),
  kline: (code: string, freq = 'daily', count = 200) =>
    request<any>(`/data/kline?code=${code}&freq=${freq}&count=${count}`),
  orderbook: (code: string) => request<any>(`/data/orderbook?code=${code}`),
  stockInfo: (code: string) => request<any>(`/data/stock-info?code=${code}`),
  search: (keyword: string) => request<any>(`/data/search?keyword=${keyword}`),
  finance: (code: string) => request<any>(`/data/finance?code=${code}`),
}

// 策略管理
export const strategyApi = {
  listBuiltin: () => request<any>('/strategies/builtin'),
  list: () => request<any>('/strategies'),
  get: (id: number) => request<any>(`/strategies/${id}`),
  create: (data: any) =>
    request<any>('/strategies', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    request<any>(`/strategies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<any>(`/strategies/${id}`, { method: 'DELETE' }),
}

// 回测
export const backtestApi = {
  run: (data: any) =>
    request<any>('/backtest/run', { method: 'POST', body: JSON.stringify(data) }),
  history: (limit = 20) => request<any>(`/backtest/history?limit=${limit}`),
  detail: (id: number) => request<any>(`/backtest/history/${id}`),
}

// 模拟交易
export const tradingApi = {
  register: (data: any) =>
    request<any>('/trading/register', { method: 'POST', body: JSON.stringify(data) }),
  update: (data: any) =>
    request<any>('/trading/update', { method: 'POST', body: JSON.stringify(data) }),
  unregister: (symbol: string) =>
    request<any>(`/trading/unregister?symbol=${symbol}`, { method: 'POST' }),
  active: () => request<any>('/trading/active'),
  portfolio: () => request<any>('/trading/portfolio'),
  start: (interval = 60) =>
    request<any>(`/trading/start?interval=${interval}`, { method: 'POST' }),
  stop: () => request<any>('/trading/stop', { method: 'POST' }),
  status: () => request<any>('/trading/status'),
  trades: (limit = 50) => request<any>(`/trading/trades?limit=${limit}`),
}

// 系统状态
export const statusApi = {
  get: () => request<any>('/status'),
}
