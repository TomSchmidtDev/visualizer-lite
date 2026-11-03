import { describe, it, expect } from 'vitest'
import { selectSpread } from './export-demo-data.js'

const day = 86_400_000
const rows = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, startTime: 1_000 * day - i * day, beverageType: i % 10 === 5 ? 'cleaning' : 'espresso' }))

describe('selectSpread', () => {
  it('picks count rows evenly across the list, newest first, skipping cleaning shots', () => {
    const picked = selectSpread(rows, 10)
    expect(picked).toHaveLength(10)
    expect(picked.every((r) => r.beverageType !== 'cleaning')).toBe(true)
    expect(picked[0].id).toBe('s0')
    const gaps = picked.slice(1).map((r, i) => Number(picked[i].startTime) - Number(r.startTime))
    expect(Math.max(...gaps) / day).toBeLessThanOrEqual(13)
  })

  it('returns all eligible rows when there are fewer than count', () => {
    expect(selectSpread(rows.slice(0, 7), 20)).toHaveLength(6)
  })
})
