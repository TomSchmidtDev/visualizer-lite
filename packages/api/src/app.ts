// packages/api/src/app.ts
import { readFileSync, existsSync } from 'fs'
import staticPlugin from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { buildServer } from './server.js'
import { startCertWatcher } from './certWatcher.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function start() {
  const httpsOpts = config.useTls
    ? { key: readFileSync(config.keyPath), cert: readFileSync(config.certPath) }
    : undefined

  const app = await buildServer(httpsOpts)

  // Serve built React SPA in production
  const webDist = join(__dirname, '../../../web/dist')
  if (existsSync(webDist)) {
    await app.register(staticPlugin, { root: webDist, prefix: '/', decorateReply: false })
    app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html', webDist))
  }

  startCertWatcher()

  await app.listen({ port: config.port, host: config.host })
  console.log(
    `[visualizer-lite] ${httpsOpts ? 'HTTPS' : 'HTTP'} on ${config.host}:${config.port}`
  )
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
