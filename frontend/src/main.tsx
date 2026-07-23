import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { createRoot } from 'react-dom/client'
import { claudeTheme } from './theme'

createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN} theme={claudeTheme}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ConfigProvider>
)
