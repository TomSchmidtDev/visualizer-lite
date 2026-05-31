// packages/web/src/pages/ShotEdit.tsx
import { useState, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.js'

export default function ShotEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: shot } = useQuery({
    queryKey: ['shot', id],
    queryFn: () => api.getShot(id!),
    enabled: !!id,
  })

  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const val = (key: string) =>
    form[key] !== undefined ? form[key] : String(shot?.[key as keyof typeof shot] ?? '')

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const data: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(form)) {
        if (k === 'tags') {
          data[k] = v.split(',').map((tag) => tag.trim()).filter(Boolean)
        } else if (['drinkTds', 'drinkEy', 'espressoEnjoyment', 'fragrance', 'aroma', 'flavor',
                    'aftertaste', 'acidity', 'bitterness', 'sweetness', 'mouthfeel'].includes(k)) {
          data[k] = v === '' ? null : Number(v)
        } else {
          data[k] = v === '' ? null : v
        }
      }
      await api.updateShot(id!, data)
      qc.invalidateQueries({ queryKey: ['shot', id] })
      qc.invalidateQueries({ queryKey: ['shots'] })
      setSaved(true)
      setTimeout(() => navigate(`/shots/${id}`), 1000)
    } finally {
      setSaving(false)
    }
  }

  if (!shot) return <div style={{ padding: 24 }}>{t('common.loading')}</div>

  const beverageVal = form['beverageType'] !== undefined
    ? form['beverageType']
    : (shot?.beverageType ?? '')

  const fields = [
    { key: 'beanBrand',      label: t('edit.beanBrand'),      type: 'text' },
    { key: 'beanType',       label: t('edit.beanType'),        type: 'text' },
    { key: 'roastLevel',     label: t('edit.roastLevel'),      type: 'text' },
    { key: 'roastDate',      label: t('edit.roastDate'),       type: 'date' },
    { key: 'profileTitle',   label: t('edit.profileTitle'),    type: 'text' },
    { key: 'grinderModel',   label: t('edit.grinderModel'),    type: 'text' },
    { key: 'grinderSetting', label: t('edit.grinderSetting'),  type: 'text' },
    { key: 'barista',        label: t('edit.barista'),         type: 'text' },
    { key: 'drinkTds',       label: t('edit.drinkTds'),        type: 'number' },
    { key: 'drinkEy',        label: t('edit.drinkEy'),         type: 'number' },
    { key: 'espressoEnjoyment', label: t('edit.enjoyment'),   type: 'number' },
  ]
  const tastingFields = ['fragrance','aroma','flavor','aftertaste','acidity','bitterness','sweetness','mouthfeel']

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <button onClick={() => navigate(`/shots/${id}`)} style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 16 }}>
        ‹ {t('detail.back')}
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>{t('edit.title')}</h1>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{t('detail.equipment')} & {t('detail.beanInfo')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>{t('edit.beverageType')}</label>
              <select value={beverageVal} onChange={(e) => set('beverageType', e.target.value)}>
                <option value="">{t('edit.beverageTypeNone')}</option>
                <option value="espresso">{t('shots.beverageEspresso')}</option>
                <option value="filter">{t('shots.beverageFilter')}</option>
              </select>
            </div>
            {fields.map(({ key, label, type }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</label>
                <input type={type} value={val(key)} onChange={(e) => set(key, e.target.value)} step={type === 'number' ? 'any' : undefined} />
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{t('detail.tastingScores')} (0–10)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {tastingFields.map((key) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'capitalize' }}>{key}</label>
                <input type="number" min={0} max={10} step={0.5} value={val(key)} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{t('detail.notes')}</div>
          {['espressoNotes', 'beanNotes', 'privateNotes'].map((key) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'capitalize' }}>
                {key.replace('Notes', ' Notes')}
              </label>
              <textarea rows={3} value={val(key)} onChange={(e) => set(key, e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">{t('detail.tags')}</div>
          <input
            value={val('tags') !== '' ? val('tags') : (shot.tags.join(', '))}
            onChange={(e) => set('tags', e.target.value)}
            placeholder={t('edit.tags')}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saved ? t('edit.saved') : saving ? t('common.loading') : t('edit.save')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/shots/${id}`)}>
            {t('edit.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
