// Statistics computed from the in-memory demo shots.
// Port of packages/api/src/routes/stats.ts — same windows, grouping and rounding.
import type { ProfileRow, RoasterRow, BeanRow, Stats, StatsWindow } from '../../src/types.js'
import type { DemoShot } from '../data/types.js'

export type Period = Stats['period']
export type Beverage = Stats['beverage']

const DAY = 86_400_000
export const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  '24h': 1, '7d': 7, '14d': 14, '30d': 30, '180d': 180, '365d': 365, '730d': 730, '1095d': 1095,
}
export const isPeriod = (v: unknown): v is Period => v === 'all' || (typeof v === 'string' && v in PERIOD_DAYS)
export const isBeverage = (v: unknown): v is Beverage => v === 'espresso' || v === 'filter' || v === 'all'

const r1 = (x: number) => Math.round(x * 10) / 10
const r3 = (x: number) => Math.round(x * 1000) / 1000
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0)
function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null
}
const ratio = (bw: number, dw: number) => (bw > 0 ? r3(dw / bw) : null)

function byBeverage(shots: DemoShot[], b: Beverage) {
  return b === 'all' ? shots : shots.filter((s) => s.beverageType === b)
}
function inRange(shots: DemoShot[], from: number, to: number) {
  return shots.filter((s) => { const t = Date.parse(s.startTime); return t >= from && t < to })
}
function windowShots(shots: DemoShot[], period: Period, beverage: Beverage, now: number) {
  const b = byBeverage(shots, beverage)
  return period === 'all' ? b : inRange(b, now - PERIOD_DAYS[period] * DAY, now)
}

function groupCount<K>(shots: DemoShot[], key: (s: DemoShot) => K | null, topN: number): { key: K; count: number }[] {
  const m = new Map<string, { key: K; count: number }>()
  for (const s of shots) {
    const k = key(s)
    if (k == null) continue
    const id = JSON.stringify(k)
    const e = m.get(id) ?? { key: k, count: 0 }
    e.count++
    m.set(id, e)
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, topN)
}

function computeWindow(shots: DemoShot[], topN: number): Omit<StatsWindow, 'shotsPerDay'> {
  const bw = sum(shots.map((s) => s.beanWeight))
  const dw = sum(shots.map((s) => s.drinkWeight))
  const enj = avg(shots.map((s) => s.espressoEnjoyment))
  const dur = avg(shots.map((s) => s.duration))
  return {
    shotCount: shots.length,
    beanWeightG: Math.round(bw),
    drinkWeightG: Math.round(dw),
    avgRatio: ratio(bw, dw),
    avgEnjoyment: enj != null ? r1(enj) : null,
    avgDurationS: dur != null ? r1(dur) : null,
    topGrinderSetting: groupCount(shots, (s) => s.grinderSetting, 1)[0]?.key ?? null,
    topRoasters: groupCount(shots, (s) => s.beanBrand, topN).map((g) => ({ name: g.key, count: g.count })),
    topRoasts: groupCount(shots, (s) => (s.beanBrand && s.beanType ? `${s.beanBrand} · ${s.beanType}` : null), topN)
      .map((g) => ({ name: g.key, count: g.count })),
    topProfiles: groupCount(shots, (s) => s.profileTitle, topN).map((g) => ({ name: g.key, count: g.count })),
  }
}

export function computeStats(shots: DemoShot[], period: Period, beverage: Beverage, topN: number, now: number): Stats {
  const b = byBeverage(shots, beverage)
  if (period === 'all') {
    return {
      period, beverage,
      current: { ...computeWindow(b, topN), shotsPerDay: null },
      previous: { ...computeWindow([], topN), shotsPerDay: null },
    }
  }
  const days = PERIOD_DAYS[period]
  const ms = days * DAY
  const cur = computeWindow(inRange(b, now - ms, now), topN)
  const prev = computeWindow(inRange(b, now - 2 * ms, now - ms), topN)
  return {
    period, beverage,
    current: { ...cur, shotsPerDay: r1(cur.shotCount / days) },
    previous: { ...prev, shotsPerDay: r1(prev.shotCount / days) },
  }
}

function aggregate(group: DemoShot[]) {
  const bw = sum(group.map((s) => s.beanWeight))
  const dw = sum(group.map((s) => s.drinkWeight))
  const enj = avg(group.map((s) => s.espressoEnjoyment))
  const dur = avg(group.map((s) => s.duration))
  return {
    shotCount: group.length,
    avgEnjoyment: enj != null ? r1(enj) : null,
    avgRatio: ratio(bw, dw),
    avgDurationS: dur != null ? r1(dur) : null,
    totalBeanWeightG: Math.round(bw),
  }
}

function groupBy(shots: DemoShot[], key: (s: DemoShot) => string | null): [string, DemoShot[]][] {
  const m = new Map<string, DemoShot[]>()
  for (const s of shots) {
    const k = key(s)
    if (k == null) continue
    m.set(k, [...(m.get(k) ?? []), s])
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
}

export function computeRoasters(shots: DemoShot[], period: Period, beverage: Beverage, now: number): RoasterRow[] {
  const w = windowShots(shots, period, beverage, now)
  return groupBy(w, (s) => s.beanBrand).map(([roaster, group]) => ({
    roaster,
    ...aggregate(group),
    beans: groupBy(group, (s) => s.beanType).map(([bean, g]): BeanRow => ({ bean, ...aggregate(g) })),
  }))
}

export function computeProfiles(shots: DemoShot[], period: Period, beverage: Beverage, now: number): ProfileRow[] {
  const w = windowShots(shots, period, beverage, now)
  return groupBy(w, (s) => s.profileTitle).map(([profile, group]) => {
    const a = aggregate(group)
    const abw = avg(group.map((s) => s.beanWeight))
    return {
      profile,
      shotCount: a.shotCount,
      avgEnjoyment: a.avgEnjoyment,
      avgDurationS: a.avgDurationS,
      avgRatio: a.avgRatio,
      avgBeanWeightG: abw != null ? r1(abw) : null,
    }
  })
}
