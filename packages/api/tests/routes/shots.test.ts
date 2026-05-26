import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildServer } from '../../src/server.js'
import { prisma } from '../../src/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const shotFile = readFileSync(join(__dirname, '../fixtures/sample.shot'))

let app: Awaited<ReturnType<typeof buildServer>>
let cookie: string

function multipart(file: Buffer, filename: string): string {
  return [
    '--B',
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: application/octet-stream',
    '',
    file.toString('binary'),
    '--B--',
  ].join('\r\n')
}

async function upload() {
  return app.inject({
    method: 'POST',
    url: '/api/shots/upload',
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=B' },
    payload: multipart(shotFile, 'test.shot'),
  })
}

beforeAll(async () => {
  process.env.VL_PASSWORD = 'testpass'
  try { await prisma.settings.deleteMany() } catch {}
  app = await buildServer()
  await app.ready()
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { password: 'testpass' },
  })
  cookie = login.headers['set-cookie'] as string
})

afterAll(() => app.close())

beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM "_ShotToTag"`
  await prisma.$executeRaw`DELETE FROM "Shot"`
})

describe('POST /shots/upload', () => {
  it('returns id on success', async () => {
    const res = await upload()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).id).toBeDefined()
  })

  it('returns 409 on duplicate', async () => {
    await upload()
    const res2 = await upload()
    expect(res2.statusCode).toBe(409)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/shots/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=B' },
      payload: multipart(shotFile, 'test.shot'),
    })
    expect(res.statusCode).toBe(401)
  })

  it('accepts Basic Auth (Visualizer API compat)', async () => {
    const auth = 'Basic ' + Buffer.from('admin:testpass').toString('base64')
    const res = await app.inject({
      method: 'POST', url: '/api/shots/upload',
      headers: { authorization: auth, 'content-type': 'multipart/form-data; boundary=B' },
      payload: multipart(shotFile, 'test.shot'),
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('GET /api/shots', () => {
  it('returns empty list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/shots', headers: { cookie } })
    expect(JSON.parse(res.body)).toMatchObject({ shots: [], total: 0 })
  })

  it('returns shot after upload', async () => {
    await upload()
    const res = await app.inject({ method: 'GET', url: '/api/shots', headers: { cookie } })
    const body = JSON.parse(res.body)
    expect(body.total).toBe(1)
    expect(body.shots[0].beanBrand).toBe('Gardelli')
  })

  it('filters by beanBrand query param', async () => {
    await upload()
    const res = await app.inject({
      method: 'GET', url: '/api/shots?beanBrand=Gardelli', headers: { cookie },
    })
    expect(JSON.parse(res.body).total).toBe(1)

    const res2 = await app.inject({
      method: 'GET', url: '/api/shots?beanBrand=Other', headers: { cookie },
    })
    expect(JSON.parse(res2.body).total).toBe(0)
  })
})

describe('GET /api/shots/:id', () => {
  it('returns shot with shotData', async () => {
    const up = await upload()
    const { id } = JSON.parse(up.body)
    const res = await app.inject({ method: 'GET', url: `/api/shots/${id}`, headers: { cookie } })
    const body = JSON.parse(res.body)
    expect(body.id).toBe(id)
    expect(body.shotData.timeframe).toBeDefined()
    expect(body.shotData.espresso_pressure).toBeDefined()
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/shots/no-such-id', headers: { cookie } })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /api/shots/:id', () => {
  it('updates notes and enjoyment', async () => {
    const up = await upload()
    const { id } = JSON.parse(up.body)
    const res = await app.inject({
      method: 'PATCH', url: `/api/shots/${id}`,
      headers: { cookie },
      payload: { espressoNotes: 'Great!', espressoEnjoyment: 92 },
    })
    const body = JSON.parse(res.body)
    expect(body.espressoNotes).toBe('Great!')
    expect(body.espressoEnjoyment).toBe(92)
  })
})

describe('DELETE /api/shots/:id', () => {
  it('deletes shot and returns 204', async () => {
    const up = await upload()
    const { id } = JSON.parse(up.body)
    const del = await app.inject({ method: 'DELETE', url: `/api/shots/${id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
    const get = await app.inject({ method: 'GET', url: `/api/shots/${id}`, headers: { cookie } })
    expect(get.statusCode).toBe(404)
  })
})
