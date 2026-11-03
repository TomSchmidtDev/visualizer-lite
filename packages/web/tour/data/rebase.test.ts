import { describe, it, expect } from 'vitest'
import { rebaseDataset } from './rebase.js'
import { makeDataset, makeShot } from '../mock/fixtures.test-helpers.js'

const now = new Date('2027-03-15T12:00:00.000Z')

describe('rebaseDataset', () => {
  const ds = makeDataset(5, 1)
  const r = rebaseDataset(ds, now)

  it('shifts so that exportedAt maps to now', () => {
    const gap = Date.parse(ds.exportedAt) - Date.parse(ds.shots[0].startTime)
    expect(now.getTime() - Date.parse(r.shots[0].startTime)).toBe(gap)
    expect(r.exportedAt).toBe(now.toISOString())
  })
  it('keeps relative spacing', () => {
    const before = Date.parse(ds.shots[0].startTime) - Date.parse(ds.shots[4].startTime)
    const after = Date.parse(r.shots[0].startTime) - Date.parse(r.shots[4].startTime)
    expect(after).toBe(before)
  })
  it('handles null roastDate', () => {
    const d2 = { ...ds, shots: [makeShot({ roastDate: null })] }
    expect(rebaseDataset(d2, now).shots[0].roastDate).toBeNull()
  })
  it('shifts analysis createdAt', () => {
    const id = Object.keys(ds.analyses)[0]
    const shift = now.getTime() - Date.parse(ds.exportedAt)
    expect(Date.parse(r.analyses[id].createdAt) - Date.parse(ds.analyses[id].createdAt)).toBe(shift)
  })
  it('does not mutate the input', () => expect(ds.exportedAt).not.toBe(now.toISOString()))
})
