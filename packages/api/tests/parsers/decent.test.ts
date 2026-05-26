import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseDecentShot } from '../../src/parsers/decent.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sampleShot   = readFileSync(join(__dirname, '../fixtures/sample.shot'),    'utf8')
const sampleShotV2 = readFileSync(join(__dirname, '../fixtures/sample-v2.shot'), 'utf8')

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

describe('parseDecentShot – JSON v2 format', () => {
  it('detects and parses JSON format', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.clock).toBe(1779817679)
  })

  it('parses timeframe from elapsed array', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.shotData.timeframe.length).toBeGreaterThan(0)
    expect(result.shotData.timeframe[0]).toBe(0.001)
  })

  it('parses pressure channel', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.shotData.espresso_pressure).toBeDefined()
    expect(result.shotData.espresso_pressure![0]).toBe(0.0)
  })

  it('parses flow channel', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.shotData.espresso_flow).toBeDefined()
    expect(result.shotData.espresso_flow!.length).toBeGreaterThan(0)
  })

  it('parses temperature channels', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.shotData.espresso_temperature_basket).toBeDefined()
    expect(result.shotData.espresso_temperature_mix).toBeDefined()
  })

  it('parses weight from totals', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.shotData.espresso_weight).toBeDefined()
    expect(result.shotData.espresso_weight!.length).toBeGreaterThan(0)
  })

  it('includes extra v2 channels (resistance, flow_weight_raw)', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.shotData['espresso_resistance']).toBeDefined()
    expect(result.shotData['espresso_flow_weight_raw']).toBeDefined()
  })

  it('computes duration from last elapsed value', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.duration).toBeGreaterThan(0)
  })

  it('parses nested metadata (profile, meta.bean, meta.grinder)', () => {
    const result = parseDecentShot(sampleShotV2)
    expect(result.profileTitle).toBe('Londonium')
    expect(result.beanBrand).toBe('A Matter of Concrete')
    expect(result.beanType).toBe('Egypr')
    expect(result.beanWeight).toBe(15)
    expect(result.drinkWeight).toBe(32.0)
    expect(result.grinderModel).toBe('Timemore Sculptor 078S')
    expect(result.grinderSetting).toBe('11.5')
  })
})
