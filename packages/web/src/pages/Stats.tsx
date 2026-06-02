import { useState, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client.js'
import { AnalysisPanel } from '../components/AnalysisPanel.js'
import type { Stats, StatsWindow, RoasterRow, ProfileRow, BeanRow, Analysis } from '../types.js'

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

type SortDir = 'asc' | 'desc'

interface ColDef {
  key: string
  label: string
  align?: 'left' | 'right'
  render: (value: unknown) => string
}

function SortableTable({
  columns,
  rows,
  initialSortKey,
  getRowKey,
  renderExpandToggle,
  renderSubRows,
}: {
  columns: ColDef[]
  rows: Record<string, unknown>[]
  initialSortKey: string
  getRowKey: (row: Record<string, unknown>) => string
  renderExpandToggle?: (row: Record<string, unknown>) => React.ReactNode
  renderSubRows?: (row: Record<string, unknown>) => React.ReactNode
}) {
  const [sortKey, setSortKey] = useState(initialSortKey)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: string) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
  })

  const thStyle = (col: ColDef): React.CSSProperties => ({
    textAlign: col.align ?? 'right',
    padding: '6px 8px',
    cursor: 'pointer',
    color: sortKey === col.key ? 'var(--accent)' : 'var(--text-muted)',
    fontSize: 11,
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {renderExpandToggle && <th style={{ width: 24, borderBottom: '1px solid var(--border)' }} />}
            {columns.map(col => (
              <th key={col.key} onClick={() => toggleSort(col.key)} style={thStyle(col)}>
                {col.label.toUpperCase()}
                {sortKey === col.key && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <Fragment key={getRowKey(row)}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {renderExpandToggle && (
                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                    {renderExpandToggle(row)}
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} style={{ textAlign: col.align ?? 'right', padding: '6px 8px', color: 'var(--text)' }}>
                    {col.render(row[col.key])}
                  </td>
                ))}
              </tr>
              {renderSubRows?.(row)}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoastersTab({ period, beverage }: { period: Period; beverage: Beverage }) {
  const { t } = useTranslation()
  const [data, setData] = useState<RoasterRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    api.getStatsRoasters(period, beverage)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [period, beverage])

  function toggle(roaster: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(roaster)) next.delete(roaster)
      else next.add(roaster)
      return next
    })
  }

  const columns: ColDef[] = [
    { key: 'roaster',          label: t('stats.colRoaster'),     align: 'left',  render: v => String(v ?? '—') },
    { key: 'shotCount',        label: t('stats.colShots'),                        render: v => v != null ? String(v) : '—' },
    { key: 'avgEnjoyment',     label: t('stats.colEnjoyment'),                    render: v => v != null ? `${v}★` : '—' },
    { key: 'avgRatio',         label: t('stats.colRatio'),                        render: v => v != null ? `1:${(v as number).toFixed(2)}` : '—' },
    { key: 'avgDurationS',     label: t('stats.colDuration'),                     render: v => v != null ? `${v}s` : '—' },
    { key: 'totalBeanWeightG', label: t('stats.colBeanWeight'),                   render: v => v != null ? fmt(v as number, 'g') : '—' },
  ]

  if (loading) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('common.loading')}</div>
  if (error)   return <div style={{ color: '#ff8866', textAlign: 'center', padding: 40 }}>{error}</div>
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('stats.noData')}</div>

  return (
    <SortableTable
      columns={columns}
      rows={data as unknown as Record<string, unknown>[]}
      initialSortKey="shotCount"
      getRowKey={row => row.roaster as string}
      renderExpandToggle={row => {
        const hasBeans = (row.beans as BeanRow[]).length > 0
        if (!hasBeans) return <span style={{ display: 'inline-block', width: 16 }} />
        return (
          <button
            onClick={() => toggle(row.roaster as string)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, padding: 0, lineHeight: 1 }}
            aria-label={expanded.has(row.roaster as string) ? t('stats.collapseRow') : t('stats.expandRow')}
          >
            {expanded.has(row.roaster as string) ? '▼' : '▶'}
          </button>
        )
      }}
      renderSubRows={row => {
        if (!expanded.has(row.roaster as string)) return null
        const beans = row.beans as BeanRow[]
        if (beans.length === 0) return null
        return beans.map(bean => (
          <tr key={bean.bean} style={{ background: 'var(--bg-card)' }}>
            <td />
            <td style={{ textAlign: 'left',  padding: '4px 8px 4px 24px', color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{bean.bean}</td>
            <td style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{bean.shotCount}</td>
            <td style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{bean.avgEnjoyment != null ? `${bean.avgEnjoyment}★` : '—'}</td>
            <td style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{bean.avgRatio != null ? `1:${bean.avgRatio.toFixed(2)}` : '—'}</td>
            <td style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{bean.avgDurationS != null ? `${bean.avgDurationS}s` : '—'}</td>
            <td style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontSize: 12, borderBottom: '1px solid var(--border)' }}>{fmt(bean.totalBeanWeightG, 'g')}</td>
          </tr>
        ))
      }}
    />
  )
}

function ProfilesTab({ period, beverage }: { period: Period; beverage: Beverage }) {
  const { t } = useTranslation()
  const [data, setData] = useState<ProfileRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    api.getStatsProfiles(period, beverage)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [period, beverage])

  const columns: ColDef[] = [
    { key: 'profile',        label: t('stats.colProfile'),      align: 'left', render: v => String(v ?? '—') },
    { key: 'shotCount',      label: t('stats.colShots'),                        render: v => v != null ? String(v) : '—' },
    { key: 'avgEnjoyment',   label: t('stats.colEnjoyment'),                    render: v => v != null ? `${v}★` : '—' },
    { key: 'avgDurationS',   label: t('stats.colDuration'),                     render: v => v != null ? `${v}s` : '—' },
    { key: 'avgRatio',       label: t('stats.colRatio'),                        render: v => v != null ? `1:${(v as number).toFixed(2)}` : '—' },
    { key: 'avgBeanWeightG', label: t('stats.colAvgBeanWeight'),                render: v => v != null ? `${v}g` : '—' },
  ]

  if (loading) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('common.loading')}</div>
  if (error)   return <div style={{ color: '#ff8866', textAlign: 'center', padding: 40 }}>{error}</div>
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('stats.noData')}</div>

  return (
    <SortableTable
      columns={columns}
      rows={data as unknown as Record<string, unknown>[]}
      initialSortKey="shotCount"
      getRowKey={row => row.profile as string}
    />
  )
}

export default function StatsPage() {
  const { t } = useTranslation()
  type ActiveTab = 'dashboard' | 'roasters' | 'profiles'
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')
  const [period, setPeriod] = useState<Period>('365d')
  const [beverage, setBeverage] = useState<Beverage>('espresso')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analysisData, setAnalysisData] = useState<Analysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisWindow, setAnalysisWindow] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

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

  async function handleAnalyzeTrends(regenerate = false) {
    setAnalysisLoading(true)
    setAnalysisError(null)
    try {
      const response = await api.analyzeShot('', { type: 'stats', window: analysisWindow, regenerate })
      setAnalysisData({ barista: response.barista, roaster: response.roaster, analyst: response.analyst })
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setAnalysisLoading(false)
    }
  }

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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: 13,
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    cursor: 'pointer',
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
        <button style={tabStyle(activeTab === 'dashboard')} onClick={() => setActiveTab('dashboard')}>{t('stats.tabDashboard')}</button>
        <button style={tabStyle(activeTab === 'roasters')} onClick={() => setActiveTab('roasters')}>{t('stats.tabRoasters')}</button>
        <button style={tabStyle(activeTab === 'profiles')} onClick={() => setActiveTab('profiles')}>{t('stats.tabProfiles')}</button>
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

      {activeTab === 'dashboard' && loading && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          {t('common.loading')}
        </div>
      )}

      {activeTab === 'dashboard' && error && (
        <div style={{ color: '#ff8866', textAlign: 'center', padding: 40 }}>{error}</div>
      )}

      {activeTab === 'dashboard' && !loading && !error && cur && (
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

      {activeTab === 'roasters' && (
        <RoastersTab period={period} beverage={beverage} />
      )}

      {activeTab === 'profiles' && (
        <ProfilesTab period={period} beverage={beverage} />
      )}

      {/* AI Analysis */}
      <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Timeframe:</span>
            {(['7d', '30d', '90d', 'all'] as const).map(w => (
              <button key={w} style={toggleStyle(analysisWindow === w)} onClick={() => setAnalysisWindow(w)}>
                {w}
              </button>
            ))}
          </div>
          <button onClick={() => handleAnalyzeTrends(false)} style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }} disabled title="Coming soon: aggregate trends analysis">
            {t('detail.analyzeTrends')}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Trend analysis coming soon. For now, click 🤖 on individual Shot Detail pages to see AI insights.</p>

        {(analysisData || analysisLoading || analysisError) && (
          <AnalysisPanel
            analysis={analysisData}
            loading={analysisLoading}
            error={analysisError}
            onRegenerate={() => handleAnalyzeTrends(true)}
          />
        )}
      </div>
    </div>
  )
}
