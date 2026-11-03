// Build-time constants shared by the app build (vite.config.ts) and the demo tour build (tour/vite.config.ts).
import { execFileSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
const gitHash = (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim() } catch { return '' }
})()

export const sharedDefine = {
  __APP_VERSION__: JSON.stringify(version),
  __BUILD_TIME__:  JSON.stringify(buildTime),
  __GIT_HASH__:    JSON.stringify(gitHash),
}
