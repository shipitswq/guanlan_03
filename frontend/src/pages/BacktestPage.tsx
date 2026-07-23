import { Card, Form, Select, InputNumber, Input, Button, Table, Typography, Row, Col, Spin, message, Tag, Tabs, Space, Popover } from 'antd'
import { PlayCircleOutlined, HistoryOutlined, SearchOutlined, InfoCircleOutlined, DollarOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { backtestApi, dataApi, tradingApi } from '../services/api'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import KLineChart from '../components/KLineChart'

const { Title, Text } = Typography

export default function BacktestPage() {
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [klineData, setKlineData] = useState<any[]>([])
  const [klineLoading, setKlineLoading] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [historyDetail, setHistoryDetail] = useState<any>(null)
  const [historyKline, setHistoryKline] = useState<any[]>([])
  const [builtinStrategies, setBuiltin] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('run')
  const [currentSymbol, setCurrentSymbol] = useState('')
  const [stockName, setStockName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [_currentFreq, setCurrentFreq] = useState('daily')

  useEffect(() => {
    backtestApi.history().then(r => setHistory(r.results || []))
    fetch('/api/strategies/builtin')
      .then(r => r.json())
      .then(r => setBuiltin(r.strategies || []))
      .catch(() => {})
    // 从 URL 参数自动填充标的（来自发现机会页面跳转）
    const symbol = searchParams.get('symbol')
    if (symbol) {
      form.setFieldsValue({ symbol })
      setTimeout(() => handleLoadKline(), 100)
    }
  }, [])

  // ── 获取K线数据（不回测，仅加载K线）──
  const handleLoadKline = async (freqOverride?: string) => {
    const symbol = form.getFieldValue('symbol')
    if (!symbol) { message.warning('请输入标的代码'); return }
    const freq = freqOverride || form.getFieldValue('freq') || 'daily'
    setCurrentSymbol(symbol)
    setCurrentFreq(freq)
    setKlineLoading(true)
    setResult(null)
    setKlineData([])
    setStartDate('')
    setEndDate('')
    setStockName('')
    try {
      // 分钟级数据请求不要太多，避免 mootdx 回退到日线
      const countMap: Record<string, number> = { daily: 800, weekly: 800, monthly: 800, '60min': 400, '30min': 400 }
      const count = countMap[freq] || 800
      const [klineRes, infoRes] = await Promise.all([
        dataApi.kline(symbol, freq, count),
        dataApi.stockInfo(symbol).catch(() => ({ name: '' })),
      ])
      if (klineRes?.data && klineRes.data.length > 0) {
        setKlineData(klineRes.data)
        setStockName(infoRes?.name || symbol)
        // 默认回测区间 = 全部K线数据
        setStartDate(klineRes.data[0].date)
        setEndDate(klineRes.data[klineRes.data.length - 1].date)
        message.success(`已加载 ${infoRes?.name || symbol}(${symbol}) 的K线数据`)
      } else {
        message.warning('未获取到数据，请检查代码是否正确')
      }
    } catch {
      message.error('获取K线数据失败')
    }
    setKlineLoading(false)
  }

  const handleRun = async () => {
    const values = await form.validateFields()
    setLoading(true)
    setResult(null)
    setKlineData([])
    setCurrentSymbol(values.symbol)

    // 解析 JSON 参数字段
    let paramsObj = values.params
    if (typeof paramsObj === 'string' && paramsObj.trim()) {
      try {
        paramsObj = JSON.parse(paramsObj)
      } catch {
        message.warning('策略参数 JSON 解析失败，使用默认参数')
        paramsObj = undefined
      }
    }

    // 回测参数
    const btParams: any = { ...values, params: paramsObj }
    if (startDate) btParams.start_date = startDate
    if (endDate) btParams.end_date = endDate

    try {
      // 并发: 跑回测 + 拉K线
      const [res, klineRes] = await Promise.all([
        backtestApi.run(btParams),
        dataApi.kline(values.symbol, values.freq || 'daily', 800).catch(() => ({ data: [] })),
      ])
      setResult(res)
      if (klineRes?.data) setKlineData(klineRes.data)
      message.success('回测完成')
      backtestApi.history().then(r => setHistory(r.results || []))
    } catch (e: any) {
      message.error(e.message)
    }
    setLoading(false)
  }

  const loadHistoryDetail = async (id: number) => {
    try {
      const detail = await backtestApi.detail(id)
      setHistoryDetail(detail)
      setHistoryKline([])
      setActiveTab('history')

      // 如果stock_name为空则补查
      if (detail?.symbol && !detail?.stock_name) {
        try {
          const info = await dataApi.stockInfo(detail.symbol)
          if (info?.name) detail.stock_name = info.name
        } catch {}
      }

      // 拉取K线
      if (detail?.symbol) {
        const klineRes = await dataApi.kline(detail.symbol, 'daily', 400).catch(() => ({ data: [] }))
        if (klineRes?.data) setHistoryKline(klineRes.data)
      }
    } catch { }
  }

  // ── 将交易明细转为K线标注 ──
  const toTradeMarks = (trades: any[]) => {
    if (!trades) return []
    return trades.map((t: any) => ({
      date: t.date,
      direction: t.direction as 'buy' | 'sell',
      price: t.price,
      reason: t.reason,
    }))
  }

  // ── 将策略信号转为K线信号标注 ──
  const toSignalMarks = (signals: any[]) => {
    if (!signals) return []
    return signals.map((s: any) => ({
      date: s.date,
      direction: s.direction as 'buy' | 'sell',
      price: s.price,
      reason: s.reason,
      executed: s.executed,
      reason_detail: s.reason_detail,
    }))
  }

  // ── K线框选回调 ──
  const handleRangeSelect = (start: string, end: string) => {
    setStartDate(start)
    setEndDate(end)
    message.info(`已选定回测区间: ${start} ~ ${end}`, 3)
  }

  const metrics = (data: any) => (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col span={4}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="策略收益率" value={data.total_return} suffix="%" precision={2}
          valueStyle={{ color: data.total_return >= 0 ? '#b53333' : '#4d7c3f', fontWeight: 600 }} />
      </Card></Col>
      <Col span={3}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="持仓不动" value={data.hold_return} suffix="%" precision={2}
          valueStyle={{ color: '#c96442' }} />
      </Card></Col>
      <Col span={3}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="超额收益" value={data.total_return - data.hold_return} suffix="%" precision={2}
          valueStyle={{ color: (data.total_return - data.hold_return) >= 0 ? '#b53333' : '#4d7c3f' }} />
      </Card></Col>
      <Col span={4}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="年化收益率" value={data.annual_return} suffix="%" precision={2} />
      </Card></Col>
      <Col span={4}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="最大回撤" value={data.max_drawdown} suffix="%" precision={2}
          valueStyle={{ color: '#b8862d' }} />
      </Card></Col>
      <Col span={3}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="胜率" value={data.win_rate} suffix="%" precision={1} />
      </Card></Col>
      <Col span={3}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="交易次数" value={data.total_trades} />
      </Card></Col>
      <Col span={3}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="夏普比率" value={data.sharpe_ratio} precision={2} />
      </Card></Col>
      <Col span={3}><Card size="small" bodyStyle={{ padding: '12px 16px' }}>
        <Statistic title="盈亏比" value={data.profit_factor || '-'} precision={2} />
      </Card></Col>
    </Row>
  )

  const equityChart = (curve: any[]) => {
    if (!curve || curve.length === 0) return null
    const initialCapital = curve[0]?.total_value || 100000
    const chartData = curve.map((c: any) => ({
      date: c.date?.slice(5) || '',
      value: c.total_value,
      return_pct: ((c.total_value - initialCapital) / initialCapital * 100).toFixed(2),
    }))

    return (
      <Card title="净值曲线" size="small" style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0eee6" />
            <XAxis dataKey="date" fontSize={11} tick={{ fill: '#87867f' }} />
            <YAxis fontSize={11} tick={{ fill: '#87867f' }} />
            <Tooltip
              contentStyle={{ background: '#faf9f5', border: '1px solid #e8e6dc', borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="value" stroke="#c96442" fill="#c96442" fillOpacity={0.08} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    )
  }

  const tradeTable = (trades: any[]) => {
    if (!trades || trades.length === 0) return null
    return (
      <Card title="交易明细" size="small" style={{ marginTop: 16 }}>
        <Table dataSource={trades} rowKey={(_, i) => String(i)} size="small" pagination={{ pageSize: 10 }}
          columns={[
            { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
            { title: '方向', dataIndex: 'direction', key: 'dir', width: 70,
              render: (d: string) => (
                <Tag color={d === 'buy' ? '#b53333' : '#4d7c3f'} style={{ color: '#fff', border: 'none' }}>
                  {d === 'buy' ? '买入' : '卖出'}
                </Tag>
              ) },
            { title: '价格', dataIndex: 'price', key: 'price', render: (v: number) => v.toFixed(2) },
            { title: '数量', dataIndex: 'quantity', key: 'qty' },
            { title: '金额', dataIndex: 'amount', key: 'amt', render: (v: number) => v.toFixed(2) },
            { title: '原因', dataIndex: 'reason', key: 'reason' },
          ]} />
      </Card>
    )
  }

  // ── 回测结果中注册到模拟盘 ──
  const handleRegister = async (btResult: any) => {
    try {
      const strategyCode = form.getFieldValue('strategy_code') || 'cool_ma'
      let params: any = {}
      const paramsStr = form.getFieldValue('params')
      if (paramsStr && typeof paramsStr === 'string' && paramsStr.trim()) {
        try { params = JSON.parse(paramsStr) } catch {}
      }
      await tradingApi.register({
        strategy_code: strategyCode,
        symbol: btResult.symbol,
        params: Object.keys(params).length > 0 ? params : undefined,
        capital: btResult.initial_capital,
      })
      message.success(`✅ 策略已注册到 ${btResult.symbol}（含当前参数）`)
    } catch (e: any) {
      message.error(`注册失败: ${e.message}`)
    }
  }

  // ── 展示回测结果（K线 + 净值 + 交易明细） ──
  const renderResult = (btResult: any, kline: any[], showLoading: boolean) => {
    if (showLoading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" tip="回测运行中..." /></div>
    if (!btResult) return null
    if (btResult.error) return <Card><Text type="danger">{btResult.error}</Text></Card>

    return (
      <div>
        {metrics(btResult)}
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, color: '#87867f' }}>
          回测区间: {btResult.start_date} ~ {btResult.end_date} · 标的: {btResult.stock_name ? `${btResult.stock_name} (${btResult.symbol})` : btResult.symbol} · 周期: {btResult.freq === '60min' ? '60分钟' : btResult.freq === 'daily' ? '日线' : btResult.freq}
        </Text>
        <Button type="primary" size="small" icon={<DollarOutlined />}
          onClick={() => handleRegister(btResult)}
          style={{ marginBottom: 12, background: '#4d7c3f', borderColor: '#4d7c3f' }}>
          注册到模拟盘
        </Button>

        {/* K线图（含策略信号 + 成交标注） */}
        <KLineChart
          klineData={kline}
          trades={toTradeMarks(btResult.trade_details)}
          signals={toSignalMarks(btResult.signal_events)}
          loading={klineLoading}
          title={`${btResult.symbol || currentSymbol} K线走势`}
          stockName={btResult.stock_name || stockName}
          onRangeSelect={handleRangeSelect}
          height={420}
        />

        {/* 净值曲线 */}
        {equityChart(btResult.equity_curve)}

        {/* 交易明细 */}
        {tradeTable(btResult.trade_details)}
      </div>
    )
  }

  return (
    <div>
      <Title level={4} style={{ fontWeight: 500 }}>回测分析</Title>

      <Tabs activeKey={activeTab} onChange={setActiveTab}
        tabBarStyle={{ marginBottom: 20 }}
        items={[
        {
          key: 'run', label: <span><PlayCircleOutlined /> 运行回测</span>,
          children: (
            <Row gutter={24}>
              <Col span={6}>
                <Card size="small" bodyStyle={{ padding: 20 }}>
                  <Form form={form} layout="vertical" initialValues={{
                    strategy_code: 'cool_ma',
                    symbol: '159569',
                    initial_capital: 100000,
                    freq: 'daily',
                    params: '{"fast":5,"slow":20,"below":2,"below_pct":1,"cooldown":5,"gap_exit":2,"fast_angle":30,"stop_loss":5}',
                  }}>
                    <Form.Item name="strategy_code" label="策略">
                      <Select options={builtinStrategies.map((s: any) => ({
                        label: `${s.name} (${s.code})`,
                        value: s.code,
                      }))} />
                    </Form.Item>
                    <Form.Item name="params" label={
                      <Space size={4}>
                        <span>策略参数 (JSON)</span>
                        <Popover title="参数说明" trigger="click" placement="right"
                          content={
                            <div style={{ fontSize: 12, lineHeight: 1.8, maxWidth: 280 }}>
                              <b>fast</b> = 快线周期 <span style={{ color: '#87867f' }}>(天, 默认5)</span><br />
                              <b>slow</b> = 慢线周期 <span style={{ color: '#87867f' }}>(天, 默认20)</span><br />
                              <b>below</b> = 跌破快线 <span style={{ color: '#87867f' }}>(连续天数, 默认2)</span><br />
                              <b>below_pct</b> = 跌破幅度 <span style={{ color: '#87867f' }}>(%, 默认1)</span><br />
                              <b>cooldown</b> = 冷却期 <span style={{ color: '#87867f' }}>(天, 默认5)</span><br />
                              <b>gap_exit</b> = 跳空平仓 <span style={{ color: '#87867f' }}>(%, 0=关闭)</span><br />
                              <b>fast_angle</b> = 快线坡度 <span style={{ color: '#87867f' }}>(度, 0=关闭)</span><br />
                              <b>stop_loss</b> = 硬性止损 <span style={{ color: '#87867f' }}>(%, 0=关闭, 亏损N%平仓)</span><br />
                            </div>
                          }>
                          <InfoCircleOutlined style={{ color: '#87867f', cursor: 'pointer' }} />
                        </Popover>
                      </Space>
                    }>
                      <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item name="symbol" label="标的代码" rules={[{ required: true }]}
                      style={{ marginBottom: 4 }}>
                      <Input.Search
                        placeholder="如 159569"
                        enterButton="加载K线"
                        onSearch={() => handleLoadKline()}
                      />
                    </Form.Item>
                    <Button type="link" size="small" icon={<SearchOutlined />}
                      onClick={() => handleLoadKline()}
                      style={{ marginBottom: 12, padding: 0, height: 20, fontSize: 12, color: '#87867f' }}>
                      先查看K线数据，确认无误再回测
                    </Button>
                    <Form.Item name="freq" label="K线周期" style={{ marginBottom: 12 }}>
                      <Select options={[
                        { label: '日线', value: 'daily' },
                        { label: '60分钟', value: '60min' },
                      ]}
                        onChange={(val) => handleLoadKline(val)}
                      />
                    </Form.Item>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: '#87867f', marginBottom: 6 }}>回测区间 (可选，留空=全部数据)</div>
                      <Space style={{ width: '100%' }}>
                        <Input placeholder="起始日" value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          style={{ width: '48%', fontSize: 12 }} />
                        <span style={{ color: '#87867f' }}>~</span>
                        <Input placeholder="结束日" value={endDate}
                          onChange={e => setEndDate(e.target.value)}
                          style={{ width: '48%', fontSize: 12 }} />
                      </Space>
                      <div style={{ fontSize: 11, color: '#b0aea5', marginTop: 4 }}>
                        格式: YYYY-MM-DD · 也可在K线上框选
                      </div>
                    </div>
                    <Form.Item name="initial_capital" label="初始资金">
                      <InputNumber min={1000} max={10000000} step={10000}
                        style={{ width: '100%' }}
                        formatter={v => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRun}
                        loading={loading} block size="large"
                        style={{ background: '#c96442', borderColor: '#c96442' }}>
                        运行回测
                      </Button>
                    </Form.Item>
                  </Form>
                </Card>
              </Col>
              <Col span={18}>
                {renderResult(result, klineData, loading)}
                {!result && !loading && klineData.length > 0 && (
                  <div>
                    <KLineChart
                      klineData={klineData}
                      title={`${currentSymbol} K线走势`}
                      stockName={stockName}
                      onRangeSelect={handleRangeSelect}
                      height={420}
                    />
                  </div>
                )}
                {!result && !loading && klineData.length === 0 && (
                  <Card>
                    <div style={{ textAlign: 'center', padding: 40, color: '#87867f' }}>
                      输入标的代码后点击"加载K线"查看数据，或直接"运行回测"
                    </div>
                  </Card>
                )}
              </Col>
            </Row>
          ),
        },
        {
          key: 'history', label: <span><HistoryOutlined /> 历史回测</span>,
          children: (
            <Row gutter={24}>
              <Col span={6}>
                <Card title="历史记录" size="small" bodyStyle={{ padding: 0 }}>
                  <Table dataSource={history} rowKey="id" size="small" pagination={{ pageSize: 15 }}
                    onRow={(r) => ({
                      onClick: () => loadHistoryDetail(r.id),
                      style: { cursor: 'pointer' },
                    })}
                    columns={[
                      { title: '策略', dataIndex: 'strategy_name', key: 'sn', width: 80 },
                      { title: '标的', dataIndex: 'symbol', key: 'sym', width: 70 },
                      { title: '收益率', dataIndex: 'total_return', key: 'tr', width: 80,
                        render: (v: number) => <span style={{ color: v >= 0 ? '#b53333' : '#4d7c3f', fontWeight: 500 }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span> },
                      { title: '日期', dataIndex: 'created_at', key: 'ca', width: 90,
                        render: (v: string) => v?.slice(0, 10) },
                    ]} />
              </Card>
            </Col>
              <Col span={18}>
                {historyDetail
                  ? renderResult(historyDetail, historyKline, false)
                  : (
                    <Card>
                      <div style={{ textAlign: 'center', padding: 40, color: '#87867f' }}>
                        点击左侧历史记录查看详情
                      </div>
                    </Card>
                  )}
              </Col>
            </Row>
          ),
        },
      ]} />
    </div>
  )
}

function Statistic(props: { title: string; value: any; suffix?: string; precision?: number; valueStyle?: any }) {
  const val = typeof props.value === 'number' ? props.value.toFixed(props.precision || 0) : (props.value != null ? String(props.value) : '-')
  return (
    <div>
      <div style={{ fontSize: 12, color: '#87867f', marginBottom: 4 }}>{props.title}</div>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'system-ui', ...props.valueStyle }}>{val}{props.suffix || ''}</div>
    </div>
  )
}
