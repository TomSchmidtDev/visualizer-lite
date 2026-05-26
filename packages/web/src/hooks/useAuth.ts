// packages/web/src/hooks/useAuth.ts
import { useState, useCallback } from 'react'
import { api } from '../api/client.js'

export function useAuth() {
  const [loggedIn, setLoggedIn] = useState(() => {
    return document.cookie.includes('token=')
  })

  const login = useCallback(async (password: string) => {
    await api.login(password)
    setLoggedIn(true)
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setLoggedIn(false)
    window.location.href = '/login'
  }, [])

  return { loggedIn, login, logout }
}
