import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildServer } from '../../src/server.js'
import { prisma } from '../../src/db.js'

let app: Awaited<ReturnType<typeof buildServer>>
let cookie: string

const NOW = Date.now()
const DAY = 24 * 60 * 60 * 1000

function daysAgo(n: number) {
  return new Date(NOW - n * DAY)
}

async function createShot(overrides: {
  startTime?: Date
  beanWeight?: number
  drinkWeight?: number
  espressoEnjoyment?: number
  duration?: number
  grinderSetting?: string
  beanBrand?: string
  beanType?: string
  profileTitle?: string
  beverageType?: string
}) {
  return prisma.shot.create({
    data: {
      startTime: overrides.startTime ?? daysAgo(1),
      filePath: `test-${Math.random()}.shot`,
      sha256: Math.random().toString(36),
      beanWeight: overrides.beanWeight ?? 18,
      drinkWeight: overrides.drinkWeight ?? 36,
      espressoEnjoyment: overrides.espressoEnjoyment ?? null,
      duration: overrides.duration ?? 28,
      grinderSetting: overrides.grinderSetting ?? null,
      beanBrand: overrides.beanBrand ?? null,
      beanType: overrides.beanType ?? null,
      profileTitle: overrides.profileTitle ?? null,
      beverageType: overrides.beverageType ?? null,
      shotData: '{"timeframe":[]}',
    },
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

async function getStats(params: string) {
  return app.inject({
    method: 'GET',
    url: `/api/stats?${params}`,
    headers: { cookie },
  })
}

describe('GET /api/stats', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats' })
    expect(res.statusCode).toBe(401)
  })

  it('counts shots in current period only', async () => {
    await createShot({ startTime: daysAgo(5) })    // within 180d current window
    await createShot({ startTime: daysAgo(190) })  // outside 180d current, inside previous 180d window
    const res = await getStats('period=180d&beverage=all')
    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(body.current.shotCount).toBe(1)
    expect(body.previous.shotCount).toBe(1)
  })

  it('filters by beverageType=espresso', async () => {
    await createShot({ beverageType: 'espresso', startTime: daysAgo(1) })
    await createShot({ beverageType: 'filter',   startTime: daysAgo(1) })
    await createShot({ beverageType: null,        startTime: daysAgo(1) })
    const res = await getStats('period=7d&beverage=espresso')
    const body = JSON.parse(res.body)
    expect(body.current.shotCount).toBe(1)
  })

  it('filters by beverageType=filter', async () => {
    await createShot({ beverageType: 'espresso', startTime: daysAgo(1) })
    await createShot({ beverageType: 'filter',   startTime: daysAgo(1) })
    const res = await getStats('period=7d&beverage=filter')
    const body = JSON.parse(res.body)
    expect(body.current.shotCount).toBe(1)
  })

  it('beverage=all includes null beverageType shots', async () => {
    await createShot({ beverageType: null,        startTime: daysAgo(1) })
    await createShot({ beverageType: 'espresso',  startTime: daysAgo(1) })
    const res = await getStats('period=7d&beverage=all')
    const body = JSON.parse(res.body)
    expect(body.current.shotCount).toBe(2)
  })

  it('sums beanWeightG and drinkWeightG', async () => {
    await createShot({ beanWeight: 18, drinkWeight: 36, startTime: daysAgo(1), beverageType: 'espresso' })
    await createShot({ beanWeight: 20, drinkWeight: 42, startTime: daysAgo(1), beverageType: 'espresso' })
    const res = await getStats('period=7d&beverage=espresso')
    const body = JSON.parse(res.body)
    expect(body.current.beanWeightG).toBe(38)
    expect(body.current.drinkWeightG).toBe(78)
  })

  it('computes topRoasters sorted by count desc', async () => {
    await createShot({ beanBrand: 'Gardelli', startTime: daysAgo(1), beverageType: 'espresso' })
    await createShot({ beanBrand: 'Gardelli', startTime: daysAgo(1), beverageType: 'espresso' })
    await createShot({ beanBrand: 'Nomad',    startTime: daysAgo(1), beverageType: 'espresso' })
    const res = await getStats('period=7d&beverage=espresso')
    const body = JSON.parse(res.body)
    expect(body.current.topRoasters[0].name).toBe('Gardelli')
    expect(body.current.topRoasters[0].count).toBe(2)
    expect(body.current.topRoasters[1].name).toBe('Nomad')
  })

  it('concatenates beanBrand · beanType in topRoasts', async () => {
    await createShot({ beanBrand: 'Gardelli', beanType: 'Ethiopia', startTime: daysAgo(1), beverageType: 'espresso' })
    const res = await getStats('period=7d&beverage=espresso')
    const body = JSON.parse(res.body)
    expect(body.current.topRoasts[0].name).toBe('Gardelli · Ethiopia')
  })

  it('excludes null beanBrand from topRoasters', async () => {
    await createShot({ beanBrand: null, startTime: daysAgo(1), beverageType: 'espresso' })
    const res = await getStats('period=7d&beverage=espresso')
    const body = JSON.parse(res.body)
    expect(body.current.topRoasters).toHaveLength(0)
  })

  it('returns topGrinderSetting as mode', async () => {
    await createShot({ grinderSetting: 'A', startTime: daysAgo(1), beverageType: 'espresso' })
    await createShot({ grinderSetting: 'A', startTime: daysAgo(1), beverageType: 'espresso' })
    await createShot({ grinderSetting: 'B', startTime: daysAgo(1), beverageType: 'espresso' })
    const res = await getStats('period=7d&beverage=espresso')
    const body = JSON.parse(res.body)
    expect(body.current.topGrinderSetting).toBe('A')
  })

  it('uses default period=365d and beverage=espresso when params omitted', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats', headers: { cookie } })
    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(body.period).toBe('365d')
    expect(body.beverage).toBe('espresso')
  })
})

describe('GET /api/stats/roasters', () => {
  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats/roasters' })
    expect(res.statusCode).toBe(401)
  })

  it('returns roasters with nested beans sorted by shotCount desc', async () => {
    await createShot({ beanBrand: 'Gardelli', beanType: 'Ethiopia', startTime: daysAgo(1), beverageType: 'espresso', beanWeight: 18, drinkWeight: 36, duration: 28, espressoEnjoyment: 80 })
    await createShot({ beanBrand: 'Gardelli', beanType: 'Colombia', startTime: daysAgo(1), beverageType: 'espresso', beanWeight: 18, drinkWeight: 36, duration: 30, espressoEnjoyment: 90 })
    await createShot({ beanBrand: 'Nomad',    beanType: 'Blend',    startTime: daysAgo(1), beverageType: 'espresso', beanWeight: 18, drinkWeight: 36, duration: 25, espressoEnjoyment: 70 })

    const res = await app.inject({ method: 'GET', url: '/api/stats/roasters?period=7d&beverage=espresso', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as Array<{
      roaster: string; shotCount: number; avgEnjoyment: number | null;
      avgRatio: number | null; avgDurationS: number | null; totalBeanWeightG: number;
      beans: Array<{ bean: string; shotCount: number }>
    }>
    expect(body).toHaveLength(2)
    expect(body[0].roaster).toBe('Gardelli')
    expect(body[0].shotCount).toBe(2)
    expect(body[0].totalBeanWeightG).toBe(36)
    expect(body[0].beans).toHaveLength(2)
    expect(body[0].beans.map(b => b.bean)).toContain('Ethiopia')
    expect(body[0].beans.map(b => b.bean)).toContain('Colombia')
    expect(body[1].roaster).toBe('Nomad')
  })

  it('respects period filter', async () => {
    await createShot({ beanBrand: 'Gardelli', startTime: daysAgo(5),   beverageType: 'espresso' })
    await createShot({ beanBrand: 'Gardelli', startTime: daysAgo(400), beverageType: 'espresso' })
    const res = await app.inject({ method: 'GET', url: '/api/stats/roasters?period=30d&beverage=espresso', headers: { cookie } })
    const body = JSON.parse(res.body) as Array<{ roaster: string; shotCount: number }>
    expect(body).toHaveLength(1)
    expect(body[0].shotCount).toBe(1)
  })

  it('respects beverage filter', async () => {
    await createShot({ beanBrand: 'Gardelli', startTime: daysAgo(1), beverageType: 'espresso' })
    await createShot({ beanBrand: 'Gardelli', startTime: daysAgo(1), beverageType: 'filter' })
    const res = await app.inject({ method: 'GET', url: '/api/stats/roasters?period=7d&beverage=espresso', headers: { cookie } })
    const body = JSON.parse(res.body) as Array<{ shotCount: number }>
    expect(body[0].shotCount).toBe(1)
  })

  it('computes avgRatio from beanWeight and drinkWeight', async () => {
    await createShot({ beanBrand: 'Gardelli', beanWeight: 18, drinkWeight: 36, startTime: daysAgo(1), beverageType: 'espresso' })
    const res = await app.inject({ method: 'GET', url: '/api/stats/roasters?period=7d&beverage=espresso', headers: { cookie } })
    const body = JSON.parse(res.body) as Array<{ avgRatio: number | null }>
    expect(body[0].avgRatio).toBeCloseTo(2.0, 2)
  })

  it('excludes shots with null beanBrand', async () => {
    await createShot({ beanBrand: null, startTime: daysAgo(1), beverageType: 'espresso' })
    const res = await app.inject({ method: 'GET', url: '/api/stats/roasters?period=7d&beverage=espresso', headers: { cookie } })
    const body = JSON.parse(res.body)
    expect(body).toHaveLength(0)
  })
})
