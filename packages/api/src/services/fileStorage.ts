// packages/api/src/services/fileStorage.ts
import { createHash } from 'crypto'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { config } from '../config.js'

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Save .shot file to <filesDir>/<YYYY>/<MM>/<hash>.shot
 * Returns the relative path stored in the DB.
 */
export function saveFile(buffer: Buffer, hash: string, date: Date): string {
  const year = date.getFullYear().toString()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dir = join(config.filesDir, year, month)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const rel = join(year, month, `${hash}.shot`)
  writeFileSync(join(config.filesDir, rel), buffer)
  return rel
}

export function readFile(relativePath: string): Buffer | null {
  const full = join(config.filesDir, relativePath)
  return existsSync(full) ? readFileSync(full) : null
}

export function deleteFile(relativePath: string): void {
  const full = join(config.filesDir, relativePath)
  if (existsSync(full)) unlinkSync(full)
}
