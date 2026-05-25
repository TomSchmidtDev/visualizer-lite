// packages/api/src/config.ts
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

const DATA_DIR = process.env.DATA_DIR ?? '/data'
const FILES_DIR = join(DATA_DIR, 'files')

if (!existsSync(FILES_DIR)) {
  mkdirSync(FILES_DIR, { recursive: true })
}

export const config = {
  dataDir: DATA_DIR,
  filesDir: FILES_DIR,
  databaseUrl:
    process.env.DATABASE_URL ?? `file:${join(DATA_DIR, 'visualizer.db')}`,
  sessionSecret: requireEnv('VL_SESSION_SECRET'),
  initialUsername: process.env.VL_USERNAME ?? 'admin',
  initialPassword: process.env.VL_PASSWORD,
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  certPath: process.env.CERT_PATH ?? '/certs/fullchain.pem',
  keyPath: process.env.KEY_PATH ?? '/certs/privkey.pem',
  useTls: existsSync(process.env.CERT_PATH ?? '/certs/fullchain.pem'),
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = config.databaseUrl
}
