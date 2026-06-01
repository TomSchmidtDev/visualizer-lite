// packages/api/src/routes/analysis.ts
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'
import { analyzeShot } from '../services/analysisService.js'

const analysisRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { preHandler: [(fastify as any).requireAuth] }

  // POST /api/analysis/shot/:id
  fastify.post<{
    Params: { id: string }
    Querystring: {
      window?: '7d' | '30d' | '90d' | 'all'
      type?: 'detail' | 'stats'
      regenerate?: 'true' | 'false'
    }
  }>('/:id', auth, async (request, reply) => {
    try {
      const shotId = request.params.id
      const window = (request.query.window || '30d') as '7d' | '30d' | '90d' | 'all'
      const analysisType = (request.query.type || 'detail') as 'detail' | 'stats'
      const regenerate = request.query.regenerate === 'true'

      // Check cache first (unless regenerate=true)
      if (!regenerate) {
        const cached = await prisma.shotAnalysis.findUnique({
          where: { shotId },
        })
        if (cached) {
          return reply.send({
            id: cached.id,
            shotId: cached.shotId,
            analysisType: cached.analysisType,
            aiModel: cached.aiModel,
            barista: JSON.parse(cached.barista),
            roaster: JSON.parse(cached.roaster),
            analyst: JSON.parse(cached.analyst),
            tokenInputCount: cached.tokenInputCount,
            tokenOutputCount: cached.tokenOutputCount,
            createdAt: cached.createdAt,
            cachedAt: cached.createdAt,
          })
        }
      }

      // Get user API keys from settings
      const claudeKeyRow = await prisma.settings.findUnique({
        where: { key: 'claudeApiKey' },
      })
      const openaiKeyRow = await prisma.settings.findUnique({
        where: { key: 'openaiApiKey' },
      })

      const claudeKey = claudeKeyRow?.value
      const openaiKey = openaiKeyRow?.value

      // Check that at least one key exists
      if (!claudeKey && !openaiKey) {
        return reply.status(400).send({
          error: 'No API keys configured. Please set Claude or OpenAI API key in Settings.',
        })
      }

      // Determine which model to use (prefer Claude if both exist)
      const model = claudeKey ? 'claude' : 'openai'
      const apiKey = (claudeKey || openaiKey) as string

      // Call analyzeShot service
      const result = await analyzeShot(shotId, apiKey, model, analysisType, window)

      // Determine AI model name based on provider
      const aiModel = model === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4-turbo'

      // Upsert into shot_analyses table
      const analysis = await prisma.shotAnalysis.upsert({
        where: { shotId },
        create: {
          shotId,
          analysisType,
          aiModel,
          barista: JSON.stringify(result.barista),
          roaster: JSON.stringify(result.roaster),
          analyst: JSON.stringify(result.analyst),
          tokenInputCount: result.tokenInputCount,
          tokenOutputCount: result.tokenOutputCount,
        },
        update: {
          analysisType,
          aiModel,
          barista: JSON.stringify(result.barista),
          roaster: JSON.stringify(result.roaster),
          analyst: JSON.stringify(result.analyst),
          tokenInputCount: result.tokenInputCount,
          tokenOutputCount: result.tokenOutputCount,
        },
      })

      return reply.send({
        id: analysis.id,
        shotId: analysis.shotId,
        analysisType: analysis.analysisType,
        aiModel: analysis.aiModel,
        barista: result.barista,
        roaster: result.roaster,
        analyst: result.analyst,
        tokenInputCount: analysis.tokenInputCount,
        tokenOutputCount: analysis.tokenOutputCount,
        createdAt: analysis.createdAt,
      })
    } catch (error) {
      // Shot not found
      if (error instanceof Error && error.message === 'Shot not found') {
        return reply.status(404).send({ error: 'Shot not found' })
      }

      // API call failed or JSON parsing failed
      console.error('[analysis] Error:', error)
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Internal server error',
      })
    }
  })
}

export default analysisRoutes
