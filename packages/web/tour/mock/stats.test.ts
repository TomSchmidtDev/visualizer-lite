import { describe, it, expect } from 'vitest'
import { computeStats, computeRoasters, computeProfiles } from './stats.js'
import { makeShot } from './fixtures.test-helpers.js'

const now = Date.parse('2026-10-20T12:00:00.000Z')
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

const shots = [
  makeShot({ startTime: daysAgo(1), beanBrand: 'A', beanType: 'a1', profileTitle: 'P1', beanWeight: 18, drinkWeight: 36, duration: 30, espressoEnjoyment: 80, grinderSetting: '10' }),
  makeShot({ startTime: daysAgo(2), beanBrand: 'A', beanType: 'a2', profileTitle: 'P1', beanWeight: 18, drinkWeight: 40, duration: 32, espressoEnjoyment: 90, grinderSetting: '10' }),
  makeShot({ startTime: daysAgo(3), beanBrand: 'B', beanType: 'b1', profileTitle: 'P2', beanWeight: 20, drinkWeight: 40, duration: 28, espressoEnjoyment: 70, grinderSetting: '12' }),
  makeShot({ startTime: daysAgo(9), beanBrand: 'B', beanType: 'b1', profileTitle: 'P2', beanWeight: 18, drinkWeight: 36 }),
  makeShot({ startTime: daysAgo(4), beanBrand: 'C', beverageType: 'filter', beanWeight: 15, drinkWeight: 250 }),
  makeShot({ startTime: daysAgo(5), beanBrand: 'D', beverageType: null }),
]

describe('computeStats', () => {
  const s = computeStats(shots, '7d', 'espresso', 10, now)

  it('7d window counts only espresso shots of the last 7 days', () => expect(s.current.shotCount).toBe(3))
  it('previous window is the 7 days before', () => expect(s.previous.shotCount).toBe(1))
  it('computes sums, ratio, averages and shotsPerDay with API rounding', () => {
    expect(s.current).toMatchObject({
      beanWeightG: 56, drinkWeightG: 116, avgRatio: 2.071, avgEnjoyment: 80, avgDurationS: 30,
      shotsPerDay: 0.4, topGrinderSetting: '10',
    })
  })
  it('orders topRoasters by count and limits to topN', () => {
    expect(computeStats(shots, '7d', 'espresso', 1, now).current.topRoasters).toEqual([{ name: 'A', count: 2 }])
  })
  it('names topRoasts as "brand · type"', () => expect(s.current.topRoasts[0].name).toMatch(/ · /))
  it('all has an empty previous window and null shotsPerDay', () => {
    const a = computeStats(shots, 'all', 'all', 10, now)
    expect(a.current.shotCount).toBe(6)
    expect(a.previous.shotCount).toBe(0)
    expect(a.current.shotsPerDay).toBeNull()
  })
  it('espresso excludes shots with null beverage', () => {
    expect(computeStats(shots, '30d', 'espresso', 10, now).current.shotCount).toBe(4)
  })
})

describe('computeRoasters', () => {
  it('groups by roaster and nests beans', () => {
    const r = computeRoasters(shots, '7d', 'espresso', now)
    expect(r[0]).toMatchObject({ roaster: 'A', shotCount: 2, totalBeanWeightG: 36, avgRatio: 2.111, avgEnjoyment: 85 })
    expect(r[0].beans.map((b) => b.bean).sort()).toEqual(['a1', 'a2'])
  })
})

describe('computeProfiles', () => {
  it('groups by profile with avgBeanWeightG rounded to 1 dp', () => {
    const p = computeProfiles(shots, '30d', 'espresso', now)
    const p2 = p.find((x) => x.profile === 'P2')!
    expect(p2).toMatchObject({ shotCount: 2, avgBeanWeightG: 19 })
  })
})
