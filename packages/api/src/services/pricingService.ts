// packages/api/src/services/pricingService.ts

export interface ModelPricing {
  inputPerToken: number   // USD per token
  outputPerToken: number  // USD per token
}

interface PricingCache {
  data: Map<string, ModelPricing>
  fetchedAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const MODEL_TO_OPENROUTER: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4-5',
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4-6',
  'claude-opus-4-8': 'anthropic/claude-opus-4.8',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4o': 'openai/gpt-4o',
}

// Hardcoded fallback pricing (USD per token), valid as of 2026-06-04
const FALLBACK_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': { inputPerToken: 0.00000025, outputPerToken: 0.00000125 },
  'claude-sonnet-4-6':         { inputPerToken: 0.000003,   outputPerToken: 0.000015   },
  'claude-opus-4-8':           { inputPerToken: 0.000005,   outputPerToken: 0.000025   },
  'gpt-4o-mini':               { inputPerToken: 0.00000015, outputPerToken: 0.0000006  },
  'gpt-4o':                    { inputPerToken: 0.0000025,  outputPerToken: 0.000010   },
}

let cache: PricingCache | null = null

async function fetchFromOpenRouter(): Promise<Map<string, ModelPricing> | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const json = await response.json() as {
      data: Array<{ id: string; pricing: { prompt: string; completion: string } }>
    }
    const result = new Map<string, ModelPricing>()
    for (const model of json.data ?? []) {
      const input = parseFloat(model.pricing?.prompt ?? '')
      const output = parseFloat(model.pricing?.completion ?? '')
      if (!isNaN(input) && !isNaN(output)) {
        result.set(model.id, { inputPerToken: input, outputPerToken: output })
      }
    }
    return result
  } catch {
    return null
  }
}

export async function getModelPricing(modelName: string): Promise<ModelPricing | null> {
  const now = Date.now()
  const cacheExpired = !cache || (now - cache.fetchedAt) > CACHE_TTL_MS

  if (cacheExpired) {
    const fresh = await fetchFromOpenRouter()
    if (fresh) {
      cache = { data: fresh, fetchedAt: now }
    } else if (!cache) {
      return FALLBACK_PRICING[modelName] ?? null
    } else {
      cache = { data: cache.data, fetchedAt: now }
    }
  }

  const openRouterId = MODEL_TO_OPENROUTER[modelName] ?? modelName
  const fromCache = cache?.data.get(openRouterId)
  if (fromCache) return fromCache

  return FALLBACK_PRICING[modelName] ?? null
}
