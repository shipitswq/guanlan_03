import { Card, Row, Col, Table, Tag, Button, Typography, message, Statistic, Space, Modal, Form, Input, Select } from 'antd'
import { PlayCircleOutlined, StopOutlined, CloseCircleOutlined, EditOutlined } from '@ant-design/icons'
import { useEffect, useState, useRef } from 'react'
import { tradingApi } from '../services/api'

const { Title, Text } = Typography

export default function TradingDashboard() {
  const [engineStatus, setEngineStatus] = useState<any>({})
  const [portfolio, setPortfolio] = useState<any>({})
  const [activeStrategies, setActive] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])
  const timerRef = useRef<any>(null)
  const [editModal, setEditModal] = useState<any>(null)
  const [editForm] = Form.useForm()

  const load = () => {
    Promise.all([
      tradingApi.status().catch(() => ({})),
      tradingApi.portfolio().catch(() => ({})),
      tradingApi.active().catch(() => ({ strategies: [] })),
      tradingApi.trades(30).catch(() => ({ trades: [] })),
    ]).then(([s, p, a, t]) => {
      setEngineStatus(s)
      setPortfolio(p)
      setActive(a.strategies || [])
      setTrades(t.trades || [])
    })
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 5000)
    return () => clearInterval(timerRef.current)
  }, [])

  const handleUnregister = async (symbol: string) => {
    await tradingApi.unregister(symbol)
    message.success('已取消注册')
    load()
  }

  const handleStart = async () => {
    await tradingApi.start(60)
    message.success('模拟盘已启动 (轮询间隔60秒)')
    load()
  }

  const handleStop = async () => {
    await tradingApi.stop()
    message.success('模拟盘已停止')
    load()
  }

  const handleEdit = (r: any) => {
    setEditModal(r)
    editForm.setFieldsValue({
      params: r.params ? JSON.stringify(r.params, null, 2) : '{}',
      freq: r.freq || 'daily',
    })
  }

  const handleSaveEdit = async () => {
    const values = await editForm.validateFields()
    let params: any = {}
    try { params = JSON.parse(values.params) } catch { message.warning('JSON格式错误'); return }
    await tradingApi.update({
      symbol: editModal.symbol,
      strategy_code: 'cool_ma',
      params,
      freq: values.freq,
    })
    message.success('策略参数已更新')
    setEditModal(null)
    load()
  }

  const tradeColumns = [
    { title: '时间', dataIndex: 'trade_time', key: 'time', width: 160 },
    { title: '标的', dataIndex: 'symbol', key: 'symbol', width: 90 },
    { title: '策略', dataIndex: 'strategy_name', key: 'sn', width: 100 },
    {
      title: '方向', dataIndex: 'direction', key: 'dir', width: 70,
      render: (d: string) => (
        <Tag color={d === 'buy' ? 'red' : 'green'}>{d === 'buy' ? '买入' : '卖出'}</Tag>
      ),
    },
    { title: '价格', dataIndex: 'price', key: 'price', render: (v: number) => v.toFixed(2) },
    { title: '数量', dataIndex: 'quantity', key: 'qty' },
    { title: '金额', dataIndex: 'amount', key: 'amt', render: (v: number) => v.toFixed(2) },
    { title: '原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
  ]

  return (
    <div>
      <Title level={4}>模拟交易</Title>

      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="组合总值" value={portfolio.total_value || 0} prefix="¥" precision={2} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="总收益" value={portfolio.total_pnl || 0} prefix="¥" precision={2}
              valueStyle={{ color: (portfolio.total_pnl || 0) >= 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="总收益率" value={portfolio.total_return_pct || 0} suffix="%" precision={2}
              valueStyle={{ color: (portfolio.total_return_pct || 0) >= 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="当前活跃策略" size="small"
            extra={
              <Space>
                <Button icon={<PlayCircleOutlined />} type="primary" size="small"
                  onClick={handleStart} disabled={engineStatus.running}>
                  启动引擎
                </Button>
                <Button icon={<StopOutlined />} danger size="small"
                  onClick={handleStop} disabled={!engineStatus.running}>
                  停止引擎
                </Button>
              </Space>
            }>
            {activeStrategies.length > 0 ? (
              <Table dataSource={activeStrategies} rowKey="symbol" size="small" pagination={false}
                onRow={(r) => ({ onClick: () => handleEdit(r), style: { cursor: 'pointer' } })}
                columns={[
                  { title: '标的', dataIndex: 'stock_name', key: 'name', width: 130, ellipsis: true },
                  { title: '代码', dataIndex: 'symbol', key: 'symbol', width: 70 },
                  { title: '策略', key: 'sn', width: 130,
                    render: (_: any, r: any) => {
                      const period = r.freq === '60min' ? '60分钟' : '日线'
                      return `${r.strategy_name}_${period}`
                    },
                  },
                  { title: '金额', key: 'capital', width: 90,
                    render: (_: any, r: any) => r.capital ? `¥${r.capital.toLocaleString()}` : '-',
                  },
                  {
                    title: '操作', key: 'action', width: 140,
                    render: (_: any, r: any) => (
                      <Space>
                        <Button type="link" size="small" icon={<EditOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleEdit(r) }}>
                          参数
                        </Button>
                        <Button type="link" danger size="small"
                          icon={<CloseCircleOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleUnregister(r.symbol) }}>
                          移除
                        </Button>
                      </Space>
                    ),
                  },
                ]} />
            ) : (
              <Text type="secondary">尚未注册任何策略，请在回测页测好后注册</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="持仓详情" size="small" style={{ marginTop: 16 }}>
        {portfolio.positions?.length > 0 ? (
          <Table dataSource={portfolio.positions} rowKey="symbol" size="small" pagination={false}
            columns={[
              { title: '标的', dataIndex: 'symbol', key: 'symbol', width: 80 },
              { title: '名称', dataIndex: 'name', key: 'name', width: 100 },
              { title: '持仓数量', dataIndex: 'quantity', key: 'qty', width: 90 },
              { title: '成本均价', dataIndex: 'avg_price', key: 'ap', render: (v: number) => v.toFixed(2) },
              { title: '当前价格', dataIndex: 'current_price', key: 'cp', render: (v: number) => v.toFixed(2) },
              { title: '市值', dataIndex: 'market_value', key: 'mv', render: (v: number) => v.toFixed(2) },
              {
                title: '浮动盈亏', dataIndex: 'pnl', key: 'pnl',
                render: (v: number) => (
                  <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontWeight: 600 }}>
                    {v >= 0 ? '+' : ''}{v.toFixed(2)}
                  </span>
                ),
              },
              {
                title: '盈亏%', dataIndex: 'pnl_pct', key: 'pp',
                render: (v: number) => (
                  <Tag color={v >= 0 ? 'red' : 'green'}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</Tag>
                ),
              },
            ]} />
        ) : (
          <Text type="secondary">暂无持仓</Text>
        )}
      </Card>

      <Card title="交易历史" size="small" style={{ marginTop: 16 }}>
        <Table dataSource={trades} rowKey="id" size="small"
          columns={tradeColumns} pagination={{ pageSize: 15 }} />
      </Card>
      {/* 参数编辑弹窗 */}
      <Modal title={`编辑策略参数 — ${editModal?.stock_name || editModal?.symbol}`}
        open={!!editModal} onCancel={() => setEditModal(null)}
        onOk={handleSaveEdit} okText="保存" cancelText="取消"
        width={400}>
        <Form form={editForm} layout="vertical">
          <Form.Item name="freq" label="K线周期">
            <Select options={[
              { label: '日线', value: 'daily' },
              { label: '60分钟', value: '60min' },
            ]} />
          </Form.Item>
          <Form.Item name="params" label="策略参数 (JSON)">
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
