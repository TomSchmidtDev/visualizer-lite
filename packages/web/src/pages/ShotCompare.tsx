// packages/web/src/pages/ShotCompare.tsx
import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.js'
import ShotChart from '../components/ShotChart.js'
import ShotCompareChart from '../components/ShotCompareChart.js'
import TastingScores from '../components/TastingScores.js'
import type { Shot, AppSettings } from '../types.js'

/** Returns accent or orange CSS color string if values differ, muted if same. */
function diffColor(a: string | null, b: string | null, side: 'a' | 'b'): string {
  if (a === b) return 'var(--text-muted)'
  return side === 'a' ? 'var(--accent)' : '#c87d32'
}

function shotLabel(shot: Shot, fallback: string): string {
  return [shot.beanType, shot.beanBrand].filter(Boolean).join(' — ') || fallback
}

interface MetaRowProps {
  labelKey: string
  valA: string | null
  valB: string | null
}
function MetaRow({ labelKey, valA, valB }: MetaRowProps) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
      <span style={{ textAlign: 'right', fontSize: 13, color: diffColor(valA, valB, 'a'), fontWeight: valA !== valB ? 600 : 400 }}>
        {valA ?? '—'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', minWidth: 110 }}>
        {t(labelKey)}
      </span>
      <span style={{ fontSize: 13, color: diffColor(valA, valB, 'b'), fontWeight: valA !== valB ? 600 : 400 }}>
        {valB ?? '—'}
      </span>
    </div>
  )
}

export default function ShotCompare() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [chartMode, setChartMode] = useState<'overlaid' | 'split'>('overlaid')

  const idA = searchParams.get('a')
  const idB = searchParams.get('b')

  const { data: shotA, isLoading: loadingA } = useQuery({
    queryKey: ['shot', idA],
    queryFn: () => api.getShot(idA!),
    enabled: !!idA,
  })
  const { data: shotB, isLoading: loadingB } = useQuery({
    queryKey: ['shot', idB],
    queryFn: () => api.getShot(idB!),
    enabled: !!idB,
  })
  const { data: settings } = useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    staleTime: 60_000,
  })

  if (!idA || !idB) { navigate('/', { replace: true }); return null }
  if (loadingA || loadingB) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
  if (!shotA || !shotB) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.notFound')}</div>

  const labelA = shotLabel(shotA, t('common.shot'))
  const labelB = shotLabel(shotB, t('common.shot'))

  const ratioA = shotA.beanWeight && shotA.drinkWeight ? `1 : ${(shotA.drinkWeight / shotA.beanWeight).toFixed(2)}` : null
  const ratioB = shotB.beanWeight && shotB.drinkWeight ? `1 : ${(shotB.drinkWeight / shotB.beanWeight).toFixed(2)}` : null
  const doseYieldA = shotA.beanWeight && shotA.drinkWeight ? `${shotA.beanWeight}g → ${shotA.drinkWeight}g` : null
  const doseYieldB = shotB.beanWeight && shotB.drinkWeight ? `${shotB.beanWeight}g → ${shotB.drinkWeight}g` : null
  const durationA = shotA.duration ? `${shotA.duration.toFixed(1)}s` : null
  const durationB = shotB.duration ? `${shotB.duration.toFixed(1)}s` : null
  const enjoymentA = shotA.espressoEnjoyment != null ? String(shotA.espressoEnjoyment) : null
  const enjoymentB = shotB.espressoEnjoyment != null ? String(shotB.espressoEnjoyment) : null

  const hasTasting = [
    shotA.fragrance, shotA.aroma, shotA.flavor, shotA.aftertaste,
    shotB.fragrance, shotB.aroma, shotB.flavor, shotB.aftertaste,
  ].some((v) => v != null)

  const hasNotes = shotA.espressoNotes || shotA.beanNotes || shotA.privateNotes ||
                   shotB.espressoNotes || shotB.beanNotes || shotB.privateNotes

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>

      {/* Back link */}
      <button onClick={() => navigate('/')} style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 16 }}>
        ‹ {t('detail.back')}
      </button>

      {/* Header: A vs B */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>{labelA}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(shotA.startTime).toLocaleString()}</p>
        </div>
        <span style={{ fontSize: 16, color: 'var(--text-dim)', fontWeight: 600 }}>{t('compare.vs')}</span>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#c87d32', marginBottom: 2 }}>{labelB}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(shotB.startTime).toLocaleString()}</p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="card" style={{ marginBottom: 16 }}>
        <MetaRow labelKey="shots.dose" valA={doseYieldA} valB={doseYieldB} />
        <MetaRow labelKey="shots.ratio" valA={ratioA} valB={ratioB} />
        <MetaRow labelKey="shots.duration" valA={durationA} valB={durationB} />
        <MetaRow labelKey="detail.enjoyment" valA={enjoymentA} valB={enjoymentB} />
      </div>

      {/* Extraction curves */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>{t('detail.extractionCurves')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['overlaid', 'split'] as const).map((mode) => (
              <button
                key={mode}
                className={`btn ${chartMode === mode ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => setChartMode(mode)}
              >
                {t(`compare.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        {chartMode === 'overlaid' && shotA.shotData && shotB.shotData ? (
          <ShotCompareChart
            shotDataA={shotA.shotData}
            shotDataB={shotB.shotData}
            labelA={labelA}
            labelB={labelB}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 6, fontWeight: 600 }}>{labelA}</p>
              {shotA.shotData
                ? <ShotChart shotData={shotA.shotData} tooltipOpacity={settings?.tooltipOpacity} />
                : <p style={{ color: 'var(--text-dim)' }}>—</p>}
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#c87d32', marginBottom: 6, fontWeight: 600 }}>{labelB}</p>
              {shotB.shotData
                ? <ShotChart shotData={shotB.shotData} tooltipOpacity={settings?.tooltipOpacity} />
                : <p style={{ color: 'var(--text-dim)' }}>—</p>}
            </div>
          </div>
        )}
      </div>

      {/* Tasting scores */}
      {hasTasting && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{t('detail.tastingScores')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8, fontWeight: 600 }}>{labelA}</p>
              <TastingScores shot={shotA} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#c87d32', marginBottom: 8, fontWeight: 600 }}>{labelB}</p>
              <TastingScores shot={shotB} />
            </div>
          </div>
        </div>
      )}

      {/* Bean & Equipment */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('detail.beanInfo')} & {t('detail.equipment')}</div>
        <MetaRow labelKey="edit.beanBrand" valA={shotA.beanBrand} valB={shotB.beanBrand} />
        <MetaRow labelKey="edit.beanType" valA={shotA.beanType} valB={shotB.beanType} />
        <MetaRow labelKey="edit.roastLevel" valA={shotA.roastLevel} valB={shotB.roastLevel} />
        <MetaRow labelKey="edit.profileTitle" valA={shotA.profileTitle} valB={shotB.profileTitle} />
        <MetaRow labelKey="edit.grinderModel" valA={shotA.grinderModel} valB={shotB.grinderModel} />
        <MetaRow labelKey="edit.grinderSetting" valA={shotA.grinderSetting} valB={shotB.grinderSetting} />
      </div>

      {/* Notes */}
      {hasNotes && (
        <div className="card">
          <div className="card-title">{t('detail.notes')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {([
              { shot: shotA, label: labelA, color: 'var(--accent)' },
              { shot: shotB, label: labelB, color: '#c87d32' },
            ] as const).map(({ shot, label, color }) => (
              <div key={shot.id}>
                <p style={{ fontSize: 11, color, marginBottom: 8, fontWeight: 600 }}>{label}</p>
                {shot.espressoNotes && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{shot.espressoNotes}</p>}
                {shot.beanNotes && <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6, fontStyle: 'italic' }}>{shot.beanNotes}</p>}
                {shot.privateNotes && <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{shot.privateNotes}</p>}
                {!shot.espressoNotes && !shot.beanNotes && !shot.privateNotes && (
                  <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t('detail.noNotes')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
