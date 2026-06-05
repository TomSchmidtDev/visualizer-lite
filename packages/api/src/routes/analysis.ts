// packages/api/src/routes/analysis.ts
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'
import { analyzeShot, normalizeAnalysisArray } from '../services/analysisService.js'

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
  }>('/shot/:id', auth, async (request, reply) => {
    try {
      const shotId = request.params.id

      // Validate shotId
      if (!shotId || shotId.trim() === '') {
        return reply.status(400).send({
          error: 'Shot ID is required',
        })
      }

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
            barista: normalizeAnalysisArray(JSON.parse(cached.barista)),
            roaster: normalizeAnalysisArray(JSON.parse(cached.roaster)),
            analyst: JSON.parse(cached.analyst),
            tokenInputCount: cached.tokenInputCount,
            tokenOutputCount: cached.tokenOutputCount,
            costInputUsd: cached.costInputUsd,
            costOutputUsd: cached.costOutputUsd,
            analysisMode: cached.analysisMode,
            preprocessDurationMs: cached.preprocessDurationMs,
            aiDurationMs: cached.aiDurationMs,
            createdAt: cached.createdAt,
            cachedAt: cached.createdAt,
            contextSummary: cached.contextSummary ? JSON.parse(cached.contextSummary) : null,
          })
        }
      }

      // Get user API keys, selected model, and language from settings
      const [claudeKeyRow, openaiKeyRow, selectedModelRow, languageRow, customContextRow, analysisModeRow, contextWindowRow, tier1MinRow, minContextRow] = await Promise.all([
        prisma.settings.findUnique({ where: { key: 'apiKeyClaudeKey' } }),
        prisma.settings.findUnique({ where: { key: 'apiKeyOpenaiKey' } }),
        prisma.settings.findUnique({ where: { key: 'aiModel' } }),
        prisma.settings.findUnique({ where: { key: 'language' } }),
        prisma.settings.findUnique({ where: { key: 'aiCustomContext' } }),
        prisma.settings.findUnique({ where: { key: 'aiAnalysisMode' } }),
        prisma.settings.findUnique({ where: { key: 'aiContextWindow' } }),
        prisma.settings.findUnique({ where: { key: 'aiContextTier1Min' } }),
        prisma.settings.findUnique({ where: { key: 'aiContextMinShots' } }),
      ])

      const claudeKey = claudeKeyRow?.value || ''
      const openaiKey = openaiKeyRow?.value || ''
      const selectedModel = selectedModelRow?.value || 'claude-haiku-4-5-20251001'

      // Determine provider from model name
      const provider = selectedModel.startsWith('gpt') ? 'openai' : 'claude'
      const apiKey = provider === 'claude' ? claudeKey : openaiKey

      if (!apiKey) {
        return reply.status(400).send({
          error: provider === 'claude'
            ? 'No Claude API key configured. Please set it in Settings.'
            : 'No OpenAI API key configured. Please set it in Settings.',
        })
      }

      // Determine language: explicit 'de'/'en' wins; 'auto' (or unset) falls back to Accept-Language header.
      // Parse Accept-Language properly: split by comma, check each locale tag prefix.
      const settingLang = languageRow?.value || 'auto'
      const language: string = settingLang === 'de'
        ? 'de'
        : settingLang === 'en'
          ? 'en'
          : (request.headers['accept-language'] || '')
              .split(',')
              .some(tag => tag.trim().split(/[;-]/)[0].trim().toLowerCase() === 'de')
            ? 'de' : 'en'
      const customContext = customContextRow?.value || ''
      const analysisMode = (analysisModeRow?.value === 'optimized' ? 'optimized' : 'standard') as 'standard' | 'optimized'
      const settingsWindow = (contextWindowRow?.value || '30d') as '7d' | '30d' | '90d' | 'all'
      const contextWindow = (request.query.window || settingsWindow) as '7d' | '30d' | '90d' | 'all'
      const tier1MinShots = parseInt(tier1MinRow?.value || '10', 10) || 10
      const minContextShots = parseInt(minContextRow?.value || '2', 10) || 2

      // Call analyzeShot service with the specific model name and language
      const result = await analyzeShot(shotId, apiKey, provider, analysisType, contextWindow, selectedModel, language, customContext, analysisMode, tier1MinShots, minContextShots)

      const aiModel = selectedModel

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
          costInputUsd: result.costInputUsd,
          costOutputUsd: result.costOutputUsd,
          analysisMode: result.analysisMode,
          preprocessDurationMs: result.preprocessDurationMs,
          aiDurationMs: result.aiDurationMs,
          contextSummary: JSON.stringify(result.contextSummary),
        },
        update: {
          analysisType,
          aiModel,
          barista: JSON.stringify(result.barista),
          roaster: JSON.stringify(result.roaster),
          analyst: JSON.stringify(result.analyst),
          tokenInputCount: result.tokenInputCount,
          tokenOutputCount: result.tokenOutputCount,
          costInputUsd: result.costInputUsd,
          costOutputUsd: result.costOutputUsd,
          analysisMode: result.analysisMode,
          preprocessDurationMs: result.preprocessDurationMs,
          aiDurationMs: result.aiDurationMs,
          contextSummary: JSON.stringify(result.contextSummary),
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
        costInputUsd: analysis.costInputUsd,
        costOutputUsd: analysis.costOutputUsd,
        analysisMode: analysis.analysisMode,
        preprocessDurationMs: analysis.preprocessDurationMs,
        aiDurationMs: analysis.aiDurationMs,
        createdAt: analysis.createdAt,
        contextSummary: result.contextSummary,
      })
    } catch (error) {
      const getErrorMessage = (err: unknown): string => {
        if (err instanceof Error) {
          // Shot not found
          if (err.message === 'Shot not found') {
            return 'The requested shot was not found'
          }
          // API key issues
          if (err.message.includes('API key') || err.message.includes('authentication')) {
            return 'API key error. Please check your settings and try again'
          }
          // Rate limit or quota
          if (err.message.includes('rate limit') || err.message.includes('quota')) {
            return 'API rate limit reached. Please try again later'
          }
          // JSON parsing or validation
          if (err.message.includes('JSON') || err.message.includes('parsing')) {
            return 'Failed to parse analysis response. Please regenerate'
          }
          return err.message
        }
        return 'An unexpected error occurred'
      }

      const errorMessage = getErrorMessage(error)
      console.error('[analysis] Error:', error)

      // Determine appropriate status code
      const statusCode = error instanceof Error && error.message === 'Shot not found' ? 404 : 500

      return reply.status(statusCode).send({
        error: errorMessage,
      })
    }
  })
}

export default analysisRoutes
