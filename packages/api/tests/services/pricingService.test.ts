import { describe, it, expect, vi, beforeEach } from 'vitest'

// Reset module between tests to clear the in-memory cache
beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('getModelPricing', () => {
  it('returns hardcoded fallback for known model when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const { getModelPricing } = await import('../../src/services/pricingService.js')
    const result = await getModelPricing('claude-haiku-4-5-20251001')
    expect(result).toEqual({
      inputPerToken: 0.00000025,
      outputPerToken: 0.00000125,
    })
  })

  it('returns null for unknown model when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const { getModelPricing } = await import('../../src/services/pricingService.js')
    const result = await getModelPricing('totally-unknown-model-xyz')
    expect(result).toBeNull()
  })

  it('returns OpenRouter pricing for known model on successful fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'anthropic/claude-haiku-4-5',
            pricing: { prompt: '0.00000020', completion: '0.00000100' },
          },
        ],
      }),
    }))
    const { getModelPricing } = await import('../../src/services/pricingService.js')
    const result = await getModelPricing('claude-haiku-4-5-20251001')
    expect(result).toEqual({
      inputPerToken: 0.00000020,
      outputPerToken: 0.00000100,
    })
  })

  it('falls back to hardcoded when OpenRouter returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const { getModelPricing } = await import('../../src/services/pricingService.js')
    const result = await getModelPricing('gpt-4o-mini')
    expect(result).toEqual({
      inputPerToken: 0.00000015,
      outputPerToken: 0.0000006,
    })
  })

  it('returns OpenRouter pricing for unknown-mapped model by direct ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'some-provider/some-model',
            pricing: { prompt: '0.000001', completion: '0.000002' },
          },
        ],
      }),
    }))
    const { getModelPricing } = await import('../../src/services/pricingService.js')
    const result = await getModelPricing('some-provider/some-model')
    expect(result).toEqual({
      inputPerToken: 0.000001,
      outputPerToken: 0.000002,
    })
  })
})
