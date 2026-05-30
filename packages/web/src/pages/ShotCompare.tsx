// packages/web/src/pages/ShotCompare.tsx
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function ShotCompare() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const idA = searchParams.get('a')
  const idB = searchParams.get('b')

  if (!idA || !idB) {
    navigate('/', { replace: true })
    return null
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>
    </div>
  )
}
