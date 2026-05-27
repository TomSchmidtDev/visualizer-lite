// packages/web/src/pages/Upload.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.js'
import DropZone from '../components/DropZone.js'

type UploadState = 'idle' | 'uploading' | 'success' | 'duplicate' | 'error'

interface Result { state: UploadState; id?: string; filename?: string; errorMessage?: string }

export default function Upload() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [results, setResults] = useState<Result[]>([])
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const { id } = await api.uploadShot(file)
      setResults((r) => [...r, { state: 'success', id, filename: file.name }])
      qc.invalidateQueries({ queryKey: ['shots'] })
      qc.invalidateQueries({ queryKey: ['suggestions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('Upload error:', e)
      const isDup = message.includes('duplicate') || message.includes('already')
      setResults((r) => [...r, { state: isDup ? 'duplicate' : 'error', filename: file.name, errorMessage: message }])
    } finally {
      setUploading(false)
    }
  }

  const stateColor: Record<UploadState, string> = { success: 'var(--green)', duplicate: 'var(--orange)', error: 'var(--red)', idle: '', uploading: '' }
  const stateLabel: Record<UploadState, string> = { success: t('upload.success'), duplicate: t('upload.duplicate'), error: t('upload.error'), idle: '', uploading: t('upload.uploading') }

  return (
    <div style={{ maxWidth: 600, margin: '48px auto', padding: '0 24px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>{t('upload.title')}</h1>

      <DropZone onFile={handleFile} disabled={uploading} />

      {uploading && (
        <p style={{ textAlign: 'center', color: 'var(--accent)', marginTop: 16 }}>
          {t('upload.uploading')}
        </p>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {results.map((r, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)',
              border: `1px solid ${stateColor[r.state]}`,
              borderRadius: 8,
              padding: '10px 16px',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 13 }}>{r.filename}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: stateColor[r.state], fontWeight: 600 }}>
                  {stateLabel[r.state]}
                  {r.errorMessage && (
                    <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.8 }}>({r.errorMessage})</span>
                  )}
                </span>
                {r.id && (
                  <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => navigate(`/shots/${r.id}`)}>
                    {t('upload.viewShot')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
