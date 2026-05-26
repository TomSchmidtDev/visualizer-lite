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
  await fastify.register(authPlugin)

  await fastify.register(authRoutes,     { prefix: '/api/auth' })
  await fastify.register(shotRoutes,     { prefix: '/api/shots' })
  await fastify.register(uploadRoutes)                             // /shots/upload
  await fastify.register(searchRoutes,   { prefix: '/api/search' })
  await fastify.register(settingsRoutes, { prefix: '/api/settings' })
  await fastify.register(statsRoutes,    { prefix: '/api/stats' })
  await fastify.register(exportRoutes,   { prefix: '/api/export' })

  await enableWal()
  await seedInitialUser()

  return fastify
}
