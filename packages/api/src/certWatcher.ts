// packages/api/src/certWatcher.ts
import { watch } from 'chokidar'
import { existsSync } from 'fs'
import { config } from './config.js'

export function startCertWatcher(): void {
  if (!config.useTls || !existsSync(config.certPath)) return

  watch(config.certPath, {
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  }).on('change', () => {
    console.log('[cert-watcher] Certificate renewed — restarting to load new cert...')
    process.exit(0) // Docker restart policy handles restart
  })

  console.log(`[cert-watcher] Watching ${config.certPath}`)
}
