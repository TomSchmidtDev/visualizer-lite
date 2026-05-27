// packages/web/src/components/ShotChart.tsx
import { useRef, useEffect, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useTranslation } from 'react-i18next'
import type { ProfileStep, ShotData } from '../types.js'

interface Channel {
  key: string
  labelKey: string
  color: string
  dash?: number[]
  width?: number
  unit: string
}

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

// Default-aktive Kanäle in der Detailansicht
const DEFAULT_CHANNELS = new Set([
  'espresso_pressure', 'espresso_pressure_goal',
  'espresso_flow', 'espresso_flow_goal',
  'espresso_flow_weight',
])

const TEMP_CHANNELS = new Set([
  'espresso_temperature_mix', 'espresso_temperature_basket',
])

// Sentinel-Werte der DE1:
//   Upload-Format:   step = 0 < v < 9_000_000
//   DE1-API-Format:  step = Übergang +10_000_000 → -10_000_000
const STATE_SENTINEL     =  9_000_000
const DE1_POS_SENTINEL   = 10_000_000
const DE1_NEG_SENTINEL   = -9_000_000

/** Liefert die Zeitpunkte (in Sekunden) der Profil-Steps aus espresso_state_change */
function getStepTimes(stateChange: number[] | undefined, timeframe: number[]): number[] {
  if (!stateChange || !timeframe.length) return []
  const seen = new Set<number>()
  const result: number[] = []
  for (let i = 1; i < stateChange.length; i++) {
    const v    = stateChange[i]
    const prev = stateChange[i - 1]
    const isStep =
      // Upload-Format: nicht-Sentinel positiver Wert
      (v > 0 && v < STATE_SENTINEL) ||
      // DE1-API-Format: Übergang +10M → -10M  oder  -10M → +10M
      (prev >= DE1_POS_SENTINEL && v <= DE1_NEG_SENTINEL) ||
      (prev <= DE1_NEG_SENTINEL && v >= DE1_POS_SENTINEL)
    if (isStep) {
      const t = Math.round(timeframe[i] * 100) / 100
      if (!seen.has(t)) { seen.add(t); result.push(t) }
    }
  }
  return result
}

// ─── Tooltip plugin ──────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, styles?: Partial<CSSStyleDeclaration>, text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (styles) Object.assign(e.style, styles)
  if (text != null) e.textContent = text
  return e
}

function tooltipPlugin(
  channels: Channel[],
  data: uPlot.AlignedData,
  stepTimes: number[],
  translate: (k: string) => string,
  profileSteps?: ProfileStep[],
): uPlot.Plugin {
  // Semi-transparent background so the chart shows through
  const tooltip = el('div', {
    position: 'absolute',
    background: 'rgba(10,13,26,0.72)',
    backdropFilter: 'blur(4px)',
    color: '#e2e8f0',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '8px',
    padding: '7px 10px',
    pointerEvents: 'none',
    fontSize: '11.5px',
    lineHeight: '1.6',
    display: 'none',
    zIndex: '100',
    boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
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

        while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild)

        const t0 = data[0][idx] as number

        // ── Zeit + Step-Badge ────────────────────────────────────────────────
        const nearStep = stepTimes.find((st) => Math.abs(st - t0) < 0.3)
        const stepIdx  = nearStep != null ? stepTimes.indexOf(nearStep) : -1
        const timeRow  = el('div', { color: '#94a3b8', marginBottom: '4px' })
        timeRow.appendChild(document.createTextNode(fmtTime(t0)))
        if (stepIdx >= 0) {
          const badge = el('span', {
            marginLeft: '8px', background: 'rgba(255,255,255,0.15)',
            borderRadius: '4px', padding: '1px 6px', fontSize: '10px', color: '#e2e8f0',
          }, `Step ${stepIdx + 1}`)
          timeRow.appendChild(badge)
        }
        tooltip.appendChild(timeRow)

        // ── Profil-Step Details ──────────────────────────────────────────────
        const currentStepIndex = stepTimes.filter((st) => st <= t0).length
        const step = profileSteps?.[currentStepIndex]
        if (step) {
          tooltip.appendChild(el('div', {
            borderTop: '1px solid rgba(255,255,255,0.10)', margin: '4px 0',
          }))
          const nameRow = el('div', { fontWeight: '600', color: '#e2e8f0', marginBottom: '2px' })
          nameRow.textContent = step.name
          tooltip.appendChild(nameRow)
          const pumpRow = el('div', { color: '#94a3b8', fontSize: '10.5px' })
          pumpRow.textContent = `${step.pump} · ${step.transition}`
          tooltip.appendChild(pumpRow)
          const parts: string[] = []
          if (step.temperature) parts.push(`${step.temperature}°C`)
          if (step.pump === 'pressure' && step.pressure) parts.push(`${step.pressure} bar`)
          if (step.pump === 'flow'     && step.flow)     parts.push(`${step.flow} ml/s`)
          if (step.seconds && step.seconds !== '0')      parts.push(`${step.seconds}s`)
          if (step.limiter?.value)                        parts.push(`lim ${step.limiter.value}`)
          if (parts.length) {
            const paramRow = el('div', { color: '#94a3b8', fontSize: '10.5px' })
            paramRow.textContent = parts.join(' · ')
            tooltip.appendChild(paramRow)
          }
          if (step.exit) {
            const exitRow = el('div', { color: '#64748b', fontSize: '10px', marginTop: '1px' })
            exitRow.textContent = `exit: ${step.exit.condition} ${step.exit.type} ${step.exit.value}`
            tooltip.appendChild(exitRow)
          }
        }

        // ── Kanal-Werte in 2 Spalten ─────────────────────────────────────────
        tooltip.appendChild(el('div', {
          borderTop: '1px solid rgba(255,255,255,0.10)', margin: '4px 0 2px',
        }))

        // Collect rows that actually have data at this cursor position
        const rows: HTMLElement[] = []
        channels.forEach((ch, ci) => {
          const val = (data[ci + 1] as Float64Array)?.[idx]
          if (val == null || isNaN(val)) return
          const row = el('div', { display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' })
          const swatch = el('span', { display: 'inline-block', width: '14px', flexShrink: '0' })
          swatch.style.borderTop = ch.dash ? `1.5px dashed ${ch.color}` : `2px solid ${ch.color}`
          row.appendChild(swatch)
          row.appendChild(el('span', { color: '#cbd5e1' }, translate(ch.labelKey) + ':'))
          row.appendChild(el('strong', { color: '#f1f5f9' },
            ` ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ch.unit}`
          ))
          rows.push(row)
        })

        // Split into two columns
        const half = Math.ceil(rows.length / 2)
        const grid = el('div', {
          display: 'grid',
          gridTemplateColumns: rows.length > 1 ? '1fr 1fr' : '1fr',
          columnGap: '14px',
          rowGap: '0px',
        })
        rows.forEach((row, i) => {
          // Place first half in column 1, second half in column 2
          row.style.gridColumn = i < half ? '1' : '2'
          row.style.gridRow    = String(i < half ? i + 1 : i - half + 1)
          grid.appendChild(row)
        })
        tooltip.appendChild(grid)

        tooltip.style.display = 'block'
        const ow = u.over.offsetWidth, oh = u.over.offsetHeight
        const tw = tooltip.offsetWidth || 260, th = tooltip.offsetHeight || 120
        tooltip.style.left = `${left + 15 + tw > ow ? left - tw - 10 : left + 15}px`
        tooltip.style.top  = `${(top ?? 0) + 10 + th > oh ? (top ?? 0) - th - 5 : (top ?? 0) + 10}px`
      },
    },
  }
}

// ─── Step-Markierungen plugin ─────────────────────────────────────────────────

function stepMarkersPlugin(stepTimes: number[]): uPlot.Plugin {
  if (stepTimes.length === 0) return { hooks: {} }
  return {
    hooks: {
      draw: (u) => {
        const ctx = u.ctx
        const { left, top, width, height } = u.bbox
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.font = '10px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.textAlign = 'center'

        stepTimes.forEach((t, i) => {
          const x = Math.round(u.valToPos(t, 'x', true))
          if (x < left || x > left + width) return
          ctx.beginPath()
          ctx.moveTo(x, top)
          ctx.lineTo(x, top + height)
          ctx.stroke()
          // Label
          ctx.setLineDash([])
          ctx.fillText(`${i + 1}`, x, top + 10)
          ctx.setLineDash([4, 4])
        })
        ctx.restore()
      },
    },
  }
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

interface Props { shotData: ShotData }

export default function ShotChart({ shotData }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)
  const sd = shotData as unknown as Record<string, number[] | undefined>

  const [visible, setVisible] = useState<Set<string>>(() =>
    new Set(CHANNELS.filter((c) => sd[c.key] && DEFAULT_CHANNELS.has(c.key)).map((c) => c.key))
  )
  const [tempMode, setTempMode] = useState(false)
  const prevVisible = useRef<Set<string>>(visible)

  const toggle = (key: string) => {
    if (tempMode) return // im Temp-Modus kein Einzelschalten
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleTempMode = () => {
    if (!tempMode) {
      prevVisible.current = new Set(visible)
      setVisible(new Set(CHANNELS.filter((c) => sd[c.key] && TEMP_CHANNELS.has(c.key)).map((c) => c.key)))
    } else {
      setVisible(new Set(prevVisible.current))
    }
    setTempMode((m) => !m)
  }

  const stepTimes = getStepTimes(sd['espresso_state_change'], shotData.timeframe)

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
        label: t(c.labelKey), stroke: c.color, width: c.width ?? 2, dash: c.dash,
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
          { stroke: '#64748b', label: 's', size: 40, ticks: { stroke: '#1e293b' }, grid: { show: false } },
          { stroke: '#64748b', size: 50, ticks: { stroke: '#1e293b' }, grid: { stroke: '#1e293b' } },
        ],
        series,
        plugins: [
          stepMarkersPlugin(stepTimes),
          tooltipPlugin(activeChannels, data, stepTimes, t, shotData.profileSteps),
        ],
      },
      data,
      containerRef.current
    )

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [visible, shotData, t, stepTimes])

  const hasTempData = CHANNELS.some((c) => TEMP_CHANNELS.has(c.key) && sd[c.key])

  return (
    <div>
      {/* Toolbar: Kanal-Toggles + Temp-Schalter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {CHANNELS.filter((c) => sd[c.key]).map((c) => (
          <button
            key={c.key}
            onClick={() => toggle(c.key)}
            disabled={tempMode}
            style={{
              background: visible.has(c.key) ? `${c.color}22` : 'var(--bg-input)',
              border: `1px solid ${visible.has(c.key) ? c.color : 'var(--border-focus)'}`,
              borderRadius: 4, padding: '3px 10px', fontSize: 11,
              color: visible.has(c.key) ? c.color : 'var(--text-muted)',
              cursor: tempMode ? 'default' : 'pointer',
              opacity: tempMode && !TEMP_CHANNELS.has(c.key) ? 0.4 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block', width: 14, height: 0,
              borderTop: c.dash ? `1.5px dashed ${c.color}` : `2px solid ${c.color}`,
            }} />
            {t(c.labelKey)}
          </button>
        ))}

        {hasTempData && (
          <button
            onClick={toggleTempMode}
            style={{
              marginLeft: 8,
              background: tempMode ? '#e87d3222' : 'var(--bg-input)',
              border: `1px solid ${tempMode ? '#e87d32' : 'var(--border-focus)'}`,
              borderRadius: 4, padding: '3px 12px', fontSize: 11,
              color: tempMode ? '#e87d32' : 'var(--text-muted)',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            {tempMode ? '↩ ' : ''}°C
          </button>
        )}
      </div>

      {/* uPlot chart */}
      <div style={{ background: 'var(--bg)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <div ref={containerRef} />
      </div>
    </div>
  )
}
