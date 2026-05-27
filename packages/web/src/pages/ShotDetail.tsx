// packages/web/src/pages/ShotDetail.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.js'
import ShotChart from '../components/ShotChart.js'
import TastingScores from '../components/TastingScores.js'

export default function ShotDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: shot, isLoading } = useQuery({
    queryKey: ['shot', id],
    queryFn: () => api.getShot(id!),
    enabled: !!id,
  })

  async function handleDelete() {
    setDeleteError(null)
    try {
      await api.deleteShot(id!)
      qc.removeQueries({ queryKey: ['shots'] })
      navigate('/')
    } catch (err) {
      setConfirmDelete(false)
      setDeleteError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
  if (!shot) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>{t('common.notFound')}</div>

  const date = new Date(shot.startTime).toLocaleString()
  const ratio = shot.beanWeight && shot.drinkWeight
    ? `1 : ${(shot.drinkWeight / shot.beanWeight).toFixed(2)}`
    : null

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => navigate('/')} style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 12 }}>
          ‹ {t('detail.back')}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              {[shot.beanType, shot.beanBrand].filter(Boolean).join(' — ') || 'Shot'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{date}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {shot.profileTitle && <span style={{ background: 'var(--bg-input)', border: '1px solid var(--accent-dim)', borderRadius: 20, padding: '3px 12px', fontSize: 12, color: 'var(--accent)' }}>{shot.profileTitle}</span>}
              {shot.grinderModel && <span style={{ background: 'var(--bg-input)', border: '1px solid var(--border-focus)', borderRadius: 20, padding: '3px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{shot.grinderModel} · {shot.grinderSetting}</span>}
              {shot.tags.map((tag) => <span key={tag} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-focus)', borderRadius: 20, padding: '3px 10px', fontSize: 11, color: 'var(--text-muted)' }}>#{tag}</span>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => api.downloadShot(id!)}>{t('detail.download')}</button>
            <button className="btn btn-secondary" onClick={() => navigate(`/shots/${id}/edit`)}>{t('detail.edit')}</button>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('detail.confirmDelete')}</span>
                <button className="btn btn-danger" onClick={handleDelete}>{t('common.yes')}</button>
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
              </>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>{t('detail.delete')}</button>
            )}
            {deleteError && <span style={{ fontSize: 12, color: 'var(--error, #e05252)' }}>{deleteError}</span>}
          </div>
        </div>
      </div>

      {/* 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        <div>
          {/* Chart */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">{t('detail.extractionCurves')}</div>
            {shot.shotData ? <ShotChart shotData={shot.shotData} /> : <p style={{ color: 'var(--text-dim)' }}>No chart data</p>}
          </div>

          {/* Extraction values */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">{t('detail.extractionValues')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { label: `${t('shots.dose')} → ${t('shots.yield')}`, value: shot.beanWeight && shot.drinkWeight ? `${shot.beanWeight}g → ${shot.drinkWeight}g` : null },
                { label: t('shots.ratio'), value: ratio },
                { label: t('shots.duration'), value: shot.duration ? `${shot.duration.toFixed(1)}s` : null },
                { label: 'TDS', value: shot.drinkTds ? `${shot.drinkTds}%` : null },
                { label: 'EY', value: shot.drinkEy ? `${shot.drinkEy}%` : null },
              ].filter((r) => r.value).map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <div className="card-title">{t('detail.notes')}</div>
            {[
              { key: 'espressoNotes', label: t('detail.espressoNotes'), value: shot.espressoNotes },
              { key: 'beanNotes', label: t('detail.beanNotes'), value: shot.beanNotes },
              { key: 'privateNotes', label: t('detail.privateNotes'), value: shot.privateNotes },
            ].map(({ key, label, value }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>{label}</div>
                <p style={{ fontSize: 13, color: value ? 'var(--text-muted)' : 'var(--text-dim)', fontStyle: value ? 'italic' : 'normal' }}>
                  {value ?? t('detail.noNotes')}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Enjoyment */}
          {shot.espressoEnjoyment != null && (
            <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
              <div className="card-title">{t('detail.enjoyment')}</div>
              <div style={{ fontSize: 52, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
                {shot.espressoEnjoyment}<span style={{ fontSize: 18, color: 'var(--text-dim)', fontWeight: 400 }}> / 100</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, margin: '10px 0 4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${shot.espressoEnjoyment}%`, background: 'var(--accent)', borderRadius: 3 }} />
              </div>
            </div>
          )}

          {/* Tasting */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">{t('detail.tastingScores')}</div>
            <TastingScores shot={shot} />
          </div>

          {/* Equipment */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">{t('detail.equipment')}</div>
            {[
              { label: t('edit.profileTitle'), value: shot.profileTitle },
              { label: t('edit.grinderModel'), value: shot.grinderModel },
              { label: t('edit.grinderSetting'), value: shot.grinderSetting },
              { label: t('edit.barista'), value: shot.barista },
            ].map(({ label, value }) => value && (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Bean info */}
          <div className="card">
            <div className="card-title">{t('detail.beanInfo')}</div>
            {[
              { label: t('edit.beanBrand'), value: shot.beanBrand },
              { label: t('edit.beanType'), value: shot.beanType },
              { label: t('edit.roastLevel'), value: shot.roastLevel },
              { label: t('edit.roastDate'), value: shot.roastDate ? new Date(shot.roastDate).toLocaleDateString() : null },
            ].map(({ label, value }) => value && (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
