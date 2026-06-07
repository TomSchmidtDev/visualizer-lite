// packages/web/src/components/ShotCard.tsx
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Shot } from '../types.js'

interface Props {
  shot: Omit<Shot, 'shotData'>
  onSelect?: (id: string) => void
}

interface SparkSeries { data: number[]; color: string }

function Sparkline({ series }: { series: SparkSeries[] }) {
  const W = 120, H = 44, PAD = 2
  // Compute global min/max across all series for shared scale
  const allVals = series.flatMap((s) => s.data)
  if (allVals.length === 0) return null
  const min = Math.min(...allVals)
  const max = Math.max(...allVals)
  const range = max - min || 1

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {series.map(({ data, color }, si) => {
        if (data.length < 2) return null
        const pts = data.map((v, i) => {
          const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD)
          const y = H - PAD - ((v - min) / range) * (H - 2 * PAD)
          return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        return (
          <polyline
            key={si}
            points={pts.join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.85"
          />
        )
      })}
    </svg>
  )
}

export default function ShotCard({ shot, onSelect }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const date = new Date(shot.startTime)
  const day = date.getDate()
  const month = date.toLocaleString('default', { month: 'short' })
  const showYear = date.getFullYear() !== new Date().getFullYear()
  const year = date.getFullYear()
  const time = date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' })
  const ratio = shot.beanWeight && shot.drinkWeight
    ? `1 : ${(shot.drinkWeight / shot.beanWeight).toFixed(2)}`
    : null

  const sparkSeries: SparkSeries[] = [
    shot.sparkline?.pressure   && { data: shot.sparkline.pressure,   color: '#5cb85c' },
    shot.sparkline?.flow       && { data: shot.sparkline.flow,       color: '#4fa6e8' },
    shot.sparkline?.weightFlow && { data: shot.sparkline.weightFlow, color: '#c87d32' },
  ].filter(Boolean) as SparkSeries[]

  return (
    <div
      className="card"
      onClick={() => onSelect ? onSelect(shot.id) : navigate(`/shots/${shot.id}`)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        gap: 16,
        alignItems: 'center',
        cursor: 'pointer',
        marginBottom: 8,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-dim)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Date */}
      <div style={{ textAlign: 'center', minWidth: 40 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{day}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{month}</div>
        {showYear && <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 0.5 }}>{year}</div>}
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{time}</div>
      </div>

      {/* Info */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>
          {[shot.beanType, shot.beanBrand].filter(Boolean).join(' — ') || t('common.unknownShot')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          {[shot.profileTitle, shot.grinderModel, shot.grinderSetting].filter(Boolean).join(' · ')}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {shot.beanWeight && shot.drinkWeight && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>
              {shot.beanWeight}g → {shot.drinkWeight}g
            </span>
          )}
          {shot.duration && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {shot.duration.toFixed(0)}{t('common.seconds')}
            </span>
          )}
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ width: 120, opacity: 0.9 }}>
        {sparkSeries.length > 0
          ? <Sparkline series={sparkSeries} />
          : (
            <svg width="120" height="44" viewBox="0 0 120 44">
              <line x1="0" y1="42" x2="120" y2="42" stroke="var(--border)" strokeWidth="1" />
            </svg>
          )
        }
      </div>

      {/* Stats */}
      <div style={{ textAlign: 'right', minWidth: 80 }}>
        {shot.beverageType && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'capitalize' }}>
            {shot.beverageType}
          </div>
        )}
        {ratio && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>{t('shots.ratio')}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{ratio}</div>
          </>
        )}
        {shot.espressoEnjoyment != null && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
            <div style={{ width: 50, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${shot.espressoEnjoyment}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{shot.espressoEnjoyment}</span>
          </div>
        )}
      </div>
    </div>
  )
}
