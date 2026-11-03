// The storyboard: stations 1–8 of the spec as auto-advancing steps (intro/outro are cards in the runner).
import type { DemoDataset, DemoShot } from '../data/types.js'
import type { Step } from '../engine/types.js'
import type { TourLang } from '../lang.js'

/** Station prefixes in storyboard order; every step id starts with one of them. */
export const STATIONS = ['de1', 'list', 'filter', 'detail', 'compare', 'ai', 'stats', 'settings'] as const

/** Pause after each step so the result of the action stays visible. */
export const DEFAULT_HOLD_MS = 2000

const tour = (id: string) => `[data-tour="${id}"]`
const shot = (id: string) => `[data-shot-id="${id}"]`

export interface Featured {
  /** Shot whose stored analysis is shown in station 6; also opened in station 4. */
  analysisId: string
  /** Second shot for the comparison. */
  partnerId: string
  /** Shot scrolled to in the list station. */
  scrollId: string
  roaster: string | null
  searchTerm: string | null
  beverage: string | null
}

export function pickFeatured(ds: DemoDataset, lang: TourLang): Featured {
  const byTime = [...ds.shots].sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
  const candidates = Object.keys(ds.analyses).filter((id) => ds.shots.some((s) => s.id === id) && !ds.importBatchIds.includes(id))
  const analysisId = candidates.find((id) => ds.analysisLang?.[id] === lang) ?? candidates[0] ?? byTime[0].id
  const main = ds.shots.find((s) => s.id === analysisId) as DemoShot
  const others = byTime.filter((s) => s.id !== analysisId)
  const partner = others.find((s) => s.beanBrand === main.beanBrand) ?? others[0]
  return {
    analysisId,
    partnerId: partner.id,
    scrollId: byTime[Math.min(6, byTime.length - 1)].id,
    roaster: main.beanBrand,
    searchTerm: main.beanType?.split(/\s+/)[0] ?? null,
    beverage: main.beverageType || null,
  }
}

export function buildSteps(ds: DemoDataset, lang: TourLang): { steps: Step[]; actionEstimateMs: Record<string, number>; featured: Featured } {
  const f = pickFeatured(ds, lang)
  const detail = `/shots/${f.analysisId}`
  const compare = `/compare?a=${f.analysisId}&b=${f.partnerId}`

  const steps: Step[] = [
    // 1 — Pull from the DE1
    { id: 'de1-settings', route: '/settings', target: tour('settings-tab-daten'), action: (c) => c.click(tour('settings-tab-daten')) },
    { id: 'de1-connect', target: tour('de1-connect'), action: async (c) => { await c.click(tour('de1-connect')); await c.wait(1200) } },
    { id: 'de1-preview', target: tour('de1-preview'), action: async (c) => { await c.click(tour('de1-preview')); await c.wait(600) } },
    {
      id: 'de1-import', target: tour('de1-import'), holdMs: 1500,
      action: async (c) => { await c.click(tour('de1-import')); await c.wait(ds.importBatchIds.length * 350 + 800) },
    },
    // 2 — Shot list
    { id: 'list', route: '/', target: tour('shot-card') },
    { id: 'list-history', target: shot(f.scrollId), action: async (c) => { await c.scrollTo(shot(f.scrollId)); await c.wait(1500); await c.scrollTo(tour('search')) } },
    // 3 — Filters
    ...(f.roaster ? [{ id: 'filter-roaster', target: tour('filter-roaster'), action: (c) => c.select(tour('filter-roaster'), f.roaster!) } satisfies Step] : []),
    ...(f.searchTerm ? [{ id: 'filter-search', target: tour('search'), action: (c) => c.type(tour('search'), f.searchTerm!) } satisfies Step] : []),
    ...(f.beverage ? [{ id: 'filter-beverage', target: tour('filter-beverage'), action: (c) => c.select(tour('filter-beverage'), f.beverage!) } satisfies Step] : []),
    // 4 — Shot detail
    { id: 'detail-open', target: shot(f.analysisId), action: async (c) => { await c.click(shot(f.analysisId)); await c.wait(800) } },
    {
      id: 'detail-curves', route: detail, target: tour('shot-chart'),
      action: async (c) => { await c.hover(tour('shot-chart'), 0.25, 0.55); await c.wait(1200); await c.hover(tour('shot-chart'), 0.6, 0.55); await c.wait(1200); await c.hover(tour('shot-chart'), 0.85, 0.55) },
    },
    { id: 'detail-values', route: detail, target: tour('shot-values') },
    // 5 — Compare
    { id: 'compare-start', route: detail, target: tour('compare'), action: async (c) => { await c.click(tour('compare')); await c.wait(800) } },
    { id: 'compare-pick', target: shot(f.partnerId), action: async (c) => { await c.click(shot(f.partnerId)); await c.wait(800) } },
    {
      id: 'compare-overlaid', route: compare, target: tour('compare-chart'),
      action: async (c) => { await c.click(tour('compare-mode-overlaid')); await c.hover(tour('compare-chart'), 0.45, 0.6); await c.wait(1500); await c.hover(tour('compare-chart'), 0.75, 0.6) },
    },
    { id: 'compare-split', route: compare, target: tour('compare-mode-split'), action: (c) => c.click(tour('compare-mode-split')), holdMs: 1500 },
    // 6 — AI analysis
    { id: 'ai-start', route: detail, target: tour('analyze'), placement: 'above', action: async (c) => { await c.click(tour('analyze')); await c.wait(2800) } },
    { id: 'ai-barista', target: tour('analysis-tab-barista'), placement: 'above', action: (c) => c.click(tour('analysis-tab-barista')) },
    { id: 'ai-roaster', target: tour('analysis-tab-roaster'), placement: 'above', action: (c) => c.click(tour('analysis-tab-roaster')) },
    { id: 'ai-cost', target: tour('analysis-details'), action: (c) => c.click(tour('analysis-details')) },
    // 7 — Statistics
    { id: 'stats-kpi', route: '/stats', target: tour('stats-tab-dashboard') },
    { id: 'stats-period', target: tour('stats-period-30d'), action: (c) => c.click(tour('stats-period-30d')) },
    { id: 'stats-roasters', target: tour('stats-tab-roasters'), action: (c) => c.click(tour('stats-tab-roasters')) },
    // 8 — Settings
    {
      id: 'settings-tabs', route: '/settings', target: tour('settings-tab-ki'),
      action: async (c) => { await c.click(tour('settings-tab-ansicht')); await c.wait(1000); await c.click(tour('settings-tab-sicherheit')); await c.wait(1000); await c.click(tour('settings-tab-ki')) },
    },
    {
      id: 'settings-theme', target: tour('theme-toggle'),
      // Ends on the data tab so the export button is visible for the next step.
      action: async (c) => { await c.click(tour('theme-toggle')); await c.wait(2000); await c.click(tour('theme-toggle')); await c.wait(800); await c.click(tour('settings-tab-daten')) },
    },
    {
      id: 'settings-export', route: '/settings', target: tour('export'),
      action: async (c) => { await c.click(tour('export')); await c.wait(1500) },
    },
  ]

  // Let the result of each action stay on screen for a moment.
  for (const s of steps) s.holdMs ??= DEFAULT_HOLD_MS

  // Rough upper bounds for the time actions need (cursor travel ~1 s per move/click).
  const actionEstimateMs: Record<string, number> = {
    'de1-connect': 3500, 'de1-import': 2000 + ds.importBatchIds.length * 350 + 800,
    'list-history': 5500, 'filter-search': 2500, 'detail-curves': 6500, 'compare-overlaid': 6000,
    'ai-start': 4500, 'settings-tabs': 6000, 'settings-theme': 5000, 'settings-export': 4500,
  }
  return { steps, actionEstimateMs, featured: f }
}
