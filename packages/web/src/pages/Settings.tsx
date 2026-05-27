// packages/web/src/pages/Settings.tsx
import { useState, useEffect, FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.js'
import { setLanguage } from '../i18n/index.js'

// DE1 import card state machine

type De1Phase =
  | { name: 'idle' }
  | { name: 'testing' }
  | { name: 'connected'; total: number }
  | { name: 'connectionError'; message: string }
  | { name: 'previewing' }
  | { name: 'previewed'; count: number }
  | { name: 'importing' }
  | { name: 'done'; imported: number; updated: number; skipped: number; errors: number; errorDetails: { filename: string; message: string }[] }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Settings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  const [de1Url, setDe1Url] = useState('')
  const [de1Phase, setDe1Phase] = useState<De1Phase>({ name: 'idle' })
  const [de1Total, setDe1Total] = useState(0)
  const [dateFrom, setDateFrom] = useState('2020-01-01')
  const [dateTo, setDateTo] = useState(todayStr)
  const [updateExisting, setUpdateExisting] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  })

  // Initialize de1Url from settings once on first load (when field is still empty)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (settings?.de1Url && !de1Url) {
      setDe1Url(settings.de1Url)
    }
  }, [settings?.de1Url])

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
  })

  async function handleTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('vl-theme', theme)
    await api.updateSettings({ theme })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  async function handleLanguage(lang: string) {
    setLanguage(lang)
    await api.updateSettings({ language: lang })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault()
    setPwMsg('')
    setPwError('')
    try {
      await api.updateSettings(pwForm)
      setPwMsg(t('settings.passwordChanged'))
      setPwForm({ currentPassword: '', newPassword: '' })
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : t('common.error'))
    }
  }

  async function handleDe1UrlBlur() {
    await api.updateSettings({ de1Url })
    qc.invalidateQueries({ queryKey: ['settings'] })
    setDe1Phase({ name: 'idle' })
  }

  async function handleDe1Connect() {
    if (!de1Url.trim()) return
    setDe1Phase({ name: 'testing' })
    try {
      const res = await api.testDe1Connection()
      setDe1Total(res.total)
      setDe1Phase({ name: 'connected', total: res.total })
    } catch (err) {
      setDe1Phase({
        name: 'connectionError',
        message: err instanceof Error ? err.message : t('common.error'),
      })
    }
  }

  async function handleDe1Preview() {
    setDe1Phase({ name: 'previewing' })
    try {
      const res = await api.previewDe1Import(dateFrom, dateTo)
      setDe1Phase({ name: 'previewed', count: res.count })
    } catch (err) {
      setDe1Phase({
        name: 'connectionError',
        message: err instanceof Error ? err.message : t('common.error'),
      })
    }
  }

  async function handleDe1Import() {
    if (de1Phase.name !== 'previewed') return
    setDe1Phase({ name: 'importing' })
    try {
      const res = await api.startDe1Import(dateFrom, dateTo, updateExisting)
      setDe1Phase({ name: 'done', ...res })
      qc.invalidateQueries({ queryKey: ['shots'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    } catch (err) {
      setDe1Phase({
        name: 'connectionError',
        message: err instanceof Error ? err.message : t('common.error'),
      })
    }
  }

  const showDateRange =
    de1Phase.name === 'connected'   || de1Phase.name === 'previewing' ||
    de1Phase.name === 'previewed'   || de1Phase.name === 'importing'  ||
    de1Phase.name === 'done'

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>{t('settings.title')}</h1>

      {/* Theme */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.theme')}</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {['dark', 'light'].map((th) => (
            <button
              key={th}
              className={`btn ${settings?.theme === th ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleTheme(th)}
            >
              {th === 'dark' ? `🌙 ${t('settings.dark')}` : `☀️ ${t('settings.light')}`}
            </button>
          ))}
        </div>

        {/* Tooltip opacity slider */}
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            <span>{t('settings.tooltipOpacity')}</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round((settings?.tooltipOpacity ?? 0.55) * 100)}%
            </span>
          </label>
          <input
            type="range"
            min="0.1"
            max="0.95"
            step="0.05"
            value={settings?.tooltipOpacity ?? 0.55}
            onChange={async (e) => {
              const val = parseFloat(e.target.value)
              await api.updateSettings({ tooltipOpacity: val })
              qc.invalidateQueries({ queryKey: ['settings'] })
            }}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            <span>{t('settings.tooltipTransparent')}</span>
            <span>{t('settings.tooltipOpaque')}</span>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.language')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { val: 'auto', label: t('settings.auto') },
            { val: 'de',   label: '🇩🇪 Deutsch' },
            { val: 'en',   label: '🇬🇧 English' },
          ].map(({ val, label }) => (
            <button
              key={val}
              className={`btn ${settings?.language === val ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleLanguage(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Password */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.changePassword')}</div>
        <form onSubmit={handlePasswordChange}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t('settings.currentPassword')}
            </label>
            <input type="password" value={pwForm.currentPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t('settings.newPassword')}
            </label>
            <input type="password" value={pwForm.newPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} required minLength={6} />
          </div>
          {pwMsg   && <p style={{ color: 'var(--green)', fontSize: 13, marginBottom: 10 }}>{pwMsg}</p>}
          {pwError && <p style={{ color: 'var(--red)',   fontSize: 13, marginBottom: 10 }}>{pwError}</p>}
          <button type="submit" className="btn btn-primary">{t('settings.savePassword')}</button>
        </form>
      </div>

      {/* Export */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.export')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{t('settings.exportDesc')}</p>
        <button className="btn btn-secondary" onClick={() => api.exportAll()}>
          {'⬇'} {t('settings.exportButton')}
        </button>
      </div>

      {/* DE1 Direct Import */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.de1Import')}</div>

        {/* URL input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {t('settings.de1Url')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={de1Url}
              onChange={(e) => setDe1Url(e.target.value)}
              onBlur={handleDe1UrlBlur}
              placeholder="http://192.168.178.32:8888"
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-secondary"
              onClick={handleDe1Connect}
              disabled={!de1Url.trim() || de1Phase.name === 'testing'}
            >
              {de1Phase.name === 'testing' ? '…' : t('settings.de1Connect')}
            </button>
          </div>
        </div>

        {/* Connection status */}
        {de1Phase.name === 'connected' && (
          <p style={{ fontSize: 13, color: 'var(--green)', marginBottom: 12 }}>
            {'✓'} {t('settings.de1Connected', { count: de1Phase.total })}
          </p>
        )}
        {de1Phase.name === 'connectionError' && (
          <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>
            {'✗'} {t('settings.de1ConnectionError', { message: de1Phase.message })}
          </p>
        )}

        {/* Date range + preview/import */}
        {showDateRange && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {t('settings.de1DateFrom')}
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setDe1Phase({ name: 'connected', total: de1Total })
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {t('settings.de1DateTo')}
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setDe1Phase({ name: 'connected', total: de1Total })
                  }}
                />
              </div>
            </div>

            {/* Update-existing checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
              />
              {t('settings.de1UpdateExisting')}
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={handleDe1Preview}
                disabled={de1Phase.name === 'previewing' || de1Phase.name === 'importing'}
              >
                {de1Phase.name === 'previewing' ? '…' : t('settings.de1Preview')}
              </button>

              {(de1Phase.name === 'previewed' || de1Phase.name === 'importing') && (
                <button
                  className="btn btn-primary"
                  onClick={handleDe1Import}
                  disabled={de1Phase.name === 'importing'}
                >
                  {de1Phase.name === 'importing'
                    ? t('settings.de1Importing')
                    : t('settings.de1ImportAction', { count: (de1Phase as { count: number }).count })}
                </button>
              )}
            </div>

            {de1Phase.name === 'previewed' && de1Phase.count === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                {t('settings.de1NoShots')}
              </p>
            )}
            {de1Phase.name === 'previewed' && de1Phase.count > 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                {'→'} {t('settings.de1PreviewResult', { count: de1Phase.count })}
              </p>
            )}

            {de1Phase.name === 'done' && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--green)' }}>
                  {'✓'} {t('settings.de1Done', {
                    imported: de1Phase.imported,
                    updated:  de1Phase.updated,
                    skipped:  de1Phase.skipped,
                    errors:   de1Phase.errors,
                  })}
                </p>
                {de1Phase.errors > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                    {t('settings.de1ErrorDetails', { count: de1Phase.errors })}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* DB info */}
      <div className="card">
        <div className="card-title">{t('settings.dbInfo')}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('settings.totalShots')}</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{stats?.total ?? '—'}</span>
        </div>
      </div>
    </div>
  )
}
