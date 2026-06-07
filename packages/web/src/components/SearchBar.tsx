// packages/web/src/components/SearchBar.tsx
import { useTranslation } from 'react-i18next'
import type { Suggestions, SearchParams } from '../types.js'

interface Props {
  params: SearchParams
  suggestions: Suggestions | undefined
  onChange: (params: SearchParams) => void
}

export default function SearchBar({ params, suggestions, onChange }: Props) {
  const { t } = useTranslation()

  const update = (key: keyof SearchParams, value: string) => {
    onChange({ ...params, [key]: value || undefined, page: 1 })
  }

  const beverageLabel = (v: string) => {
    if (v === 'espresso') return t('shots.beverageEspresso')
    if (v === 'filter') return t('shots.beverageFilter')
    if (v === 'unknown') return t('shots.beverageUnknown')
    return v
  }

  const activeFilters = [
    params.beanBrand && { key: 'beanBrand' as keyof SearchParams, label: `${t('shots.beanBrand')}: ${params.beanBrand}` },
    params.profileTitle && { key: 'profileTitle' as keyof SearchParams, label: `${t('shots.profileTitle')}: ${params.profileTitle}` },
    params.grinderModel && { key: 'grinderModel' as keyof SearchParams, label: `${t('shots.grinderModel')}: ${params.grinderModel}` },
    params.beverageType && { key: 'beverageType' as keyof SearchParams, label: beverageLabel(params.beverageType) },
  ].filter(Boolean) as { key: keyof SearchParams; label: string }[]

  return (
    <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '14px 24px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Text search */}
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 14 }}>🔍</span>
          <input
            value={params.q ?? ''}
            onChange={(e) => update('q', e.target.value)}
            placeholder={t('shots.search')}
            style={{ paddingLeft: 32 }}
          />
        </div>

        {/* Roaster filter */}
        <select value={params.beanBrand ?? ''} onChange={(e) => update('beanBrand', e.target.value)} style={{ minWidth: 140 }}>
          <option value="">{t('shots.allRoasters')}</option>
          {suggestions?.beanBrands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Profile filter */}
        <select value={params.profileTitle ?? ''} onChange={(e) => update('profileTitle', e.target.value)} style={{ minWidth: 150 }}>
          <option value="">{t('shots.allProfiles')}</option>
          {suggestions?.profileTitles.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Grinder filter */}
        <select value={params.grinderModel ?? ''} onChange={(e) => update('grinderModel', e.target.value)} style={{ minWidth: 130 }}>
          <option value="">{t('shots.allGrinders')}</option>
          {suggestions?.grinderModels.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        {/* Beverage filter */}
        {suggestions?.beverageTypes && suggestions.beverageTypes.length > 0 && (
          <select value={params.beverageType ?? ''} onChange={(e) => update('beverageType', e.target.value)} style={{ minWidth: 120 }}>
            <option value="">{t('shots.allBeverages')}</option>
            {suggestions.beverageTypes.map((v) => (
              <option key={v} value={v}>{beverageLabel(v)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {activeFilters.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => update(key, '')}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--accent-dim)',
                borderRadius: 20,
                padding: '3px 10px',
                fontSize: 11,
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {label} <span style={{ opacity: 0.6 }}>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
