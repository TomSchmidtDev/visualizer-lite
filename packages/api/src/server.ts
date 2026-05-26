// packages/api/src/server.ts
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import cors from '@fastify/cors'
import { config } from './config.js'
import { enableWal } from './db.js'
import authPlugin, { seedInitialUser } from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import shotRoutes from './routes/shots.js'
import uploadRoutes from './routes/upload.js'
import searchRoutes from './routes/search.js'
import settingsRoutes from './routes/settings.js'
import statsRoutes from './routes/stats.js'
import exportRoutes from './routes/export.js'
import de1Routes      from './routes/de1.js'

export async function buildServer(httpsOpts?: { key: Buffer; cert: Buffer }) {
  const fastify = Fastify({
    logger: config.nodeEnv !== 'test',
    ...(httpsOpts ? { https: httpsOpts } : {}),
  })

  await fastify.register(cookie)
  await fastify.register(jwt, {
    secret: config.sessionSecret,
    cookie: { cookieName: 'token', signed: false },
  })
  await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })
  await fastify.register(cors, { origin: false })

  // Normalize non-standard multipart Content-Type sent by Decent Espresso plugin:
  // "multipart/form-data, charset=utf-8, boundary=..." → "multipart/form-data; boundary=..."
  fastify.addHook('preParsing', async (request) => {
    const ct = request.headers['content-type']
    if (ct?.startsWith('multipart/form-data') && ct.includes(',')) {
      const normalized = ct.replace(/,\s*/g, '; ')
      request.raw.headers['content-type'] = normalized
      ;(request.headers as any)['content-type'] = normalized
    }
  })

  await fastify.register(authPlugin)

  await fastify.register(authRoutes,     { prefix: '/api/auth' })
  await fastify.register(shotRoutes,     { prefix: '/api/shots' })
  await fastify.register(uploadRoutes,   { prefix: '/api' })       // /api/shots/upload
  await fastify.register(searchRoutes,   { prefix: '/api/search' })
  await fastify.register(settingsRoutes, { prefix: '/api/settings' })
  await fastify.register(statsRoutes,    { prefix: '/api/stats' })
  await fastify.register(exportRoutes,   { prefix: '/api/export' })
  await fastify.register(de1Routes,      { prefix: '/api/de1' })

  await enableWal()
  await seedInitialUser()

  return fastify
}
