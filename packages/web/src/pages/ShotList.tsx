// packages/web/src/pages/ShotList.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import ShotCard from '../components/ShotCard.js'
import SearchBar from '../components/SearchBar.js'
import Pagination from '../components/Pagination.js'
import type { SearchParams } from '../types.js'

export default function ShotList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useState<SearchParams>({ page: 1, limit: 20 })

  const { data, isLoading } = useQuery({
    queryKey: ['shots', params],
    queryFn: () => api.listShots(params),
  })

  const { data: suggestions } = useQuery({
    queryKey: ['suggestions'],
    queryFn: () => api.getSuggestions(),
    staleTime: 60_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
    staleTime: 60_000,
  })

  return (
    <div>
      <SearchBar params={params} suggestions={suggestions} onChange={setParams} />

      {/* Stats bar */}
      <div style={{
        padding: '10px 24px',
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{data?.total ?? 0}</strong> {t('shots.found', { count: data?.total ?? 0 })}
        </span>
        {stats?.avgEnjoyment != null && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('shots.avgEnjoyment')}: <strong style={{ color: 'var(--accent)' }}>{stats.avgEnjoyment}</strong>
          </span>
        )}
        {stats?.avgRatio != null && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('shots.avgRatio')}: <strong>1 : {stats.avgRatio}</strong>
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={() => navigate('/upload')} style={{ fontSize: 12 }}>
            ↑ {t('nav.upload')}
          </button>
        </div>
      </div>

      {/* Shot list */}
      <div style={{ padding: '16px 24px' }}>
        {isLoading && <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>}
        {!isLoading && data?.shots.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 48 }}>
            {t('shots.noShots')}
          </p>
        )}
        {data?.shots.map((shot) => <ShotCard key={shot.id} shot={shot} />)}
      </div>

      {data && (
        <Pagination
          page={data.page}
          total={data.total}
          limit={data.limit}
          onChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
        />
      )}
    </div>
  )
}
