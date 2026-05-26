// packages/web/src/pages/Settings.tsx
import { useState, FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.js'
import { setLanguage } from '../i18n/index.js'

export default function Settings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  })

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

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>{t('settings.title')}</h1>

      {/* Theme */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.theme')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
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
      </div>

      {/* Language */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.language')}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { val: 'auto', label: t('settings.auto') },
            { val: 'de', label: '🇩🇪 Deutsch' },
            { val: 'en', label: '🇬🇧 English' },
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
            <input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t('settings.newPassword')}
            </label>
            <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} required minLength={6} />
          </div>
          {pwMsg && <p style={{ color: 'var(--green)', fontSize: 13, marginBottom: 10 }}>{pwMsg}</p>}
          {pwError && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{pwError}</p>}
          <button type="submit" className="btn btn-primary">{t('settings.savePassword')}</button>
        </form>
      </div>

      {/* Export */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.export')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{t('settings.exportDesc')}</p>
        <button className="btn btn-secondary" onClick={() => api.exportAll()}>
          ⬇ {t('settings.exportButton')}
        </button>
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
