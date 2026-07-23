/**
 * K线图组件 — 基于 echarts
 * 显示K线 + 均线(MA5/MA10/MA20) + 策略信号(全部) + 成交标记(仅已执行)
 *
 * 标记说明:
 *   🔴 实心"买" = 买入且成交
 *   🟢 实心"卖" = 卖出且成交
 *   ◯ 红色空心 = 买入信号(未成交，如资金不足)
 *   ◯ 绿色空心 = 卖出信号(未成交，如无持仓)
 */
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, Spin, Tag, Space } from 'antd'

interface KLineData {
  date: string
  open: number
  close: number
  high: number
  low: number
}

interface SignalPoint {
  date: string
  direction: 'buy' | 'sell'
  price: number
  reason?: string
  executed?: boolean
  reason_detail?: string
}

interface Props {
  klineData: KLineData[]
  trades?: SignalPoint[]
  signals?: SignalPoint[]
  loading?: boolean
  height?: number
  title?: string
  stockName?: string             // 标的名称
  onRangeSelect?: (start: string, end: string) => void  // 框选回调
}

export default function KLineChart({
  klineData, trades = [], signals = [],
  loading, height = 420, title = 'K线图',
  stockName, onRangeSelect,
}: Props) {
  const option = useMemo(() => {
    if (!klineData || klineData.length === 0) return {}

    const dates = klineData.map(d => d.date)
    const ohlc = klineData.map(d => [d.open, d.close, d.low, d.high])
    const closes = klineData.map(d => d.close)
    const volumes = klineData.map(d => d.close)

    // ── 均线 ──
    const ma5 = calcMA(closes, 5)
    const ma10 = calcMA(closes, 10)
    const ma20 = calcMA(closes, 20)

    // ── 构建标记数据 ──
    // 用 Map 去重: 同一天同方向的信号只显示一次
    const signalMap = new Map<string, SignalPoint>()
    for (const s of signals) {
      const key = `${s.date}_${s.direction}`
      // 优先保留已成交的记录
      if (!signalMap.has(key) || s.executed) {
        signalMap.set(key, s)
      }
    }
    const allSignals = Array.from(signalMap.values())

    // 已成交的买入/卖出 (from trades)
    const executedBuyKeys = new Set(
      trades.filter(t => t.direction === 'buy').map(t => `${t.date}_buy`)
    )
    const executedSellKeys = new Set(
      trades.filter(t => t.direction === 'sell').map(t => `${t.date}_sell`)
    )

    // 生成标记：已成交用实心pin，未成交用空心+小圆点
    const markData: any[] = []

    for (const s of allSignals) {
      const idx = dates.indexOf(s.date)
      if (idx === -1) continue
      const key = `${s.date}_${s.direction}`
      const isExecuted = s.direction === 'buy'
        ? executedBuyKeys.has(key)
        : executedSellKeys.has(key)

      if (isExecuted) {
        // ── 已成交：实心 pin ──
        const isBuy = s.direction === 'buy'
        markData.push({
          name: s.reason || (isBuy ? '买入' : '卖出'),
          coord: [dates[idx], s.price],
          symbol: 'pin',
          symbolSize: 34,
          itemStyle: { color: isBuy ? '#b53333' : '#4d7c3f' },
          label: {
            show: true,
            formatter: isBuy ? '买' : '卖',
            fontSize: 11, color: '#fff', fontWeight: 600,
          },
        })
      } else {
        // ── 未成交：空心菱形 ──
        const isBuy = s.direction === 'buy'
        markData.push({
          name: s.reason || (isBuy ? '买入信号' : '卖出信号'),
          coord: [dates[idx], s.price],
          symbol: 'diamond',
          symbolSize: 16,
          symbolRotate: 45,
          itemStyle: {
            color: isBuy ? '#b53333' : '#4d7c3f',
            opacity: 0.7,
          },
          label: {
            show: true,
            formatter: isBuy ? '↑' : '↓',
            fontSize: 12, color: isBuy ? '#b53333' : '#4d7c3f',
            fontWeight: 600,
            position: 'top',
            distance: 6,
          },
        })
      }
    }

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: [
        { left: '8%', right: '6%', top: 50, height: '54%' },
        { left: '8%', right: '6%', top: '74%', height: '16%' },
      ],

      xAxis: [
        {
          type: 'category',
          data: dates,
          gridIndex: 0,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { show: false },
          splitLine: { show: false },
        },
        {
          type: 'category',
          data: dates,
          gridIndex: 1,
          axisLabel: {
            fontSize: 10,
            color: '#87867f',
            interval: Math.max(Math.floor(dates.length / 8), 1),
          },
          axisLine: { lineStyle: { color: '#e8e6dc' } },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],

      yAxis: [
        {
          scale: true,
          gridIndex: 0,
          splitLine: { lineStyle: { color: '#f0eee6', type: 'dashed' } },
          axisLabel: { fontSize: 10, color: '#87867f' },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        {
          scale: true,
          gridIndex: 1,
          splitLine: { show: false },
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        },
      ],

      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 0,
          end: 100,
          minSpan: 10,
        },
        {
          show: true,
          type: 'slider',
          xAxisIndex: [0, 1],
          start: Math.max(0, 100 - Math.floor(80 / dates.length * 100)),
          end: 100,
          height: 16,
          bottom: 2,
          borderColor: '#e8e6dc',
          fillerColor: 'rgba(201,100,66,0.08)',
          handleStyle: { color: '#c96442' },
          textStyle: { fontSize: 10, color: '#87867f' },
          backgroundColor: 'transparent',
          selectedDataBackground: { lineStyle: { color: '#c96442' } },
        },
      ],

      // ── 框选区间（默认关闭，需点击工具箱按钮激活） ──
      brush: onRangeSelect ? {
        xAxisIndex: 0,
        brushMode: 'single',
        brushStyle: { borderWidth: 1.5, color: 'rgba(201,100,66,0.12)', borderColor: '#c96442' },
        throttleType: 'debounce',
        throttleDelay: 300,
        transformable: false,
      } : undefined,

      toolbox: onRangeSelect ? {
        show: true,
        right: 36,
        top: 6,
        itemSize: 14,
        iconStyle: { borderColor: '#87867f', borderWidth: 1 },
        feature: {
          brush: {
            type: ['rect', 'clear'],
            title: { rect: '框选区间', clear: '清除' },
          },
          mySelectAll: {
            show: true,
            title: '全选',
            icon: 'path://M864 864H160V160h704v704z m-640-64h576V224H224v576z',
            onclick: () => {
              if (klineData.length > 0) {
                onRangeSelect(klineData[0].date, klineData[klineData.length - 1].date)
              }
            },
          },
        },
      } : undefined,

      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: '#faf9f5',
        borderColor: '#e8e6dc',
        borderRadius: 8,
        padding: [10, 14],
        textStyle: { fontSize: 12, color: '#141413' },
        formatter: function (params: any) {
          // 合并tooltip: 显示K线 + 均线值
          if (!params || params.length === 0) return ''
          const candle = params.find((p: any) => p.seriesName === 'K线')
          if (!candle) return ''
          const d = candle.axisValue
          const values = candle.data || []
          let html = `<div style="font-weight:600;margin-bottom:4px">${d}</div>
            开: ${values[0]?.toFixed(2)}<br/>
            收: ${values[1]?.toFixed(2)}<br/>
            低: ${values[2]?.toFixed(2)}<br/>
            高: ${values[3]?.toFixed(2)}<hr style="margin:4px 0;border:none;border-top:1px solid #e8e6dc"/>`
          // 均线
          for (const p of params) {
            if (p.seriesName !== 'K线' && p.seriesName !== '成交量') {
              const val = p.value
              if (val != null) {
                html += `${p.marker} ${p.seriesName}: ${Number(val).toFixed(2)}<br/>`
              }
            }
          }
          return html
        },
      },

      // ── 图例 ──
      legend: {
        data: [
          { name: 'MA5', icon: 'line', textStyle: { fontSize: 11, color: '#5e5d59' } },
          { name: 'MA10', icon: 'line', textStyle: { fontSize: 11, color: '#5e5d59' } },
          { name: 'MA20', icon: 'line', textStyle: { fontSize: 11, color: '#5e5d59' } },
        ],
        top: 6,
        left: 12,
        icon: 'roundRect',
        itemWidth: 16,
        itemHeight: 2,
      },

      series: [
        // ── K线 ──
        {
          name: 'K线',
          type: 'candlestick',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: ohlc,
          itemStyle: {
            color: '#b53333',
            color0: '#4d7c3f',
            borderColor: '#b53333',
            borderColor0: '#4d7c3f',
          },
          markPoint: {
            symbol: 'pin',
            symbolSize: 34,
            data: markData,
          },
        },

        // ── MA5 ──
        {
          name: 'MA5',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: ma5,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { width: 1.5, color: '#c96442', opacity: 0.8 },
        },

        // ── MA10 ──
        {
          name: 'MA10',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: ma10,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { width: 1.5, color: '#3898ec', opacity: 0.7 },
        },

        // ── MA20 ──
        {
          name: 'MA20',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: ma20,
          symbol: 'none',
          connectNulls: true,
          lineStyle: { width: 1.5, color: '#87867f', opacity: 0.6, type: 'dashed' },
        },

        // ── 成交量柱 ──
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes.map((v, i) => {
            const d = klineData[i]
            return d.close >= d.open ? v : -v
          }),
          itemStyle: {
            color: (params: any) => params.value >= 0 ? '#4d7c3f' : '#b53333',
            opacity: 0.4,
          },
        },
      ],
    }
  }, [klineData, trades, signals])

  if (loading) {
    return (
      <Card title={title} size="small" style={{ minHeight: height + 60 }}>
        <div style={{ textAlign: 'center', padding: 80 }}><Spin tip="加载K线数据..." /></div>
      </Card>
    )
  }

  if (!klineData || klineData.length === 0) {
    return (
      <Card title={title} size="small" style={{ minHeight: height + 60 }}>
        <div style={{ textAlign: 'center', padding: 60, color: '#87867f', fontSize: 14 }}>
          暂无K线数据，请先运行回测
        </div>
      </Card>
    )
  }

  // 处理框选事件
  const onEvents: Record<string, Function> = {}
  if (onRangeSelect && klineData.length > 0) {
    const dates = klineData.map(d => d.date)
    onEvents.brushEnd = (params: any) => {
      if (!params?.areas || params.areas.length === 0) return
      const area = params.areas[0]
      if (!area?.coordRange) return
      let r = area.coordRange
      // coordRange 可能是 [xmin,xmax] 或 [[xmin,xmax],[ymin,ymax]]
      if (Array.isArray(r[0])) r = r[0]
      if (r.length < 2) return
      const si = Math.max(0, Math.floor(Math.min(r[0], r[1])))
      const ei = Math.min(dates.length - 1, Math.ceil(Math.max(r[0], r[1])) - 1)
      if (si >= 0 && ei >= 0 && si < ei) {
        onRangeSelect(dates[si], dates[ei])
      }
    }
  }

  return (
    <Card title={
      <Space size={12}>
        <span>{title}</span>
        {stockName && <span style={{ color: '#87867f', fontWeight: 400, fontSize: 13 }}>{stockName}</span>}
        <Tag color="#b53333" style={{ borderRadius: 4, fontSize: 11 }}>🔴 买入(成交)</Tag>
        <Tag color="#4d7c3f" style={{ borderRadius: 4, fontSize: 11 }}>🟢 卖出(成交)</Tag>
        <Tag style={{ borderRadius: 4, fontSize: 11, border: '1px solid #b53333', color: '#b53333', background: 'transparent' }}>
          ◇ 买入信号(未成交)
        </Tag>
        <Tag style={{ borderRadius: 4, fontSize: 11, border: '1px solid #4d7c3f', color: '#4d7c3f', background: 'transparent' }}>
          ◇ 卖出信号(未成交)
        </Tag>
      </Space>
    } size="small" bodyStyle={{ padding: '8px 0 0 0' }}>
      <ReactECharts option={option} style={{ height }} notMerge
        onEvents={onEvents} />
    </Card>
  )
}

function calcMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j]
      }
      result.push(Number((sum / period).toFixed(2)))
    }
  }
  return result
}
