// packages/web/src/components/Layout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client.js'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export default function Layout({ theme, onToggleTheme }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  async function handleLogout() {
    await api.logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28,
              background: 'linear-gradient(135deg, var(--accent), #a07840)',
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>☕</div>
            <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Visualizer Lite
            </span>
          </div>
          <NavLink to="/" style={({ isActive }) => ({
            fontSize: 13, color: isActive ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: isActive ? 600 : 400,
          })}>
            {t('nav.shots')}
          </NavLink>
          <NavLink to="/upload" style={({ isActive }) => ({
            fontSize: 13, color: isActive ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: isActive ? 600 : 400,
          })}>
            {t('nav.upload')}
          </NavLink>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onToggleTheme}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-focus)',
              borderRadius: 20,
              padding: '4px 12px',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
          </button>
          <NavLink to="/settings" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('nav.settings')}
          </NavLink>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ fontSize: 12 }}>
            {t('auth.logout')}
          </button>
        </div>
      </nav>
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
