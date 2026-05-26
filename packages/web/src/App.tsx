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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const loggedIn = document.cookie.includes('token=')
  return loggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { theme, toggleTheme } = useTheme()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout theme={theme} onToggleTheme={toggleTheme} />
            </ProtectedRoute>
          }
        >
          <Route index element={<ShotList />} />
          <Route path="shots/:id" element={<ShotDetail />} />
          <Route path="shots/:id/edit" element={<ShotEdit />} />
          <Route path="upload" element={<Upload />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
