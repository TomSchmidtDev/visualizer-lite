// packages/web/src/components/ShotChart.tsx
import { useRef, useEffect, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useTranslation } from 'react-i18next'
import type { ShotData } from '../types.js'

interface Channel {
  key: string
  labelKey: string
  color: string
  dash?: number[]
  width?: number
}

const CHANNELS: Channel[] = [
  { key: 'espresso_pressure',        labelKey: 'detail.pressure',       color: '#c8a96e', width: 2.5 },
  { key: 'espresso_pressure_goal',   labelKey: 'detail.pressureGoal',   color: '#c8a96e', dash: [4, 3], width: 1.5 },
  { key: 'espresso_flow',            labelKey: 'detail.flow',           color: '#4a9eff', width: 2 },
  { key: 'espresso_flow_goal',       labelKey: 'detail.flowGoal',       color: '#4a9eff', dash: [4, 3], width: 1.5 },
  { key: 'espresso_weight',          labelKey: 'detail.weight',         color: '#4ade80', width: 1.8 },
  { key: 'espresso_temperature_mix', labelKey: 'detail.tempMix',        color: '#fb923c', width: 1.5 },
  { key: 'espresso_temperature_basket', labelKey: 'detail.tempBasket',  color: '#fb923c', dash: [2, 3], width: 1.2 },
  { key: 'espresso_water_dispensed', labelKey: 'detail.waterDispensed', color: '#a78bfa', width: 1.5 },
]

interface Props {
  shotData: ShotData
}

export default function ShotChart({ shotData }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)
  const sd = shotData as Record<string, number[] | undefined>
  const [visible, setVisible] = useState<Set<string>>(
    new Set(CHANNELS.filter((c) => sd[c.key]).map((c) => c.key))
  )

  const toggle = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current?.destroy()

    const activeChannels = CHANNELS.filter((c) => visible.has(c.key) && sd[c.key])
    if (activeChannels.length === 0 || shotData.timeframe.length === 0) return

    const data: uPlot.AlignedData = [
      Float64Array.from(shotData.timeframe),
      ...activeChannels.map((c) => Float64Array.from(sd[c.key]!)),
    ]

    const series: uPlot.Series[] = [
      {},
      ...activeChannels.map((c) => ({
        label: t(c.labelKey),
        stroke: c.color,
        width: c.width ?? 2,
        dash: c.dash,
      })),
    ]

    chartRef.current = new uPlot(
      {
        width: containerRef.current.offsetWidth || 600,
        height: 280,
        cursor: { show: true },
        legend: { show: false },
        scales: { x: { time: false } },
        axes: [
          { label: 's', size: 40 },
          { label: '', size: 50 },
        ],
        series,
      },
      data,
      containerRef.current
    )

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [visible, shotData, t])

  return (
    <div>
      {/* Channel toggles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {CHANNELS.filter((c) => sd[c.key]).map((c) => (
          <button
            key={c.key}
            onClick={() => toggle(c.key)}
            style={{
              background: visible.has(c.key) ? `${c.color}22` : 'var(--bg-input)',
              border: `1px solid ${visible.has(c.key) ? c.color : 'var(--border-focus)'}`,
              borderRadius: 4,
              padding: '3px 10px',
              fontSize: 11,
              color: visible.has(c.key) ? c.color : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      {/* uPlot chart container */}
      <div style={{ background: 'var(--bg)', borderRadius: 8, overflow: 'hidden' }}>
        <div ref={containerRef} />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
        {CHANNELS.filter((c) => visible.has(c.key) && sd[c.key]).map((c) => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 14, height: 2, background: c.color, borderRadius: 1 }} />
            {t(c.labelKey)}
          </div>
        ))}
      </div>
    </div>
  )
}
