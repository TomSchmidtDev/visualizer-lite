// packages/web/src/components/ShotCard.tsx
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Shot } from '../types.js'

interface Props {
  shot: Omit<Shot, 'shotData'>
}

export default function ShotCard({ shot }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const date = new Date(shot.startTime)
  const day = date.getDate()
  const month = date.toLocaleString('default', { month: 'short' })
  const ratio = shot.beanWeight && shot.drinkWeight
    ? `1 : ${(shot.drinkWeight / shot.beanWeight).toFixed(2)}`
    : null

  return (
    <div
      className="card"
      onClick={() => navigate(`/shots/${shot.id}`)}
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
      <div style={{ textAlign: 'center', minWidth: 48 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{day}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{month}</div>
      </div>

      {/* Info */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>
          {[shot.beanType, shot.beanBrand].filter(Boolean).join(' — ') || 'Unknown Shot'}
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

      {/* Sparkline placeholder */}
      <div style={{ width: 120, opacity: 0.6 }}>
        <svg width="120" height="44" viewBox="0 0 120 44">
          <line x1="0" y1="42" x2="120" y2="42" stroke="var(--border)" strokeWidth="1" />
        </svg>
      </div>

      {/* Stats */}
      <div style={{ textAlign: 'right', minWidth: 80 }}>
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
