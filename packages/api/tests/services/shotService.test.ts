import { describe, it, expect, beforeEach } from 'vitest'
import { prisma, enableWal } from '../../src/db.js'
import {
  createShot,
  findShot,
  listShots,
  updateShot,
  deleteShot,
} from '../../src/services/shotService.js'
import type { ParsedShot } from '../../src/types.js'

const base: ParsedShot = {
  clock: 1716624120,
  beanBrand: 'Gardelli',
  beanType: 'Ethiopia Guji',
  beanWeight: 18.0,
  drinkWeight: 36.2,
  duration: 27.4,
  grinderModel: 'EK43s',
  grinderSetting: '2.8',
  barista: null,
  profileTitle: 'Blooming Espresso',
  roastLevel: 'light',
  roastDate: '2026-05-10',
  shotData: { timeframe: [0, 1, 2], espresso_pressure: [0, 5, 9] },
}

beforeEach(async () => {
  await enableWal()
  await prisma.$executeRaw`DELETE FROM "_ShotToTag"`
  await prisma.$executeRaw`DELETE FROM "Shot"`
})

describe('createShot', () => {
  it('creates a shot with all parsed fields', async () => {
    const shot = await createShot(base, 'abc123', '2026/05/abc123.shot')
    expect(shot.id).toBeDefined()
    expect(shot.beanBrand).toBe('Gardelli')
    expect(shot.duration).toBe(27.4)
  })

  it('throws Prisma P2002 on duplicate sha256', async () => {
    await createShot(base, 'dup', 'path1')
    await expect(createShot(base, 'dup', 'path2')).rejects.toMatchObject({
      code: 'P2002',
    })
  })
})

describe('findShot', () => {
  it('returns null for unknown id', async () => {
    expect(await findShot('does-not-exist')).toBeNull()
  })

  it('returns shot with shotData for known id', async () => {
    const created = await createShot(base, 'find1', 'p1')
    const found = await findShot(created.id)
    expect(found?.id).toBe(created.id)
    expect(found?.shotData?.timeframe).toEqual([0, 1, 2])
  })
})

describe('listShots', () => {
  it('returns empty when no shots', async () => {
    const result = await listShots({})
    expect(result.shots).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('sorts newest first', async () => {
    await createShot({ ...base, clock: 1000 }, 'h1', 'p1')
    await createShot({ ...base, clock: 2000 }, 'h2', 'p2')
    const result = await listShots({})
    expect(new Date(result.shots[0].startTime).getTime()).toBeGreaterThan(
      new Date(result.shots[1].startTime).getTime()
    )
  })

  it('filters by beanBrand', async () => {
    await createShot({ ...base, beanBrand: 'Gardelli' }, 'g1', 'p1')
    await createShot({ ...base, beanBrand: 'Other' }, 'o1', 'p2')
    const result = await listShots({ beanBrand: 'Gardelli' })
    expect(result.shots).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('paginates correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await createShot({ ...base, clock: i * 1000 }, `h${i}`, `p${i}`)
    }
    const result = await listShots({ page: 1, limit: 2 })
    expect(result.shots).toHaveLength(2)
    expect(result.total).toBe(5)
    expect(result.page).toBe(1)
  })
})

describe('updateShot', () => {
  it('updates notes and enjoyment', async () => {
    const shot = await createShot(base, 'u1', 'p1')
    const updated = await updateShot(shot.id, {
      espressoNotes: 'Delicious',
      espressoEnjoyment: 88,
    })
    expect(updated.espressoNotes).toBe('Delicious')
    expect(updated.espressoEnjoyment).toBe(88)
  })

  it('handles tag updates', async () => {
    const shot = await createShot(base, 'u2', 'p2')
    const updated = await updateShot(shot.id, { tags: ['fruity', 'light'] })
    expect(updated.tags).toContain('fruity')
    expect(updated.tags).toContain('light')
  })
})

describe('deleteShot', () => {
  it('removes shot from DB', async () => {
    const shot = await createShot(base, 'd1', 'p1')
    await deleteShot(shot.id)
    expect(await findShot(shot.id)).toBeNull()
  })
})
