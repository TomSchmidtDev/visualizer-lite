import { describe, it, expect } from 'vitest'
import { parseDecaidShot } from '../../src/parsers/decaid.js'

function sampleShot(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'ae7ae4ac-fad3-443e-a244-0316d47faea0',
    timestamp: '2026-09-05T10:28:22.214776',
    measurements: [
      {
        machine: { timestamp: '2026-09-05T10:28:22.214776', flow: 0.04, pressure: 0.0, targetFlow: 2.0, targetPressure: 0.0, mixTemperature: 82.9, groupTemperature: 84.9 },
        scale: null,
        volume: 0.0,
      },
      {
        machine: { timestamp: '2026-09-05T10:28:23.214776', flow: 3.0, pressure: 2.1, targetFlow: 3.0, targetPressure: 2.0, mixTemperature: 84.5, groupTemperature: 85.0 },
        scale: { timestamp: '2026-09-05T10:28:23.300000', weight: 5.5, weightFlow: 1.2 },
        volume: 3.0,
      },
      {
        machine: { timestamp: '2026-09-05T10:28:52.214776', flow: 1.5, pressure: 3.3, targetFlow: 1.5, targetPressure: 3.0, mixTemperature: 84.6, groupTemperature: 85.1 },
        scale: { timestamp: '2026-09-05T10:28:52.300000', weight: 42.0, weightFlow: 1.5 },
        volume: 40.0,
      },
    ],
    workflow: {
      profile: {
        version: '2',
        title: 'Blooming Espresso',
        beverage_type: 'espresso',
        steps: [
          { name: 'preinfusion', pump: 'flow', transition: 'fast' },
          { name: 'shot', pump: 'pressure', transition: 'fast' },
        ],
      },
      context: {
        targetDoseWeight: 18.0,
        targetYield: 42.0,
        grinderModel: 'Timemore Sculptor 078S',
        grinderSetting: '2',
        coffeeName: 'Ethiopia Guji Hambela',
        coffeeRoaster: 'Gardelli',
        baristaName: 'Schmidt',
      },
    },
    annotations: {
      actualDoseWeight: 18.2,
      actualYield: 42.0,
      enjoyment: 8,
      espressoNotes: 'Bright and sweet',
    },
    stopReason: 'targetWeight',
    ...overrides,
  })
}

describe('parseDecaidShot', () => {
  it('parses scalar metadata fields', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.profileTitle).toBe('Blooming Espresso')
    expect(result.beverageType).toBe('espresso')
    expect(result.grinderModel).toBe('Timemore Sculptor 078S')
    expect(result.grinderSetting).toBe('2')
    expect(result.espressoNotes).toBe('Bright and sweet')
    expect(result.espressoEnjoyment).toBe(8)
    expect(result.barista).toBe('Schmidt')
    expect(result.beanBrand).toBe('Gardelli')
    expect(result.beanType).toBe('Ethiopia Guji Hambela')
    expect(result.roastDate).toBeNull()
  })

  it('falls back to context.finalBeverageType when the profile has none', () => {
    const shot = JSON.parse(sampleShot())
    delete shot.workflow.profile.beverage_type
    shot.workflow.context.finalBeverageType = 'filter'
    const result = parseDecaidShot(JSON.stringify(shot))
    expect(result.beverageType).toBe('filter')
  })

  it('returns null bean/barista fields when the workflow context omits them', () => {
    const result = parseDecaidShot(sampleShot({
      workflow: { profile: { title: 'x', steps: [] }, context: { targetDoseWeight: 18, targetYield: 36 } },
    }))
    expect(result.beanBrand).toBeNull()
    expect(result.beanType).toBeNull()
    expect(result.barista).toBeNull()
  })

  it('prefers actual dose/yield annotations over the workflow context targets', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.beanWeight).toBe(18.2)
    expect(result.drinkWeight).toBe(42.0)
  })

  it('falls back to workflow context targets when annotations are absent', () => {
    const result = parseDecaidShot(sampleShot({ annotations: {} }))
    expect(result.beanWeight).toBe(18.0)
    expect(result.drinkWeight).toBe(42.0)
  })

  it('derives elapsed seconds from measurement timestamps', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.shotData.timeframe).toEqual([0, 1, 30])
  })

  it('computes duration from the last elapsed value', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.duration).toBe(30)
  })

  it('parses clock from the top-level timestamp as epoch seconds', () => {
    const result = parseDecaidShot(sampleShot())
    const expected = Math.floor(Date.parse('2026-09-05T10:28:22.214Z') / 1000)
    expect(result.clock).toBe(expected)
  })

  it('parses machine channels aligned with the timeframe', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.shotData.espresso_pressure).toEqual([0.0, 2.1, 3.3])
    expect(result.shotData.espresso_flow).toEqual([0.04, 3.0, 1.5])
    expect(result.shotData.espresso_pressure_goal).toEqual([0.0, 2.0, 3.0])
    expect(result.shotData.espresso_temperature_mix).toEqual([82.9, 84.5, 84.6])
    expect(result.shotData.espresso_temperature_basket).toEqual([84.9, 85.0, 85.1])
  })

  it('forward-fills weight from the null-scale sample and omits it entirely when no sample ever has a scale', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.shotData.espresso_weight).toEqual([0, 5.5, 42.0])

    const noScale = parseDecaidShot(sampleShot({
      measurements: [
        { machine: { timestamp: '2026-09-05T10:28:22.214776', flow: 0, pressure: 0 }, scale: null, volume: 0 },
      ],
    }))
    expect(noScale.shotData.espresso_weight).toBeUndefined()
  })

  it('forward-fills scale.weightFlow as espresso_flow_weight — a default-on chart channel, not derived locally', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.shotData.espresso_flow_weight).toEqual([0, 1.2, 1.5])

    const noScale = parseDecaidShot(sampleShot({
      measurements: [
        { machine: { timestamp: '2026-09-05T10:28:22.214776', flow: 0, pressure: 0 }, scale: null, volume: 0 },
      ],
    }))
    expect(noScale.shotData.espresso_flow_weight).toBeUndefined()
  })

  it('carries forward volume as espresso_water_dispensed', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.shotData.espresso_water_dispensed).toEqual([0.0, 3.0, 40.0])
  })

  it('extracts profile steps from workflow.profile.steps', () => {
    const result = parseDecaidShot(sampleShot())
    expect(result.shotData.profileSteps).toHaveLength(2)
    expect(result.shotData.profileSteps![0].name).toBe('preinfusion')
  })

  it('handles a shot with no measurements', () => {
    const result = parseDecaidShot(sampleShot({ measurements: [] }))
    expect(result.shotData.timeframe).toEqual([])
    expect(result.duration).toBeNull()
  })
})
