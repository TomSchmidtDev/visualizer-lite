// packages/web/src/pages/ShotList.tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import ShotCard from '../components/ShotCard.js'
import SearchBar from '../components/SearchBar.js'
import Pagination from '../components/Pagination.js'
import type { SearchParams } from '../types.js'

export default function ShotList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useState<SearchParams>({ page: 1, limit: 20 })
  const paginationRef = useRef<HTMLDivElement>(null)
  const didPageChange = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ['shots', params],
    queryFn: () => api.listShots(params),
  })

  const { data: suggestions } = useQuery({
    queryKey: ['suggestions'],
    queryFn: () => api.getSuggestions(),
    staleTime: 60_000,
  })

  const { data: allShotsData } = useQuery({
    queryKey: ['shots-total'],
    queryFn: () => api.listShots({ page: 1, limit: 1 }),
    staleTime: 60_000,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    staleTime: 60_000,
  })

  const [searchParams] = useSearchParams()
  const compareWith = searchParams.get('compareWith')

  const { data: compareShot } = useQuery({
    queryKey: ['shot', compareWith],
    queryFn: () => api.getShot(compareWith!),
    enabled: !!compareWith,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (didPageChange.current && !isLoading) {
      didPageChange.current = false
      paginationRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' })
    }
  }, [isLoading])

  const isFiltered = !!(
    params.beanBrand || params.beanType || params.profileTitle ||
    params.grinderModel || params.dateFrom || params.dateTo || params.q ||
    params.beverageType
  )
  const totalAll = allShotsData?.total ?? 0
  const totalFiltered = data?.total ?? 0

  return (
    <div>
      <SearchBar params={params} suggestions={suggestions} onChange={setParams} />

      {/* Compare mode banner */}
      {compareWith && (
        <div style={{
          padding: '10px 24px',
          background: 'var(--accent-dim, #1a2e3b)',
          borderBottom: '1px solid var(--accent)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
        }}>
          <span style={{ color: 'var(--accent)' }}>⇄ {t('detail.compareBanner')}:</span>
          <strong style={{ color: 'var(--text)' }}>
            {compareShot
              ? [compareShot.beanType, compareShot.beanBrand].filter(Boolean).join(' — ') || 'Shot'
              : '…'}
          </strong>
          <button
            className="btn btn-secondary"
            style={{ marginLeft: 'auto', fontSize: 12 }}
            onClick={() => navigate('/')}
          >
            {t('detail.cancelCompare')}
          </button>
        </div>
      )}

      {/* Stats bar */}
      <div style={{
        padding: '10px 24px',
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{totalFiltered}</strong>{' '}
          {isFiltered
            ? t('shots.foundOf', { total: totalAll })
            : t('shots.found')}
        </span>
{settings?.showAvgRatio && data?.avgRatio != null && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('shots.avgRatio')}: <strong>1 : {data.avgRatio}</strong>
          </span>
        )}
      </div>

      {/* Shot list */}
      <div style={{ padding: '16px 24px' }}>
        {isLoading && <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>}
        {!isLoading && data?.shots.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 48 }}>
            {t('shots.noShots')}
          </p>
        )}
        {data?.shots.map((shot) => (
          <ShotCard
            key={shot.id}
            shot={shot}
            onSelect={compareWith
              ? (id) => navigate(`/compare?a=${compareWith}&b=${id}`)
              : undefined}
          />
        ))}
      </div>

      {data && (
        <Pagination
          page={data.page}
          total={data.total}
          limit={data.limit}
          scrollRef={paginationRef}
          onChange={(p) => {
            didPageChange.current = true
            setParams((prev) => ({ ...prev, page: p }))
          }}
        />
      )}
    </div>
  )
}
