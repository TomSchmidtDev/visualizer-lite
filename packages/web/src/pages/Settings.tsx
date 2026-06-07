// packages/web/src/pages/Settings.tsx
import { useState, useEffect, useRef, FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.js'
import { setLanguage } from '../i18n/index.js'

const DEFAULT_AI_CONTEXT = `Machine: Decent Espresso DE1

Shot start: The first 3–6 s show high flow but near-zero pressure — this is the headspace fill phase (water filling the empty space above the puck). Normal, not an anomaly. Preinfusion begins once the puck is contacted; full saturation typically at 15–20 s.

Profiles: Steps can be pressure-controlled (hit a pressure target; flow is an output) or flow-controlled (hit a flow rate target; pressure is an output). Many profiles mix both. Profiles include: declining pressure (lever-style), blooming (preinfusion + pause + ramp), turbo (high flow, low pressure, fast), constant flow, adaptive/D-Flow (self-adjusting ladder).

Data channels:
- espresso_pressure / _goal: actual vs. target group-head pressure (bar)
- espresso_flow / _goal: pump-calculated inflow vs. target (ml/s); in pressure-controlled steps, _goal may be zero
- espresso_flow_weight: scale outflow at the cup — delayed ~5–15 s vs. espresso_flow
- espresso_temperature_basket: temperature at shower screen (closest to puck); _mix is the firmware control variable
- espresso_water_dispensed: cumulative volume pumped (ml)`

// DE1 import card state machine

type De1Phase =
  | { name: 'idle' }
  | { name: 'testing' }
  | { name: 'connected'; total: number }
  | { name: 'connectionError'; message: string }
  | { name: 'previewing' }
  | { name: 'previewed'; count: number }
  | { name: 'importing'; current: number; total: number; filename: string }
  | { name: 'done'; imported: number; updated: number; skipped: number; errors: number; errorDetails: { filename: string; message: string }[] }

type Tab = 'ansicht' | 'daten' | 'sicherheit' | 'ki'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Settings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  const [apiKeyClaudeKey, setApiKeyClaudeKey] = useState('')
  const [apiKeyOpenaiKey, setApiKeyOpenaiKey] = useState('')
  const [aiModel, setAiModel] = useState('claude-haiku-4-5-20251001')
  const [aiCustomContext, setAiCustomContext] = useState(DEFAULT_AI_CONTEXT)
  const [aiAnalysisMode, setAiAnalysisMode] = useState('standard')
  const [aiContextWindow, setAiContextWindow] = useState('30d')
  const [aiContextTier1Min, setAiContextTier1Min] = useState(10)
  const [aiContextMinShots, setAiContextMinShots] = useState(2)
  const [tab, setTab] = useState<Tab>(() => {
    const s = localStorage.getItem('vl-settings-tab') as Tab | null
    return s && (['ansicht', 'daten', 'sicherheit', 'ki'] as Tab[]).includes(s) ? s : 'ansicht'
  })
  const [aiKeysMsg, setAiKeysMsg] = useState('')
  const [aiKeysError, setAiKeysError] = useState('')

  const [de1Url, setDe1Url] = useState('')
  const [de1DefaultBeverage, setDe1DefaultBeverage] = useState('')
  const [de1Phase, setDe1Phase] = useState<De1Phase>({ name: 'idle' })
  const [de1Total, setDe1Total] = useState(0)
  const [dateFrom, setDateFrom] = useState('2020-01-01')
  const [dateTo, setDateTo] = useState(todayStr)
  const [updateExisting, setUpdateExisting] = useState(false)
  const de1DateInitialized = useRef(false)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  })

  // Initialize de1Url, de1DefaultBeverage, and AI settings once on first load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (settings?.de1Url && !de1Url) setDe1Url(settings.de1Url)
    if (settings?.de1DefaultBeverage !== undefined && !de1DefaultBeverage) {
      setDe1DefaultBeverage(settings.de1DefaultBeverage)
    }
    if (settings?.apiKeyClaudeKey) setApiKeyClaudeKey(settings.apiKeyClaudeKey)
    if (settings?.apiKeyOpenaiKey) setApiKeyOpenaiKey(settings.apiKeyOpenaiKey)
    if (settings?.aiModel) setAiModel(settings.aiModel)
    if (settings?.aiCustomContext !== undefined) setAiCustomContext(settings.aiCustomContext || DEFAULT_AI_CONTEXT)
    if (settings?.aiAnalysisMode) setAiAnalysisMode(settings.aiAnalysisMode)
    if (settings?.aiContextWindow) setAiContextWindow(settings.aiContextWindow)
    if (settings?.aiContextTier1Min !== undefined) setAiContextTier1Min(settings.aiContextTier1Min)
    if (settings?.aiContextMinShots !== undefined) setAiContextMinShots(settings.aiContextMinShots)
  }, [settings?.de1Url, settings?.de1DefaultBeverage, settings?.apiKeyClaudeKey, settings?.apiKeyOpenaiKey, settings?.aiModel, settings?.aiCustomContext, settings?.aiAnalysisMode, settings?.aiContextWindow, settings?.aiContextTier1Min, settings?.aiContextMinShots])

  // Pre-fill "Von" date with last import's "Bis" date (once on first load)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!de1DateInitialized.current && settings?.de1LastImportDate) {
      de1DateInitialized.current = true
      setDateFrom(settings.de1LastImportDate)
    }
  }, [settings?.de1LastImportDate])

  const { data: allShotsData } = useQuery({
    queryKey: ['shots-total'],
    queryFn: () => api.listShots({ page: 1, limit: 1 }),
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

  function handleTabChange(t: Tab) {
    setTab(t)
    localStorage.setItem('vl-settings-tab', t)
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault()
    setPwMsg('')
    setPwError('')
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError(t('settings.passwordMismatch'))
      return
    }
    try {
      await api.updateSettings({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      setPwMsg(t('settings.passwordChanged'))
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
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
    const total = de1Phase.count
    setDe1Phase({ name: 'importing', current: 0, total, filename: '' })
    try {
      const res = await api.startDe1Import(
        dateFrom,
        dateTo,
        updateExisting,
        (current, total, filename) => {
          flushSync(() => setDe1Phase({ name: 'importing', current, total, filename }))
        },
      )
      setDe1Phase({ name: 'done', ...res })
      qc.invalidateQueries({ queryKey: ['shots'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      // Remember "Bis" date so next visit pre-fills "Von" from here
      await api.updateSettings({ de1LastImportDate: dateTo })
      qc.invalidateQueries({ queryKey: ['settings'] })
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

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {([
          { id: 'ansicht',    icon: '🎨', label: t('settings.tabAnsicht') },
          { id: 'daten',      icon: '💾', label: t('settings.tabDaten') },
          { id: 'sicherheit', icon: '🔒', label: t('settings.tabSicherheit') },
          { id: 'ki',         icon: '🤖', label: t('settings.tabKi') },
        ] as { id: Tab; icon: string; label: string }[]).map(({ id, icon, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => handleTabChange(id)}
            style={{
              flex: 1,
              padding: '10px 8px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
              color: tab === id ? 'var(--accent)' : 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
              fontWeight: tab === id ? 600 : 500,
            }}
          >
            <span style={{ fontSize: 17 }}>{icon}</span>
            <span style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'ansicht' && <>

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
        <div style={{ marginBottom: 16 }}>
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

        {/* Show avg ratio toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={settings?.showAvgRatio ?? true}
            onChange={async (e) => {
              await api.updateSettings({ showAvgRatio: e.target.checked })
              qc.invalidateQueries({ queryKey: ['settings'] })
            }}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
          />
          {t('settings.showAvgRatio')}
        </label>
      </div>

      {/* Statistics */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{t('settings.statsSection')}</div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            <span>{t('settings.statsTopN')}</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {settings?.statsTopN ?? 10}
            </span>
          </label>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={settings?.statsTopN ?? 10}
            onChange={async (e) => {
              await api.updateSettings({ statsTopN: parseInt(e.target.value, 10) })
              qc.invalidateQueries({ queryKey: ['settings'] })
            }}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            <span>1</span>
            <span>20</span>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={settings?.statsShowPrevValue ?? true}
            onChange={async (e) => {
              await api.updateSettings({ statsShowPrevValue: e.target.checked })
              qc.invalidateQueries({ queryKey: ['settings'] })
            }}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
          />
          {t('settings.statsShowPrevValue')}
        </label>
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

      </>}

      {tab === 'sicherheit' && (
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
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t('settings.newPassword')}
            </label>
            <input type="password" value={pwForm.newPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} required minLength={6} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t('settings.confirmPassword')}
            </label>
            <input type="password" value={pwForm.confirmPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))} required minLength={6} />
          </div>
          {pwMsg   && <p style={{ color: 'var(--green)', fontSize: 13, marginBottom: 10 }}>{pwMsg}</p>}
          {pwError && <p style={{ color: 'var(--red)',   fontSize: 13, marginBottom: 10 }}>{pwError}</p>}
          <button type="submit" className="btn btn-primary">{t('settings.savePassword')}</button>
        </form>
      </div>
      )}

      {tab === 'daten' && <>

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

        {/* Default beverage for shots without beverageType */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {t('settings.de1DefaultBeverage')}
          </label>
          <select
            value={de1DefaultBeverage}
            onChange={async (e) => {
              setDe1DefaultBeverage(e.target.value)
              await api.updateSettings({ de1DefaultBeverage: e.target.value as 'espresso' | 'filter' | '' })
              qc.invalidateQueries({ queryKey: ['settings'] })
            }}
            style={{ minWidth: 160 }}
          >
            <option value="">{t('edit.beverageTypeNone')}</option>
            <option value="espresso">{t('shots.beverageEspresso')}</option>
            <option value="filter">{t('shots.beverageFilter')}</option>
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{t('settings.de1DefaultBeverageHint')}</p>
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
                    ? `${de1Phase.current} / ${de1Phase.total}`
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
                <p style={{ fontSize: 13, color: de1Phase.errors > 0 ? 'var(--text)' : 'var(--green)' }}>
                  {'✓'} {t('settings.de1Done', {
                    imported: de1Phase.imported,
                    updated:  de1Phase.updated,
                    skipped:  de1Phase.skipped,
                    errors:   de1Phase.errors,
                  })}
                </p>
                {de1Phase.errors > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: 'var(--red)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      {t('settings.de1ErrorDetails', { count: de1Phase.errors })}
                    </p>
                    <div style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      maxHeight: 160,
                      overflowY: 'auto',
                    }}>
                      {de1Phase.errorDetails.map((e) => (
                        <div key={e.filename} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--red)', marginRight: 6 }}>✗</span>
                          <code style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 8 }}>{e.filename}</code>
                          {e.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      </>}

      {tab === 'ki' && (
      <div className="card">
        <div className="card-title">{t('settings.aiSection')}</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4 }}>
            {t('settings.aiClaudeKey')}
          </label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={apiKeyClaudeKey}
            onChange={(e) => setApiKeyClaudeKey(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          />
          <small style={{ color: 'var(--text-dim)' }}>{t('settings.aiClaudeKeyHint')}</small>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4 }}>
            {t('settings.aiOpenaiKey')}
          </label>
          <input
            type="password"
            placeholder="sk-..."
            value={apiKeyOpenaiKey}
            onChange={(e) => setApiKeyOpenaiKey(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          />
          <small style={{ color: 'var(--text-dim)' }}>{t('settings.aiOpenaiKeyHint')}</small>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4 }}>
            {t('settings.aiModelLabel')}
          </label>
          <select
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          >
            <optgroup label="Claude (Anthropic)">
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — {t('settings.aiModelFast')}</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — {t('settings.aiModelBalanced')}</option>
              <option value="claude-opus-4-8">Claude Opus 4.8 — {t('settings.aiModelPowerful')}</option>
            </optgroup>
            <optgroup label="OpenAI">
              <option value="gpt-4o-mini">GPT-4o mini — {t('settings.aiModelFast')}</option>
              <option value="gpt-4o">GPT-4o — {t('settings.aiModelBalanced')}</option>
            </optgroup>
          </select>
          <small style={{ color: 'var(--text-dim)' }}>{t('settings.aiModelHint')}</small>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4 }}>
            {t('settings.aiCustomContextLabel')}
          </label>
          <textarea
            rows={5}
            placeholder={t('settings.aiCustomContextPlaceholder')}
            value={aiCustomContext}
            onChange={(e) => setAiCustomContext(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, resize: 'vertical', background: 'var(--bg-input)', color: 'var(--text)', boxSizing: 'border-box' }}
          />
          <small style={{ color: 'var(--text-dim)' }}>{t('settings.aiCustomContextHint')}</small>
        </div>

        {/* Context Window */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4 }}>
            {t('settings.aiContextWindowLabel')}
          </label>
          <select
            value={aiContextWindow}
            onChange={(e) => setAiContextWindow(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          >
            <option value="7d">{t('settings.aiWindow7d')}</option>
            <option value="30d">{t('settings.aiWindow30d')}</option>
            <option value="90d">{t('settings.aiWindow90d')}</option>
            <option value="all">{t('settings.aiWindowAll')}</option>
          </select>
          <small style={{ color: 'var(--text-dim)' }}>{t('settings.aiContextWindowHint')}</small>
        </div>

        {/* Context Thresholds */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>
            {t('settings.aiContextThresholdsLabel')}
          </label>
          <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                {t('settings.aiTier1MinLabel')} <span style={{ opacity: 0.55 }}>{t('settings.aiTier1MinDefault')}</span>
              </label>
              <input
                type="number"
                min={2}
                max={100}
                value={aiContextTier1Min}
                onChange={(e) => setAiContextTier1Min(Math.max(2, parseInt(e.target.value, 10) || 10))}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                {t('settings.aiMinContextLabel')} <span style={{ opacity: 0.55 }}>{t('settings.aiMinContextDefault')}</span>
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={aiContextMinShots}
                onChange={(e) => setAiContextMinShots(Math.max(1, parseInt(e.target.value, 10) || 2))}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text)' }}
              />
            </div>
          </div>
          <small style={{ color: 'var(--text-dim)' }}>{t('settings.aiContextThresholdsHint')}</small>
        </div>

        {/* Analysis Mode */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 8 }}>
            {t('settings.aiAnalysisModeLabel')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { val: 'standard' as const, labelKey: 'settings.aiModeStandard', descKey: 'settings.aiModeStandardDesc' },
              { val: 'optimized' as const, labelKey: 'settings.aiModeOptimized', descKey: 'settings.aiModeOptimizedDesc' },
            ]).map(({ val, labelKey, descKey }) => (
              <label
                key={val}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: `1px solid ${aiAnalysisMode === val ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  background: aiAnalysisMode === val ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="aiAnalysisMode"
                  value={val}
                  checked={aiAnalysisMode === val}
                  onChange={(e) => setAiAnalysisMode(e.target.value)}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: aiAnalysisMode === val ? 'var(--accent)' : 'var(--text)' }}>{t(labelKey)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t(descKey)}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={async () => {
            setAiKeysMsg('')
            setAiKeysError('')
            try {
              await api.updateSettings({ apiKeyClaudeKey, apiKeyOpenaiKey, aiModel, aiCustomContext, aiAnalysisMode, aiContextWindow, aiContextTier1Min, aiContextMinShots })
              setAiKeysMsg(t('settings.aiSaved'))
              setTimeout(() => setAiKeysMsg(''), 3000)
            } catch (err) {
              setAiKeysError(err instanceof Error ? err.message : t('settings.aiSaveError'))
            }
          }}
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          {t('settings.aiSave')}
        </button>
        {aiKeysMsg && <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e' }}>{aiKeysMsg}</div>}
        {aiKeysError && <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{aiKeysError}</div>}
      </div>
      )}

      {tab === 'daten' && (
      <div className="card">
        <div className="card-title">{t('settings.dbInfo')}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('settings.totalShots')}</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{allShotsData?.total ?? '—'}</span>
        </div>
      </div>
      )}
    </div>
  )
}
