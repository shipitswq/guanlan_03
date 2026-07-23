import { Card, Table, Button, Select, Form, Input, Typography, message, Tag, Modal, Progress, Space } from 'antd'
import { SearchOutlined, BarChartOutlined, FundOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataApi, screenerApi } from '../services/api'
import KLineChart from '../components/KLineChart'

const { Title, Text } = Typography

export default function DiscoveryPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ total: 0, scanned: 0 })
  const [results, setResults] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('discovery_results') || '[]') } catch { return [] }
  })
  const [count, setCount] = useState(() => {
    try { return Number(localStorage.getItem('discovery_count') || '0') } catch { return 0 }
  })
  const [klineModal, setKlineModal] = useState<any>(null)
  const [klineData, setKlineData] = useState<any[]>([])
  const [klineLoading, setKlineLoading] = useState(false)
  const [builtinStrategies, setBuiltin] = useState<any[]>([])

  useEffect(() => {
    fetch('http://localhost:8000/api/strategies/builtin')
      .then(r => r.json()).then(r => setBuiltin(r.strategies || []))
      .catch(() => {})
  }, [])

  const handleScan = async () => {
    const values = form.getFieldsValue()
    let params: any = {}
    try { params = JSON.parse(values.params || '{}') } catch {}

    setScanning(true)
    setResults([])
    setCount(0)
    setScanProgress({ total: 0, scanned: 0 })

    // 启动进度轮询
    const timer = setInterval(async () => {
      try {
        const p = await (await fetch('http://localhost:8000/api/screener/progress')).json()
        if (p.total > 0) setScanProgress({ total: p.total, scanned: p.scanned })
      } catch {}
    }, 500)

    try {
      const res = await screenerApi.scan({
        strategy_code: values.strategy_code || 'cool_ma',
        params,
        freq: values.freq || 'daily',
        lookback: values.lookback || 1,
      })
      setResults(res.results || [])
      setCount(res.count || 0)
      localStorage.setItem('discovery_results', JSON.stringify(res.results || []))
      localStorage.setItem('discovery_count', String(res.count || 0))
      localStorage.setItem('discovery_time', new Date().toLocaleString())
      message.success(`扫描完成，发现 ${res.count || 0} 个买入信号`)
    } catch (e: any) {
      message.error(`扫描失败: ${e.message}`)
    }
    clearInterval(timer)
    setScanning(false)
  }

  const showKline = async (code: string, name: string) => {
    setKlineModal({ code, name })
    setKlineLoading(true)
    setKlineData([])
    try {
      const res = await dataApi.kline(code, 'daily', 120)
      if (res?.data) {
        setKlineData(res.data)
      }
    } catch (e) {
      console.error('加载K线失败', e)
      message.error('K线数据加载失败')
    }
    setKlineLoading(false)
  }

  const columns = [
    { title: '代码', dataIndex: 'code', key: 'code', width: 80 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 150, ellipsis: true,
      render: (v: string, r: any) => <a onClick={() => showKline(r.code, v)}>{v}</a>,
    },
    { title: '价格', dataIndex: 'price', key: 'price', width: 80,
      render: (v: number) => v?.toFixed(3),
    },
    { title: '信号', dataIndex: 'signal', key: 'signal', width: 200,
      render: (v: string) => <Tag color="#b53333">{v}</Tag>,
    },
    { title: '评分', dataIndex: 'score', key: 'score', width: 80,
      render: (v: number) => <span style={{ color: v > 0 ? '#b53333' : '#4d7c3f', fontWeight: 500 }}>{v?.toFixed(1)}</span>,
    },
    { title: '日期', dataIndex: 'date', key: 'date', width: 100 },
    {
      title: '操作', key: 'action', width: 110,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<BarChartOutlined />}
            onClick={() => showKline(r.code, r.name)}>
            K线
          </Button>
          <Button type="link" size="small" icon={<FundOutlined />}
            onClick={() => navigate(`/backtest?symbol=${r.code}`)}>
            回测
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={4}>发现机会</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        扫描全市场A股，按策略筛选出买入信号。点击标的名称或K线按钮查看详情。
      </Text>

      <Card size="small" bodyStyle={{ padding: 16 }}>
        <Form form={form} layout="inline" initialValues={{
          strategy_code: 'cool_ma',
          freq: 'daily',
          lookback: 1,
          params: '{"fast":5,"slow":20,"below":2,"below_pct":1,"cooldown":5,"gap_exit":2,"fast_angle":30,"stop_loss":5}',
        }}>
          <Form.Item name="strategy_code" label="策略">
            <Select style={{ width: 130 }} options={builtinStrategies.map((s: any) => ({
              label: s.name, value: s.code,
            }))} />
          </Form.Item>
          <Form.Item name="freq" label="周期">
            <Select style={{ width: 90 }} options={[
              { label: '日线', value: 'daily' },
              { label: '60分钟', value: '60min' },
            ]} />
          </Form.Item>
          <Form.Item name="lookback" label="回溯">
            <Select style={{ width: 80 }} options={[
              { label: '今日', value: 1 },
              { label: '2日', value: 2 },
              { label: '3日', value: 3 },
              { label: '5日', value: 5 },
              { label: '10日', value: 10 },
            ]} />
          </Form.Item>
          <Form.Item name="params" label="参数" style={{ width: 340 }}>
            <Input placeholder='{"fast":5,"slow":20,...}' />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleScan} loading={scanning}>
              {scanning ? '扫描中...' : '开始扫描'}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card size="small" style={{ marginTop: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 4 }}>
          扫描结果 {count > 0 && <Tag>{count} 个信号</Tag>}
          {(() => { const t = localStorage.getItem('discovery_time'); return t ? <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>上次扫描: {t}</Text> : null })()}
        </Text>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          评分 = 近5日涨幅%，越高代表近期上涨越强。点击标的名称或K线按钮可查看K线图。
        </Text>
        {scanning ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Progress type="circle" percent={scanProgress.total > 0 ? Math.round(scanProgress.scanned / scanProgress.total * 100) : 0}
              format={() => `${scanProgress.scanned}/${scanProgress.total}`} size={120} />
            <div style={{ marginTop: 12, color: '#87867f', fontSize: 13 }}>正在扫描全市场...</div>
          </div>
        ) : (
          <Table dataSource={results} rowKey="code" size="small" pagination={{ pageSize: 30 }}
            columns={columns} />
        )}
      </Card>

      {/* K线弹窗 */}
      <Modal title={`${klineModal?.name || ''} (${klineModal?.code})`}
        open={!!klineModal} onCancel={() => setKlineModal(null)}
        footer={null} width={800} destroyOnClose>
        {klineLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Progress type="circle" percent={50} size={60} /></div>
        ) : klineData.length > 0 ? (
          <div style={{ height: 440 }}>
            <KLineChart klineData={klineData} height={400} />
          </div>
        ) : (
          <Text type="secondary">暂无数据</Text>
        )}
      </Modal>
    </div>
  )
}
