// Pure anonymization of real shots for the public demo.
// Keeps what makes the demo convincing (curves, recipe, scores, roaster/bean names),
// removes or replaces everything personal.
import type { AnalysisResponse } from '../../src/types.js'
import type { DemoShot } from '../data/types.js'
import { shiftIso } from '../data/rebase.js'

export const DEMO_BARISTA = 'Alex'

export const SAMPLE_ESPRESSO_NOTES = [
  'Sweet and balanced, a touch of citrus on the finish.',
  'Syrupy body, notes of dark chocolate and cherry.',
  'Bright acidity, slightly thin — grind a bit finer next time.',
  'Clean and floral, long sweet aftertaste.',
]

export const SAMPLE_BEAN_NOTES = [
  'Stone fruit, honey, black tea.',
  'Milk chocolate, hazelnut, caramel.',
  'Jasmine, bergamot, peach.',
  'Red berries, cocoa nibs, brown sugar.',
]

function pick<T>(list: T[], seed: string): T {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

export function anonymizeShot(shot: DemoShot, ctx: { newId: string; timeShiftMs: number }): DemoShot {
  return {
    ...shot,
    id: ctx.newId,
    barista: shot.barista == null ? null : DEMO_BARISTA,
    privateNotes: null,
    espressoNotes: shot.espressoNotes == null ? null : pick(SAMPLE_ESPRESSO_NOTES, ctx.newId),
    beanNotes: shot.beanNotes == null ? null : pick(SAMPLE_BEAN_NOTES, ctx.newId),
    tags: [],
    startTime: shiftIso(shot.startTime, ctx.timeShiftMs),
    roastDate: shiftIso(shot.roastDate, ctx.timeShiftMs),
  }
}

export function anonymizeAnalysis(a: AnalysisResponse, newShotId: string, timeShiftMs: number): AnalysisResponse {
  return {
    ...a,
    id: `demo-analysis-${newShotId}`,
    shotId: newShotId,
    contextSummary: null,
    createdAt: shiftIso(a.createdAt, timeShiftMs),
    cachedAt: a.cachedAt ? shiftIso(a.cachedAt, timeShiftMs) : undefined,
  }
}
