import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import Dashboard from './pages/Dashboard'
import BacktestPage from './pages/BacktestPage'
import TradingDashboard from './pages/TradingDashboard'
import DiscoveryPage from './pages/DiscoveryPage'
import FeedPage from './pages/FeedPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/trading" element={<TradingDashboard />} />
        <Route path="/discovery" element={<DiscoveryPage />} />
        <Route path="/feed" element={<FeedPage />} />
      </Route>
    </Routes>
  )
}
