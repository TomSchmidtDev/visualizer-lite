import { describe, it, expect } from 'vitest'
import { buildSteps, STATIONS } from './steps.js'
import { TourRunner } from '../engine/runner.js'
import { en } from '../i18n/en.js'
import { de } from '../i18n/de.js'
import { makeDataset } from '../mock/fixtures.test-helpers.js'
import demo from '../data/demo.json'
import type { DemoDataset } from '../data/types.js'

const DATA_TOUR_IDS = new Set([
  'nav-shots', 'nav-stats', 'nav-settings', 'theme-toggle', 'logout',
  'filter-roaster', 'filter-profile', 'filter-grinder', 'filter-beverage', 'search',
  'shot-card', 'download', 'compare', 'analyze', 'shot-chart', 'shot-values',
  'analysis-tab-barista', 'analysis-tab-roaster', 'analysis-details',
  'compare-mode-overlaid', 'compare-mode-split', 'compare-chart',
  'settings-tab-ansicht', 'settings-tab-daten', 'settings-tab-sicherheit', 'settings-tab-ki',
  'de1-url', 'de1-connect', 'de1-date-from', 'de1-date-to', 'de1-preview', 'de1-import', 'export', 'theme-light', 'theme-dark',
  'stats-tab-dashboard', 'stats-tab-roasters', 'stats-tab-profiles',
  ...['24h', '7d', '14d', '30d', '180d', '365d', '730d', '1095d', 'all'].map((p) => `stats-period-${p}`),
  ...['espresso', 'filter', 'all'].map((b) => `stats-beverage-${b}`),
])

const ds = makeDataset(24, 4)
const { steps, actionEstimateMs, featured } = buildSteps(ds, 'en')

describe('buildSteps', () => {
  it('every step has an EN and a DE caption', () => {
    for (const s of steps) {
      expect(en.captions[s.id], `en ${s.id}`).toBeDefined()
      expect(de.captions[s.id], `de ${s.id}`).toBeDefined()
    }
  })

  it('EN and DE caption keys are identical', () => {
    expect(Object.keys(de.captions).sort()).toEqual(Object.keys(en.captions).sort())
  })

  it('captions respect length limits', () => {
    for (const c of [...Object.values(en.captions), ...Object.values(de.captions)]) {
      expect(c.title.length, c.title).toBeLessThanOrEqual(40)
      expect(c.body.length, c.body).toBeLessThanOrEqual(160)
    }
  })

  it('every target is a known data-tour hook or a shot id', () => {
    for (const s of steps.filter((x) => x.target)) {
      const m = s.target!.match(/^\[data-tour="([^"]+)"\]$/)
      const ok = (m && DATA_TOUR_IDS.has(m[1])) || /^\[data-shot-id="[^"]+"\]$/.test(s.target!)
      expect(ok, `${s.id}: ${s.target}`).toBe(true)
    }
  })

  it('stations appear in storyboard order', () => {
    const order = steps.map((s) => STATIONS.findIndex((st) => s.id.startsWith(st)))
    expect(order.every((x) => x >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(new Set(order).size).toBe(STATIONS.length)
  })

  it('the featured shot has a stored analysis and is not in the import batch', () => {
    expect(ds.analyses[featured.analysisId]).toBeDefined()
    expect(ds.importBatchIds).not.toContain(featured.analysisId)
    expect(featured.partnerId).not.toBe(featured.analysisId)
  })

  it('prefers an analysis written in the tour language', () => {
    const d = makeDataset(24, 4)
    const [first] = Object.keys(d.analyses)
    const deId = d.shots[10].id
    d.analyses[deId] = { ...d.analyses[first], shotId: deId }
    d.analysisLang = { [first]: 'en', [deId]: 'de' }
    expect(buildSteps(d, 'de').featured.analysisId).toBe(deId)
    expect(buildSteps(d, 'en').featured.analysisId).toBe(first)
  })

  it('picks the newest analysed shot in the tour language', () => {
    const d = makeDataset(24, 4)
    const older = d.shots[12].id, newer = d.shots[8].id
    const a = Object.values(d.analyses)[0]
    d.analyses = { [older]: { ...a, shotId: older }, [newer]: { ...a, shotId: newer } }
    d.analysisLang = { [older]: 'de', [newer]: 'de' }
    expect(buildSteps(d, 'de').featured.analysisId).toBe(newer)
  })

  for (const [lang, strings] of [['en', en], ['de', de]] as const) {
    it(`estimated total (${lang}) is between 4 and 5 minutes`, () => {
      const runner = new TourRunner(steps, {
        createContext: () => { throw new Error('unused') },
        getText: (id) => strings.captions[id],
        onState: () => {},
        recordMode: true,
        getLocation: () => '/',
      })
      const total = runner.estimatedTotalMs(actionEstimateMs)
      expect(total).toBeGreaterThanOrEqual(240_000)
      expect(total).toBeLessThanOrEqual(300_000)
    })
  }

  it('works with the shipped demo dataset', () => {
    const real = buildSteps(demo as DemoDataset, 'en')
    expect((demo as DemoDataset).analyses[real.featured.analysisId]).toBeDefined()
  })
})
