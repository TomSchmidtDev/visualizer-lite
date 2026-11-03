// Synthetic demo data for tests and the placeholder dataset. Not real shots.
import type { AnalysisResponse } from '../../src/types.js'
import type { DemoDataset, DemoShot } from '../data/types.js'

const curve = (n: number, f: (t: number) => number) => Array.from({ length: n }, (_, i) => Math.round(f(i / (n - 1)) * 100) / 100)

let counter = 0

export function makeShot(overrides: Partial<DemoShot> = {}): DemoShot {
  counter++
  const n = 120
  return {
    id: `shot-${counter}`,
    startTime: '2026-10-01T08:00:00.000Z',
    duration: 30,
    beanWeight: 18,
    drinkWeight: 36,
    drinkTds: null,
    drinkEy: null,
    profileTitle: 'Default',
    beverageType: 'espresso',
    grinderModel: 'Niche Zero',
    grinderSetting: '12',
    barista: 'Tom',
    beanBrand: 'Demo Roastery',
    beanType: 'Ethiopia Guji',
    roastDate: '2026-09-20T00:00:00.000Z',
    roastLevel: 'Light',
    espressoEnjoyment: 80,
    fragrance: null, aroma: null, flavor: null, aftertaste: null,
    acidity: null, bitterness: null, sweetness: null, mouthfeel: null,
    beanNotes: null,
    espressoNotes: null,
    privateNotes: null,
    tags: [],
    shotData: {
      timeframe: curve(n, (t) => t * 30),
      espresso_pressure: curve(n, (t) => (t < 0.2 ? t * 40 : 9 - t * 3)),
      espresso_flow: curve(n, (t) => (t < 0.2 ? t * 5 : 2 + t)),
      espresso_flow_weight: curve(n, (t) => (t < 0.25 ? 0 : 1.8 + t)),
      espresso_weight: curve(n, (t) => Math.max(0, (t - 0.25) * 48)),
    },
    ...overrides,
  }
}

export function makeAnalysis(shotId: string, overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    id: `analysis-${shotId}`,
    shotId,
    analysisType: 'detail',
    aiModel: 'claude-sonnet-4-6',
    barista: ['Flow peaked early; try a slightly finer grind.'],
    roaster: ['Light roast, rested 11 days — in its best window.'],
    analyst: [],
    tokenInputCount: 4200,
    tokenOutputCount: 600,
    costInputUsd: 0.0126,
    costOutputUsd: 0.009,
    createdAt: '2026-10-01T08:05:00.000Z',
    contextSummary: null,
    ...overrides,
  }
}

const DAY = 86_400_000

/** A small dataset: `count` shots one day apart ending at `newest`, last `importCount` form the import batch. */
export function makeDataset(count = 12, importCount = 3, newest = '2026-10-20T08:00:00.000Z'): DemoDataset {
  const roasters = ['Demo Roastery', 'Sample Coffee Co', 'Test Beans']
  const beans = ['Ethiopia Guji', 'Kenya Kiambu', 'Colombia Huila']
  const shots = Array.from({ length: count }, (_, i) => {
    const r = i % 3
    return makeShot({
      startTime: new Date(Date.parse(newest) - i * DAY).toISOString(),
      beanBrand: roasters[r],
      beanType: beans[r],
      beverageType: i % 5 === 4 ? 'filter' : 'espresso',
      profileTitle: i % 2 ? 'Adaptive' : 'Blooming',
      beanWeight: 18,
      drinkWeight: 36 + i,
      duration: 28 + i,
      espressoEnjoyment: 70 + i,
    })
  })
  const featured = shots[importCount]
  return {
    exportedAt: new Date(Date.parse(newest) + 3_600_000).toISOString(),
    shots,
    importBatchIds: shots.slice(0, importCount).map((s) => s.id),
    analyses: { [featured.id]: makeAnalysis(featured.id) },
  }
}
