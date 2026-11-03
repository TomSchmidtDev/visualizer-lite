import { describe, it, expect } from 'vitest'
import { anonymizeShot, anonymizeAnalysis, DEMO_BARISTA, SAMPLE_ESPRESSO_NOTES, SAMPLE_BEAN_NOTES } from './anonymize.js'
import { makeShot, makeAnalysis } from '../mock/fixtures.test-helpers.js'

const HOUR = 3_600_000
const ctx = { newId: 'new-id-1', timeShiftMs: 10 * 24 * HOUR + 1234567 }

describe('anonymizeShot', () => {
  const original = makeShot({
    barista: 'Real Person',
    privateNotes: 'my secret',
    espressoNotes: 'tasted like at grandma’s house',
    beanNotes: 'bought at the corner shop',
    tags: ['home', 'morning'],
  })
  const a = anonymizeShot(original, ctx)

  it('replaces barista', () => expect(a.barista).toBe(DEMO_BARISTA))
  it('drops privateNotes', () => expect(a.privateNotes).toBeNull())
  it('replaces non-null notes with a sample', () => {
    expect(SAMPLE_ESPRESSO_NOTES).toContain(a.espressoNotes)
    expect(SAMPLE_BEAN_NOTES).toContain(a.beanNotes)
  })
  it('keeps null notes null', () => {
    const b = anonymizeShot(makeShot({ espressoNotes: null, beanNotes: null }), ctx)
    expect(b.espressoNotes).toBeNull()
    expect(b.beanNotes).toBeNull()
  })
  it('drops tags', () => expect(a.tags).toEqual([]))
  it('assigns new id', () => expect(a.id).toBe('new-id-1'))
  it('shifts startTime and roastDate by timeShiftMs', () => {
    expect(Date.parse(a.startTime) - Date.parse(original.startTime)).toBe(ctx.timeShiftMs)
    expect(Date.parse(a.roastDate!) - Date.parse(original.roastDate!)).toBe(ctx.timeShiftMs)
  })
  it('keeps curves, weights, grinder, profile, scores, roaster and bean', () => {
    for (const k of ['shotData', 'beanWeight', 'drinkWeight', 'duration', 'grinderModel', 'grinderSetting',
      'profileTitle', 'espressoEnjoyment', 'beanBrand', 'beanType', 'roastLevel', 'beverageType'] as const) {
      expect(a[k]).toEqual(original[k])
    }
  })
  it('does not mutate the input', () => expect(original.barista).toBe('Real Person'))
})

describe('anonymizeAnalysis', () => {
  const original = makeAnalysis('old-shot', { contextSummary: { shotCount: 9, window: '30d', tier: 'profile', pressureAvg: 8, flowAvg: 2, tempAvg: 92 } })
  const a = anonymizeAnalysis(original, 'new-shot', ctx.timeShiftMs)

  it('drops contextSummary', () => expect(a.contextSummary).toBeNull())
  it('points to new shot id', () => expect(a.shotId).toBe('new-shot'))
  it('regenerates id', () => expect(a.id).not.toBe(original.id))
  it('keeps barista and roaster text', () => {
    expect(a.barista).toEqual(original.barista)
    expect(a.roaster).toEqual(original.roaster)
  })
  it('shifts createdAt', () => expect(Date.parse(a.createdAt) - Date.parse(original.createdAt)).toBe(ctx.timeShiftMs))
})
