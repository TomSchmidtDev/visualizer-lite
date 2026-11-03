import { describe, it, expect } from 'vitest'
import { createStore } from './store.js'
import { makeDataset, makeShot } from './fixtures.test-helpers.js'

describe('createStore', () => {
  it('starts without the import batch', () => {
    const ds = makeDataset(12, 3)
    const s = createStore(ds)
    expect(s.list({}).total).toBe(9)
    expect(s.pendingImport().map((x) => x.id)).toEqual(ds.importBatchIds)
  })

  it('sorts newest first and omits shotData but includes a sparkline', () => {
    const s = createStore(makeDataset(12, 3))
    const { shots } = s.list({})
    expect(Date.parse(shots[0].startTime)).toBeGreaterThan(Date.parse(shots[1].startTime))
    expect('shotData' in shots[0]).toBe(false)
    expect(shots[0].sparkline?.pressure?.length).toBe(60)
  })

  it('filters by roaster with case-insensitive contains', () => {
    const s = createStore(makeDataset(12, 0))
    const r = s.list({ beanBrand: 'demo roast' })
    expect(r.total).toBe(4)
    expect(r.shots.every((x) => x.beanBrand === 'Demo Roastery')).toBe(true)
  })

  it('returns total 0 and no shots when combined filters match nothing', () => {
    const s = createStore(makeDataset(12, 0))
    const r = s.list({ beanBrand: 'Demo Roastery', beanType: 'Kenya' })
    expect(r).toMatchObject({ total: 0, shots: [], avgRatio: null })
  })

  it('beverageType unknown matches null and empty', () => {
    const ds = makeDataset(3, 0)
    ds.shots[0].beverageType = null
    ds.shots[1].beverageType = ''
    expect(createStore(ds).list({ beverageType: 'unknown' }).total).toBe(2)
  })

  it('q matches word prefixes across fields', () => {
    const s = createStore(makeDataset(12, 0))
    expect(s.list({ q: 'ethio' }).total).toBe(4)
    expect(s.list({ q: 'samp kiam' }).total).toBe(4)
    expect(s.list({ q: 'thiopia' }).total).toBe(0)
  })

  it('filters by date range inclusively', () => {
    const ds = makeDataset(5, 0)
    const r = createStore(ds).list({ dateFrom: ds.shots[2].startTime, dateTo: ds.shots[1].startTime })
    expect(r.total).toBe(2)
  })

  it('paginates and clamps limit', () => {
    const s = createStore(makeDataset(30, 0))
    expect(s.list({ page: 2, limit: 10 }).shots).toHaveLength(10)
    expect(s.list({ page: 1, limit: 500 }).limit).toBe(100)
    expect(s.list({}).limit).toBe(20)
  })

  it('avgRatio is the mean ratio rounded to 2 dp', () => {
    const ds = { ...makeDataset(1, 0) }
    ds.shots = [makeShot({ beanWeight: 18, drinkWeight: 36 }), makeShot({ beanWeight: 18, drinkWeight: 40 })]
    expect(createStore(ds).list({}).avgRatio).toBe(2.11)
  })

  it('importOne adds a shot once, then reports skipped', () => {
    const ds = makeDataset(12, 3)
    const s = createStore(ds)
    expect(s.importOne(ds.importBatchIds[0])).toBe('imported')
    expect(s.importOne(ds.importBatchIds[0])).toBe('skipped')
    expect(s.list({}).total).toBe(10)
    expect(s.pendingImport()).toHaveLength(2)
  })

  it('remove hides the shot; update patches it', () => {
    const ds = makeDataset(5, 0)
    const s = createStore(ds)
    const id = ds.shots[0].id
    expect(s.update(id, { espressoNotes: 'nice' })?.espressoNotes).toBe('nice')
    expect(s.remove(id)).toBe(true)
    expect(s.get(id)).toBeUndefined()
    expect(s.list({}).total).toBe(4)
  })

  it('suggestions reflect visible shots and map empty beverage to unknown', () => {
    const ds = makeDataset(6, 0)
    ds.shots[0].beverageType = null
    const sug = createStore(ds).suggestions()
    expect(sug.beanBrands).toEqual(['Demo Roastery', 'Sample Coffee Co', 'Test Beans'])
    expect(sug.beverageTypes).toEqual(['espresso', 'filter', 'unknown'])
  })

  it('analysis returns stored analyses only', () => {
    const ds = makeDataset(6, 1)
    const s = createStore(ds)
    const id = Object.keys(ds.analyses)[0]
    expect(s.analysis(id)?.shotId).toBe(id)
    expect(s.analysis(ds.shots[5].id)).toBeUndefined()
  })
})
