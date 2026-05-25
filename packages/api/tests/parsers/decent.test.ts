import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseDecentShot } from '../../src/parsers/decent.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sampleShot = readFileSync(join(__dirname, '../fixtures/sample.shot'), 'utf8')

describe('parseDecentShot', () => {
  it('parses scalar metadata fields', () => {
    const result = parseDecentShot(sampleShot)
    expect(result.beanBrand).toBe('Gardelli')
    expect(result.beanType).toBe('Ethiopia Guji Hambela')
    expect(result.beanWeight).toBe(18.0)
    expect(result.drinkWeight).toBe(36.2)
    expect(result.grinderModel).toBe('EK43s')
    expect(result.grinderSetting).toBe('2.8')
    expect(result.profileTitle).toBe('Blooming Espresso')
    expect(result.roastLevel).toBe('light')
    expect(result.barista).toBe('Schmidt')
  })

  it('parses clock as unix timestamp', () => {
    const result = parseDecentShot(sampleShot)
    expect(result.clock).toBe(1716624120)
  })

  it('parses timeframe array', () => {
    const result = parseDecentShot(sampleShot)
    expect(result.shotData.timeframe).toEqual([0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 25.0, 27.4])
  })

  it('parses pressure array', () => {
    const result = parseDecentShot(sampleShot)
    expect(result.shotData.espresso_pressure).toHaveLength(8)
    expect(result.shotData.espresso_pressure![0]).toBe(0.0)
    expect(result.shotData.espresso_pressure![4]).toBe(9.0)
  })

  it('computes duration from last timeframe value', () => {
    const result = parseDecentShot(sampleShot)
    expect(result.duration).toBe(27.4)
  })

  it('returns null for missing optional fields', () => {
    const result = parseDecentShot('clock 1716624120\nespresso_elapsed {1.0 2.0}')
    expect(result.beanBrand).toBeNull()
    expect(result.grinderModel).toBeNull()
    expect(result.barista).toBeNull()
  })

  it('handles set-prefixed Tcl syntax', () => {
    const content =
      'set bean_brand {TestRoaster}\nset clock 1716624120\nset espresso_elapsed {1.0}'
    const result = parseDecentShot(content)
    expect(result.beanBrand).toBe('TestRoaster')
  })

  it('includes all espresso_ channels in shotData', () => {
    const result = parseDecentShot(sampleShot)
    expect(result.shotData.espresso_flow).toBeDefined()
    expect(result.shotData.espresso_temperature_mix).toBeDefined()
    expect(result.shotData.espresso_state_change).toBeDefined()
  })
})
