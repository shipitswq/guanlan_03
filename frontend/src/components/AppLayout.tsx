import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  DollarOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { statusApi } from '../services/api'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/backtest', icon: <BarChartOutlined />, label: '回测分析' },
  { key: '/trading', icon: <DollarOutlined />, label: '模拟交易' },
  { key: '/feed', icon: <ApiOutlined />, label: '实时Feed' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [serverStatus, setServerStatus] = useState<string>('检查中...')

  useEffect(() => {
    const check = () => {
      statusApi.get()
        .then(r => setServerStatus(`在线 · ${r.feed_clients} 个Feed客户端 · ${r.active_strategies} 个策略`))
        .catch(() => setServerStatus('服务未连接'))
    }
    check()
    const timer = setInterval(check, 10000)
    return () => clearInterval(timer)
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        width={220}
        style={{
          background: '#30302e',
          borderRight: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        {/* Logo 区域 */}
        <div style={{
          height: 56,
          margin: '12px 12px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
          <span style={{
            width: 28, height: 28,
            background: '#c96442',
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            color: '#fff',
            fontWeight: 600,
          }}>Q</span>
          <span style={{
            color: '#e8e6dc',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}>量化交易</span>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: 'transparent',
            borderRight: 'none',
            marginTop: 4,
          }}
        />

        {/* 底部版本信息 */}
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 11,
          color: '#5e5d59',
        }}>
          通达信数据源 · v1.0
        </div>
      </Sider>

      <Layout style={{ background: '#f5f4ed' }}>
        <Header style={{
          background: '#faf9f5',
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          borderBottom: '1px solid #e8e6dc',
          height: 52,
          lineHeight: '52px',
        }}>
          <span style={{
            color: '#87867f',
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {serverStatus}
          </span>
        </Header>

        <Content style={{
          margin: 24,
          padding: 0,
          minHeight: 'calc(100vh - 52px - 48px)',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
