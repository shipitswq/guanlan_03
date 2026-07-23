import { Card, Row, Col, Table, Tag, Typography, Space } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { tradingApi, backtestApi, statusApi } from '../services/api'

const { Title, Text } = Typography

export default function Dashboard() {
  const [status, setStatus] = useState<any>({})
  const [portfolio, setPortfolio] = useState<any>(null)
  const [recentTrades, setRecentTrades] = useState<any[]>([])
  const [recentBacktests, setRecentBacktests] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      try { setStatus(await statusApi.get()) } catch {}
      try { setPortfolio(await tradingApi.portfolio()) } catch {}
      try { setRecentTrades((await tradingApi.trades(10)).trades || []) } catch {}
      try { setRecentBacktests((await backtestApi.history(5)).results || []) } catch {}
    }
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  const running = status.trading_engine_running

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24, fontWeight: 500 }}>仪表盘</Title>

      {/* 顶部状态卡 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: '#87867f', marginBottom: 6 }}>交易引擎</div>
            <Space>
              {running
                ? <Tag color="success" icon={<CheckCircleOutlined />}>运行中</Tag>
                : <Tag icon={<CloseCircleOutlined />} color="default">已停止</Tag>}
              <Text style={{ fontSize: 14, color: '#87867f' }}>{running ? '轮询中' : '点击"模拟交易"启动'}</Text>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: '#87867f', marginBottom: 6 }}>策略数</div>
            <Text style={{ fontSize: 24, fontWeight: 600, color: '#141413' }}>{status.active_strategies || 0}</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: '#87867f', marginBottom: 6 }}>Feed 连接</div>
            <Text style={{ fontSize: 24, fontWeight: 600, color: '#141413' }}>{status.feed_clients || 0}</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: '#87867f', marginBottom: 6 }}>组合总价值</div>
            <Text style={{ fontSize: 24, fontWeight: 600, color: '#141413' }}>
              ¥{portfolio?.total_value?.toFixed(2) || '--'}
            </Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* 持仓 */}
        <Col span={12}>
          <Card title="当前持仓" size="small" bodyStyle={{ padding: 0 }}>
            <Table dataSource={portfolio?.positions || []} rowKey="symbol"
              size="small" pagination={false}
              columns={[
                { title: '标的', dataIndex: 'symbol', key: 'sym', width: 80 },
                { title: '名称', dataIndex: 'name', key: 'name', width: 90 },
                { title: '数量', dataIndex: 'quantity', key: 'qty', width: 70 },
                { title: '现价', dataIndex: 'current_price', key: 'cp', width: 80,
                  render: (v: number) => v?.toFixed(2) },
                { title: '盈亏', dataIndex: 'pnl', key: 'pnl', width: 90,
                  render: (v: number) => (
                    <span style={{ color: v >= 0 ? '#4d7c3f' : '#b53333', fontWeight: 500 }}>
                      {v >= 0 ? '+' : ''}{v?.toFixed(2)}
                    </span>
                  )},
                { title: '盈亏%', dataIndex: 'pnl_pct', key: 'pp', width: 80,
                  render: (v: number) => (
                    <span style={{ color: v >= 0 ? '#4d7c3f' : '#b53333' }}>
                      {v >= 0 ? '+' : ''}{v?.toFixed(2)}%
                    </span>
                  )},
              ]}
              locale={{ emptyText: '暂无持仓' }} />
          </Card>
        </Col>

        {/* 最近交易 */}
        <Col span={12}>
          <Card title="最近交易" size="small" bodyStyle={{ padding: 0 }}>
            <Table dataSource={recentTrades} rowKey={(r, i) => String(i)}
              size="small" pagination={false}
              columns={[
                { title: '时间', dataIndex: 'trade_time', key: 'tt', width: 130,
                  render: (v: string) => v?.slice(11, 19) || v?.slice(0, 10) },
                { title: '标的', dataIndex: 'symbol', key: 'sym', width: 70 },
                { title: '方向', dataIndex: 'direction', key: 'dir', width: 60,
                  render: (d: string) => (
                    <Tag color={d === 'buy' ? '#b53333' : '#4d7c3f'} style={{ color: '#fff', fontSize: 11 }}>
                      {d === 'buy' ? '买入' : '卖出'}
                    </Tag>
                  )},
                { title: '价格', dataIndex: 'price', key: 'pr', width: 80,
                  render: (v: number) => v?.toFixed(2) },
                { title: '数量', dataIndex: 'quantity', key: 'qty', width: 60 },
              ]}
              locale={{ emptyText: '暂无交易' }} />
          </Card>
        </Col>
      </Row>

      {/* 最近回测 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="最近回测" size="small" bodyStyle={{ padding: 0 }}>
            <Table dataSource={recentBacktests} rowKey="id"
              size="small" pagination={false}
              columns={[
                { title: '策略', dataIndex: 'strategy_name', key: 'sn', width: 110 },
                { title: '标的', dataIndex: 'symbol', key: 'sym', width: 80 },
                { title: '收益率', dataIndex: 'total_return', key: 'tr', width: 100,
                  render: (v: number) => (
                    <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontWeight: 500 }}>
                      {v >= 0 ? '+' : ''}{v?.toFixed(2)}%
                    </span>
                  )},
                { title: '最大回撤', dataIndex: 'max_drawdown', key: 'md', width: 100,
                  render: (v: number) => <span style={{ color: '#faad14' }}>{v?.toFixed(2)}%</span> },
                { title: '胜率', dataIndex: 'win_rate', key: 'wr', width: 70,
                  render: (v: number) => `${v?.toFixed(0)}%` },
                { title: '交易次数', dataIndex: 'total_trades', key: 'tt', width: 80 },
                { title: '时间', dataIndex: 'created_at', key: 'ca', width: 100,
                  render: (v: string) => v?.slice(0, 10) },
              ]}
              locale={{ emptyText: '暂无回测记录' }} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
