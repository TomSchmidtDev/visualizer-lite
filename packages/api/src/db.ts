// packages/api/src/db.ts
import { PrismaClient } from '@prisma/client'

let _prisma: PrismaClient | undefined

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
  }
  return _prisma
}

export const prisma = getPrisma()

export async function enableWal(): Promise<void> {
  // PRAGMA journal_mode returns a result row in SQLite, so use $queryRaw
  await prisma.$queryRaw`PRAGMA journal_mode=WAL`
  await prisma.$queryRaw`PRAGMA synchronous=NORMAL`
  await prisma.$queryRaw`PRAGMA foreign_keys=ON`
}
