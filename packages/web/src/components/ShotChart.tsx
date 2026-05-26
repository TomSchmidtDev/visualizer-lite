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
  unit: string
}

// Colors matched to original Visualizer
const CHANNELS: Channel[] = [
  { key: 'espresso_pressure',           labelKey: 'detail.pressure',       color: '#5cb85c', width: 2.5, unit: 'bar' },
  { key: 'espresso_pressure_goal',      labelKey: 'detail.pressureGoal',   color: '#5cb85c', dash: [5, 4], width: 1.5, unit: 'bar' },
  { key: 'espresso_flow',               labelKey: 'detail.flow',           color: '#4fa6e8', width: 2,   unit: 'ml/s' },
  { key: 'espresso_flow_goal',          labelKey: 'detail.flowGoal',       color: '#4fa6e8', dash: [5, 4], width: 1.5, unit: 'ml/s' },
  { key: 'espresso_flow_weight',        labelKey: 'detail.weightFlow',     color: '#c87d32', width: 1.8, unit: 'g/s' },
  { key: 'espresso_weight',             labelKey: 'detail.weight',         color: '#a05a20', width: 1.8, unit: 'g' },
  { key: 'espresso_water_dispensed',    labelKey: 'detail.waterDispensed', color: '#64c8e0', width: 1.5, unit: 'ml' },
  { key: 'espresso_temperature_mix',    labelKey: 'detail.tempMix',        color: '#e87d32', width: 1.5, unit: '°C' },
  { key: 'espresso_temperature_basket', labelKey: 'detail.tempBasket',     color: '#e87d32', dash: [3, 3], width: 1.2, unit: '°C' },
  { key: 'espresso_resistance',         labelKey: 'detail.resistance',     color: '#f5e642', width: 1.5, unit: 'lΩ' },
]

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles?: Partial<CSSStyleDeclaration>,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (styles) Object.assign(e.style, styles)
  if (text != null) e.textContent = text
  return e
}

// uPlot plugin: floating tooltip on cursor move
function tooltipPlugin(
  channels: Channel[],
  data: uPlot.AlignedData,
  translate: (k: string) => string
): uPlot.Plugin {
  const tooltip = el('div', {
    position: 'absolute',
    background: 'rgba(10,13,26,0.93)',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    padding: '8px 12px',
    pointerEvents: 'none',
    fontSize: '12px',
    lineHeight: '1.75',
    display: 'none',
    zIndex: '100',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  })

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = (s % 60).toFixed(3).padStart(6, '0')
    return `${String(m).padStart(2, '0')}:${sec}`
  }

  return {
    hooks: {
      init: (u) => { u.over.appendChild(tooltip) },
      setCursor: (u) => {
        const { left, top, idx } = u.cursor
        if (idx == null || left == null) { tooltip.style.display = 'none'; return }

        // Clear and rebuild tooltip content
        while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild)

        const t0 = data[0][idx] as number
        tooltip.appendChild(el('div', { color: '#94a3b8', marginBottom: '3px' }, fmtTime(t0)))

        channels.forEach((ch, ci) => {
          const val = (data[ci + 1] as Float64Array)?.[idx]
          if (val == null || isNaN(val)) return

          const row = el('div', { display: 'flex', alignItems: 'center', gap: '6px' })

          const swatch = el('span', { display: 'inline-block', width: '16px' })
          swatch.style.borderTop = ch.dash
            ? `1.5px dashed ${ch.color}`
            : `2px solid ${ch.color}`
          row.appendChild(swatch)
          row.appendChild(el('span', {}, translate(ch.labelKey) + ':'))

          const valEl = el('strong', {}, `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ch.unit}`)
          row.appendChild(valEl)
          tooltip.appendChild(row)
        })

        tooltip.style.display = 'block'

        // Position: avoid right/bottom overflow
        const ow = u.over.offsetWidth
        const oh = u.over.offsetHeight
        const tw = tooltip.offsetWidth || 210
        const th = tooltip.offsetHeight || 120
        tooltip.style.left = `${left + 15 + tw > ow ? left - tw - 10 : left + 15}px`
        tooltip.style.top  = `${(top ?? 0) + 10 + th > oh ? (top ?? 0) - th - 5 : (top ?? 0) + 10}px`
      },
    },
  }
}

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
        width: containerRef.current.offsetWidth || 700,
        height: 300,
        cursor: { show: true },
        legend: { show: false },
        scales: { x: { time: false } },
        axes: [
          { stroke: '#64748b', label: 's', size: 40, ticks: { stroke: '#1e293b' }, grid: { stroke: '#1e293b' } },
          { stroke: '#64748b', size: 50, ticks: { stroke: '#1e293b' }, grid: { stroke: '#1e293b' } },
        ],
        series,
        plugins: [tooltipPlugin(activeChannels, data, t)],
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
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
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block', width: 14, height: 0,
              borderTop: c.dash ? `1.5px dashed ${c.color}` : `2px solid ${c.color}`,
            }} />
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      {/* uPlot chart */}
      <div style={{ background: 'var(--bg)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <div ref={containerRef} />
      </div>
    </div>
  )
}
