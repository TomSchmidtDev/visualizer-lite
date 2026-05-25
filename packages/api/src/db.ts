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
  await prisma.$executeRaw`PRAGMA journal_mode=WAL`
  await prisma.$executeRaw`PRAGMA synchronous=NORMAL`
  await prisma.$executeRaw`PRAGMA foreign_keys=ON`
}
