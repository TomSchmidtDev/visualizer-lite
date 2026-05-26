import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildServer } from '../../src/server.js'
import { prisma } from '../../src/db.js'

let app: Awaited<ReturnType<typeof buildServer>>

beforeAll(async () => {
  process.env.VL_PASSWORD = 'testpass'
  // Clear settings so seedInitialUser runs
  try { await prisma.settings.deleteMany() } catch {}
  app = await buildServer()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('POST /api/auth/login', () => {
  it('sets cookie on correct password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'testpass' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
    expect(JSON.parse(res.body).ok).toBe(true)
  })

  it('returns 401 on wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('returns 200', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass' },
    })
    const cookie = login.headers['set-cookie'] as string
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    })
    expect(logout.statusCode).toBe(200)
  })
})

describe('protected routes', () => {
  it('returns 401 on /api/shots without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/shots' })
    expect(res.statusCode).toBe(401)
  })
})
