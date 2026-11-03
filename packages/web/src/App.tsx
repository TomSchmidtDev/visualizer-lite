// packages/web/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTheme } from './hooks/useTheme.js'
import Layout from './components/Layout.js'
import Login from './pages/Login.js'
import ShotList from './pages/ShotList.js'
import ShotDetail from './pages/ShotDetail.js'
import ShotEdit from './pages/ShotEdit.js'
import Upload from './pages/Upload.js'
import Settings from './pages/Settings.js'
import ShotCompare from './pages/ShotCompare.js'
import Stats from './pages/Stats.js'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const loggedIn = document.cookie.includes('vl_loggedin=')
  return loggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

/** The app's route tree. Mounted under a router by `App` (and by the demo tour). */
export function AppRoutes({ requireLogin = true }: { requireLogin?: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const layout = <Layout theme={theme} onToggleTheme={toggleTheme} />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={requireLogin ? <ProtectedRoute>{layout}</ProtectedRoute> : layout}>
        <Route index element={<ShotList />} />
        <Route path="shots/:id" element={<ShotDetail />} />
        <Route path="shots/:id/edit" element={<ShotEdit />} />
        <Route path="compare" element={<ShotCompare />} />
        <Route path="upload" element={<Upload />} />
        <Route path="settings" element={<Settings />} />
        <Route path="stats" element={<Stats />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
