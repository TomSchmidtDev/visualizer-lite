// In-memory shot store for the demo. Filtering/sorting mirrors
// packages/api/src/services/shotService.ts (listShots) and searchService.ts.
import type { AnalysisResponse, SearchParams, Shot, ShotListResponse, Suggestions } from '../../src/types.js'
import type { DemoDataset, DemoShot } from '../data/types.js'

export interface DemoStore {
  list(p: SearchParams): ShotListResponse
  get(id: string): DemoShot | undefined
  update(id: string, patch: Partial<Shot>): DemoShot | undefined
  remove(id: string): boolean
  suggestions(): Suggestions
  pendingImport(): DemoShot[]
  importOne(id: string): 'imported' | 'skipped'
  analysis(id: string): AnalysisResponse | undefined
  all(): DemoShot[]
}

export function downsample(arr: number[], target = 60): number[] {
  if (arr.length <= target) return arr
  const step = arr.length / target
  return Array.from({ length: target }, (_, i) => arr[Math.round(i * step)])
}

const contains = (v: string | null, q: string) => !!v && v.toLowerCase().includes(q.toLowerCase())

function matchesQuery(s: DemoShot, q: string): boolean {
  const words = [s.beanBrand, s.beanType, s.profileTitle, s.grinderModel, s.espressoNotes, s.beanNotes]
    .filter(Boolean).join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u)
  return q.trim().toLowerCase().split(/\s+/).every((tok) => words.some((w) => w.startsWith(tok)))
}

function toListItem(s: DemoShot): Omit<Shot, 'shotData'> {
  const { shotData, ...rest } = s
  return {
    ...rest,
    sparkline: {
      pressure: shotData.espresso_pressure?.length ? downsample(shotData.espresso_pressure) : undefined,
      flow: shotData.espresso_flow?.length ? downsample(shotData.espresso_flow) : undefined,
      weightFlow: shotData.espresso_flow_weight?.length ? downsample(shotData.espresso_flow_weight) : undefined,
    },
  }
}

export function avgRatio(shots: DemoShot[]): number | null {
  const valid = shots.filter((s) => (s.beanWeight ?? 0) > 0 && s.drinkWeight != null)
  if (!valid.length) return null
  const sum = valid.reduce((acc, s) => acc + s.drinkWeight! / s.beanWeight!, 0)
  return Math.round((sum / valid.length) * 100) / 100
}

const uniqSorted = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => x != null))].sort()

export function createStore(ds: DemoDataset): DemoStore {
  const pending = new Set(ds.importBatchIds)
  const shots = new Map<string, DemoShot>(ds.shots.map((s) => [s.id, structuredClone(s)]))

  const visible = () => [...shots.values()]
    .filter((s) => !pending.has(s.id))
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))

  return {
    list(p) {
      const page = Math.max(1, p.page ?? 1)
      const limit = Math.min(100, Math.max(1, p.limit ?? 20))
      const from = p.dateFrom ? Date.parse(p.dateFrom) : -Infinity
      const to = p.dateTo ? Date.parse(p.dateTo) : Infinity
      const matched = visible().filter((s) =>
        (!p.beanBrand || contains(s.beanBrand, p.beanBrand)) &&
        (!p.beanType || contains(s.beanType, p.beanType)) &&
        (!p.profileTitle || contains(s.profileTitle, p.profileTitle)) &&
        (!p.grinderModel || contains(s.grinderModel, p.grinderModel)) &&
        (Date.parse(s.startTime) >= from && Date.parse(s.startTime) <= to) &&
        (!p.beverageType || (p.beverageType === 'unknown' ? !s.beverageType : s.beverageType === p.beverageType)) &&
        (!p.q?.trim() || matchesQuery(s, p.q)))
      return {
        shots: matched.slice((page - 1) * limit, page * limit).map(toListItem),
        total: matched.length,
        page,
        limit,
        avgRatio: avgRatio(matched),
      }
    },
    get: (id) => (pending.has(id) ? undefined : shots.get(id)),
    update(id, patch) {
      const s = this.get(id)
      if (!s) return undefined
      const next = { ...s, ...patch, id } as DemoShot
      shots.set(id, next)
      return next
    },
    remove(id) {
      if (!this.get(id)) return false
      shots.delete(id)
      return true
    },
    suggestions() {
      const v = visible()
      return {
        beanBrands: uniqSorted(v.map((s) => s.beanBrand)),
        beanTypes: uniqSorted(v.map((s) => s.beanType)),
        profileTitles: uniqSorted(v.map((s) => s.profileTitle)),
        grinderModels: uniqSorted(v.map((s) => s.grinderModel)),
        grinderSettings: uniqSorted(v.map((s) => s.grinderSetting)),
        beverageTypes: uniqSorted(v.map((s) => s.beverageType || 'unknown')),
      }
    },
    pendingImport: () => ds.importBatchIds.filter((id) => pending.has(id) && shots.has(id)).map((id) => shots.get(id)!),
    importOne(id) {
      if (!pending.has(id)) return 'skipped'
      pending.delete(id)
      return 'imported'
    },
    analysis: (id) => ds.analyses[id],
    all: visible,
  }
}
