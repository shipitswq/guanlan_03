import { Card, Tag, Typography, Button, Space, Table, Alert, Badge, Empty, Row, Col } from 'antd'
import { ReloadOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons'
import { useEffect, useState, useRef, useCallback } from 'react'

const { Title, Text } = Typography

interface FeedEvent {
  event_type: string
  timestamp: string
  data: any
}

const WS_URL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/feed`

export default function FeedPage() {
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<any>(null)
  const eventsRef = useRef<FeedEvent[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // 过滤统计
  const signalCount = events.filter(e => e.event_type === 'signal').length
  const orderCount = events.filter(e => e.event_type === 'order').length
  const infoCount = events.filter(e => e.event_type === 'info').length

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        addEvent({ event_type: 'info', timestamp: new Date().toISOString(), data: { message: '已连接到Feed服务' } })
        // 发送心跳
        ws.send(JSON.stringify({ type: 'ping' }))
      }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          addEvent(event)
        } catch { }
      }

      ws.onclose = () => {
        setConnected(false)
        addEvent({ event_type: 'info', timestamp: new Date().toISOString(), data: { message: 'Feed连接断开，10秒后重连...' } })
        wsRef.current = null
        reconnectTimer.current = setTimeout(connect, 10000)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch (err) {
      addEvent({ event_type: 'error', timestamp: new Date().toISOString(), data: { message: `连接失败: ${err}` } })
      reconnectTimer.current = setTimeout(connect, 10000)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }, [])

  const addEvent = (event: FeedEvent) => {
    eventsRef.current = [event, ...eventsRef.current].slice(0, 500)
    setEvents([...eventsRef.current])
  }

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  // 自动滚动
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [events, autoScroll])

  const clearEvents = () => {
    eventsRef.current = []
    setEvents([])
  }

  const eventColor = (type: string) => {
    switch (type) {
      case 'signal': return 'blue'
      case 'order': return 'orange'
      case 'position': return 'purple'
      case 'pnl': return 'cyan'
      case 'error': return 'red'
      default: return 'default'
    }
  }

  const eventLabel = (type: string) => {
    switch (type) {
      case 'signal': return '📡 信号'
      case 'order': return '📋 订单'
      case 'position': return '📦 持仓'
      case 'pnl': return '💰 盈亏'
      case 'error': return '❌ 错误'
      default: return 'ℹ️ 信息'
    }
  }

  const formatData = (data: any): string => {
    if (!data) return ''
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  const subscriptionCode = `// WebSocket订阅示例
const ws = new WebSocket('ws://localhost:8000/ws/feed');

ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  console.log(event.event_type, event.data);
};

// 心跳
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);`

  return (
    <div>
      <Title level={4}>实时 Feed</Title>

      <Space style={{ marginBottom: 16 }}>
        <Badge status={connected ? 'success' : 'error'} text={connected ? '已连接' : '未连接'} />
        <Tag color={connected ? 'green' : 'red'}>{connected ? 'WebSocket 在线' : '离线'}</Tag>
        {!connected && (
          <Button size="small" icon={<ReloadOutlined />} onClick={connect}>重连</Button>
        )}
        {connected && (
          <Button size="small" icon={<CloseCircleOutlined />} onClick={disconnect}>断开</Button>
        )}
        <Button size="small" onClick={clearEvents}>清空事件</Button>
        <Button size="small" onClick={() => setAutoScroll(!autoScroll)}>
          自动滚动: {autoScroll ? '开' : '关'}
        </Button>
      </Space>

      <Row gutter={[16, 16]}>
        <Col span={16}>
          <Card title={
            <Space>
              <SyncOutlined spin={connected} />
              <span>事件流 ({events.length})</span>
            </Space>
          } size="small" bodyStyle={{ padding: 0 }}>
            <div ref={containerRef} style={{ height: 500, overflow: 'auto', padding: 8 }}>
              {events.length === 0 ? (
                <Empty description="暂无事件，启动模拟交易后会自动推送" style={{ padding: 40 }} />
              ) : (
                events.map((e, i) => (
                  <div key={i} style={{
                    padding: '6px 8px',
                    borderBottom: '1px solid #f5f5f5',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}>
                    <Space>
                      <Tag color={eventColor(e.event_type)} style={{ fontSize: 11 }}>
                        {eventLabel(e.event_type)}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {e.timestamp?.slice(11, 19) || ''}
                      </Text>
                    </Space>
                    <div style={{ marginTop: 2, color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {formatData(e.data)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card title="事件统计" size="small" style={{ marginBottom: 16 }}>
            <Table dataSource={[
              { type: '📡 信号', count: signalCount },
              { type: '📋 订单', count: orderCount },
              { type: 'ℹ️ 信息', count: infoCount },
            ]} rowKey="type" size="small" pagination={false}
              columns={[
                { title: '事件类型', dataIndex: 'type', key: 'type' },
                { title: '数量', dataIndex: 'count', key: 'count' },
              ]} />
          </Card>

          <Card title="客户端订阅指南" size="small">
            <Alert type="info" showIcon message="WebSocket端点" description={WS_URL} style={{ marginBottom: 8 }} />
            <pre style={{
              background: '#f6f8fa',
              padding: 8,
              borderRadius: 4,
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 300,
            }}>
              {subscriptionCode}
            </pre>
            <Text type="secondary" style={{ fontSize: 11 }}>
              事件类型: signal(策略信号), order(成交订单), position(持仓变更), pnl(盈亏更新), info(信息), error(错误)
            </Text>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
