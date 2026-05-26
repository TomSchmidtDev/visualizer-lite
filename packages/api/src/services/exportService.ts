// packages/api/src/services/exportService.ts
import archiver from 'archiver'
import { existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '../db.js'
import { config } from '../config.js'
import type { Writable } from 'stream'

export function createExportArchive(output: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.pipe(output)
    archive.on('error', reject)

    void (async () => {
      try {
        const shots = await prisma.shot.findMany({ select: { id: true, filePath: true } })
        for (const s of shots) {
          const full = join(config.filesDir, s.filePath)
          if (existsSync(full)) archive.file(full, { name: `shots/${s.id}.shot` })
        }
        const all = await prisma.shot.findMany({ include: { tags: true } })
        archive.append(JSON.stringify(all, null, 2), { name: 'shots.json' })
        await archive.finalize()
        resolve()
      } catch (e) {
        reject(e)
      }
    })()
  })
}
