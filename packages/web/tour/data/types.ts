// Shape of the demo dataset shipped with the tour (tour/data/demo.json).
import type { Shot, AnalysisResponse } from '../../src/types.js'

export type DemoShot = Shot & { shotData: NonNullable<Shot['shotData']> }

export interface DemoDataset {
  /** ISO timestamp; reference point for rebasing all dates to "now" at runtime. */
  exportedAt: string
  /** Sorted by startTime, newest first. */
  shots: DemoShot[]
  /** Shots that appear only after the simulated DE1 import. */
  importBatchIds: string[]
  /** Stored AI analyses, keyed by shot id. */
  analyses: Record<string, AnalysisResponse>
  /** Language each stored analysis was written in, keyed by shot id. */
  analysisLang?: Record<string, 'en' | 'de'>
}
