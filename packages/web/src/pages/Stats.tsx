import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client.js'
import type { Stats, StatsWindow } from '../types.js'

type Period = '24h' | '7d' | '14d' | '30d' | '180d' | '365d' | '730d' | '1095d' | 'all'
type Beverage = 'espresso' | 'filter' | 'all'

function delta(current: number | null, previous: number | null): { symbol: string; color: string } | null {
  if (current == null || previous == null || previous === 0) return null
  const pct = (current - previous) / Math.abs(previous)
  if (Math.abs(pct) < 0.02) return { symbol: '—', color: 'var(--text-muted)' }
  return pct > 0
    ? { symbol: '▲', color: '#44bb88' }
    : { symbol: '▼', color: '#ff8866' }
}

function fmt(value: number | null, unit: string): string {
  if (value == null) return '—'
  if (unit === 'g' && value >= 1000) return `${(value / 1000).toFixed(1)}kg`
  if (unit === 'g') return `${Math.round(value)}g`
  if (unit === 's') return `${Math.round(value)}s`
  if (unit === '★') return `${value.toFixed(1)}★`
  if (unit === '1:x') return `1:${value.toFixed(2)}`
  if (unit === 'n') return Number.isInteger(value) ? String(value) : value.toFixed(1)
  return String(value)
}

interface KpiTileProps {
  label: string
  value: number | null
  prevValue: number | null
  unit: string
  vsLabel: string
  prevLabel: string
  showPrevValue: boolean
}

function KpiTile({ label, value, prevValue, unit, vsLabel, prevLabel, showPrevValue }: KpiTileProps) {
  const d = delta(value, prevValue)
  const diffStr = d && value != null && prevValue != null && Math.abs(d.symbol === '—' ? 0 : value - prevValue) > 0
    ? (value - prevValue > 0 ? '+' : '') + fmt(value - prevValue, unit)
    : null

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--text)' }}>
        {fmt(value, unit)}
      </div>
      {d && (
        <div style={{ fontSize: 11, color: d.color, marginTop: 4 }}>
          {d.symbol}{diffStr ? ` ${diffStr}` : ''}
          {showPrevValue && prevValue != null
            ? <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>| {prevLabel}: {fmt(prevValue, unit)}</span>
            : <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{vsLabel}</span>
          }
        </div>
      )}
      {!d && <div style={{ height: 19 }} />}
    </div>
  )
}

interface TopListProps {
  title: string
  items: { name: string; count: number }[]
  noData: string
}

function TopList({ title, items, noData }: TopListProps) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 10 }}>
        {title.toUpperCase()}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{noData}</div>
      ) : (
        items.map((item, i) => (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, lineHeight: '2' }}>
            <span>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{i + 1}.</span>
              {item.name}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{item.count}×</span>
          </div>
        ))
      )}
    </div>
  )
}

const PERIODS: Period[] = ['24h', '7d', '14d', '30d', '180d', '365d', '730d', '1095d', 'all']
const BEVERAGES: Beverage[] = ['espresso', 'filter', 'all']

export default function StatsPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('365d')
  const [beverage, setBeverage] = useState<Beverage>('espresso')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() })
  const topN = settings?.statsTopN ?? 10
  const showPrevValue = settings?.statsShowPrevValue ?? true

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getStats(period, beverage, topN)
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [period, beverage, topN])

  const cur: StatsWindow | null = stats?.current ?? null
  const prev: StatsWindow | null = stats?.previous ?? null
  const vsLabel = t('stats.vsLabel')
  const prevLabel = t('stats.prevLabel')
  const noData = t('stats.noData')

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    fontSize: 12,
    borderRadius: 4,
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  })

  const tabStyle = (active: boolean, disabled = false): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: 13,
    color: active ? 'var(--accent)' : disabled ? 'var(--border)' : 'var(--text-muted)',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: active ? 600 : 400,
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  })

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{t('stats.title')}</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button style={tabStyle(true)}>{t('stats.tabDashboard')}</button>
        <button style={tabStyle(false, true)}>{t('stats.tabRoasters')}</button>
        <button style={tabStyle(false, true)}>{t('stats.tabProfiles')}</button>
      </div>

      {/* Beverage toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {BEVERAGES.map(b => (
          <button key={b} style={toggleStyle(beverage === b)} onClick={() => setBeverage(b)}>
            {t(`stats.beverage${b.charAt(0).toUpperCase() + b.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button key={p} style={toggleStyle(period === p)} onClick={() => setPeriod(p)}>
            {t(`stats.period${p}`)}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          {t('common.loading')}
        </div>
      )}

      {error && (
        <div style={{ color: '#ff8866', textAlign: 'center', padding: 40 }}>{error}</div>
      )}

      {!loading && !error && cur && (
        <>
          {/* KPI Row 1: Consumption */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <KpiTile label={t('stats.kpiShots')}   value={cur.shotCount}    prevValue={prev?.shotCount ?? null}    unit="n"   vsLabel={vsLabel} prevLabel={prevLabel} showPrevValue={showPrevValue} />
            <KpiTile label={t('stats.kpiBeans')}   value={cur.beanWeightG}  prevValue={prev?.beanWeightG ?? null}  unit="g"   vsLabel={vsLabel} prevLabel={prevLabel} showPrevValue={showPrevValue} />
            <KpiTile label={t('stats.kpiOutput')}  value={cur.drinkWeightG} prevValue={prev?.drinkWeightG ?? null} unit="g"   vsLabel={vsLabel} prevLabel={prevLabel} showPrevValue={showPrevValue} />
            <KpiTile label={t('stats.kpiRatio')}   value={cur.avgRatio}     prevValue={prev?.avgRatio ?? null}     unit="1:x" vsLabel={vsLabel} prevLabel={prevLabel} showPrevValue={showPrevValue} />
          </div>

          {/* KPI Row 2: Quality & Habit */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <KpiTile label={t('stats.kpiEnjoyment')}   value={cur.avgEnjoyment}  prevValue={prev?.avgEnjoyment ?? null}  unit="★"  vsLabel={vsLabel} prevLabel={prevLabel} showPrevValue={showPrevValue} />
            <KpiTile label={t('stats.kpiShotsPerDay')} value={cur.shotsPerDay}   prevValue={prev?.shotsPerDay ?? null}   unit="n"  vsLabel={vsLabel} prevLabel={prevLabel} showPrevValue={showPrevValue} />
            <KpiTile label={t('stats.kpiDuration')}    value={cur.avgDurationS}  prevValue={prev?.avgDurationS ?? null}  unit="s"  vsLabel={vsLabel} prevLabel={prevLabel} showPrevValue={showPrevValue} />
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 4 }}>
                {t('stats.kpiGrinder').toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                {cur.topGrinderSetting ?? '—'}
              </div>
            </div>
          </div>

          {/* Lists row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <TopList title={t('stats.topRoasters')} items={cur.topRoasters} noData={noData} />
            <TopList title={t('stats.topRoasts')}   items={cur.topRoasts}   noData={noData} />
            <TopList title={t('stats.topProfiles')} items={cur.topProfiles} noData={noData} />
          </div>
        </>
      )}
    </div>
  )
}
