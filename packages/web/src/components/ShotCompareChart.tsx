// packages/web/src/components/ShotCompareChart.tsx
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
  { key: 'espresso_pressure',           labelKey: 'detail.pressure',    color: '#5cb85c', width: 2.5 },
  { key: 'espresso_pressure_goal',      labelKey: 'detail.pressureGoal',color: '#5cb85c', dash: [5, 4], width: 1.5 },
  { key: 'espresso_flow',               labelKey: 'detail.flow',        color: '#4fa6e8', width: 2 },
  { key: 'espresso_flow_goal',          labelKey: 'detail.flowGoal',    color: '#4fa6e8', dash: [5, 4], width: 1.5 },
  { key: 'espresso_flow_weight',        labelKey: 'detail.weightFlow',  color: '#c87d32', width: 1.8 },
]

const DEFAULT_CHANNELS = new Set([
  'espresso_pressure', 'espresso_pressure_goal',
  'espresso_flow', 'espresso_flow_goal',
  'espresso_flow_weight',
])

/** Align srcData (indexed by srcTime) to dstTime using nearest-neighbour lookup. */
function alignData(srcTime: number[], srcData: number[], dstTime: number[]): (number | null)[] {
  if (!srcTime.length || !srcData.length) return dstTime.map(() => null)
  const maxT = srcTime[srcTime.length - 1]
  return dstTime.map((t) => {
    if (t > maxT + 0.5) return null
    let lo = 0, hi = srcTime.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (srcTime[mid] < t) lo = mid + 1
      else hi = mid
    }
    return srcData[lo] ?? null
  })
}

/** Append 'b3' to a 6-digit hex color to get 70% opacity. */
function withOpacity(hex: string): string {
  return hex + 'b3'
}

interface Props {
  shotDataA: ShotData
  shotDataB: ShotData
  labelA: string
  labelB: string
  tooltipOpacity?: number
}

export default function ShotCompareChart({ shotDataA, shotDataB, labelA, labelB }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)

  const sdA = shotDataA as unknown as Record<string, number[] | undefined>
  const sdB = shotDataB as unknown as Record<string, number[] | undefined>

  const [visible, setVisible] = useState<Set<string>>(() =>
    new Set(CHANNELS
      .filter((c) => DEFAULT_CHANNELS.has(c.key) && (sdA[c.key] || sdB[c.key]))
      .map((c) => c.key)
    )
  )

  const toggle = (key: string) =>
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current?.destroy()

    const activeChannels = CHANNELS.filter((c) => visible.has(c.key) && (sdA[c.key] || sdB[c.key]))
    if (activeChannels.length === 0) return

    const timeA = shotDataA.timeframe
    const timeB = shotDataB.timeframe
    const time = timeA.length >= timeB.length ? timeA : timeB

    // Use regular arrays (not Float64Array) for A/B series so null values are
    // preserved — uPlot renders nulls as gaps rather than zero.
    const data: uPlot.AlignedData = [
      Float64Array.from(time),
      ...activeChannels.flatMap((c) => {
        const rawA = sdA[c.key]
        const rawB = sdB[c.key]
        const seriesA: (number | null)[] = rawA
          ? alignData(timeA, rawA, time)
          : time.map(() => null)
        const seriesB: (number | null)[] = rawB
          ? alignData(timeB, rawB, time)
          : time.map(() => null)
        return [seriesA, seriesB]
      }),
    ]

    const series: uPlot.Series[] = [
      {},
      ...activeChannels.flatMap((c) => [
        { label: `${t(c.labelKey)} A`, stroke: c.color, width: c.width ?? 2, dash: c.dash },
        { label: `${t(c.labelKey)} B`, stroke: withOpacity(c.color), width: (c.width ?? 2) * 0.85, dash: [4, 3] },
      ]),
    ]

    chartRef.current = new uPlot(
      {
        width: containerRef.current.offsetWidth || 700,
        height: 300,
        cursor: { show: true },
        legend: { show: false },
        scales: { x: { time: false } },
        axes: [
          { stroke: '#64748b', label: 's', size: 40, ticks: { stroke: '#1e293b' }, grid: { show: false } },
          { stroke: '#64748b', size: 50, ticks: { stroke: '#1e293b' }, grid: { stroke: '#1e293b' } },
        ],
        series,
      },
      data,
      containerRef.current
    )

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [visible, shotDataA, shotDataB, t])

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 20, height: 0, borderTop: '2.5px solid var(--accent)' }} />
          <span style={{ color: 'var(--accent)' }}>{labelA}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 20, height: 0, borderTop: '2px dashed #c87d32' }} />
          <span style={{ color: '#c87d32' }}>{labelB}</span>
        </span>
      </div>

      {/* Channel toggles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {CHANNELS.filter((c) => sdA[c.key] || sdB[c.key]).map((c) => (
          <button
            key={c.key}
            onClick={() => toggle(c.key)}
            style={{
              background: visible.has(c.key) ? `${c.color}22` : 'var(--bg-input)',
              border: `1px solid ${visible.has(c.key) ? c.color : 'var(--border-focus)'}`,
              borderRadius: 4, padding: '3px 10px', fontSize: 11,
              color: visible.has(c.key) ? c.color : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: c.dash ? `1.5px dashed ${c.color}` : `2px solid ${c.color}` }} />
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      <div ref={containerRef} />
    </div>
  )
}
