// packages/api/src/plugins/auth.ts
import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { prisma } from '../db.js'
import { config } from '../config.js'

export async function seedInitialUser(): Promise<void> {
  const existing = await prisma.settings.findUnique({ where: { key: 'passwordHash' } })
  if (existing) return

  const initialPassword = process.env.VL_PASSWORD ?? config.initialPassword
  if (!initialPassword) {
    throw new Error('VL_PASSWORD is required on first start to initialize the admin account')
  }

  const hash = await bcrypt.hash(initialPassword, 12)
  await prisma.settings.createMany({
    data: [
      { key: 'username', value: config.initialUsername },
      { key: 'passwordHash', value: hash },
      { key: 'language', value: 'auto' },
      { key: 'theme', value: 'dark' },
    ],
  })
}

export async function verifyPassword(password: string): Promise<boolean> {
  const row = await prisma.settings.findUnique({ where: { key: 'passwordHash' } })
  if (!row) return false
  return bcrypt.compare(password, row.value)
}

export async function getUsername(): Promise<string> {
  const row = await prisma.settings.findUnique({ where: { key: 'username' } })
  return row?.value ?? 'admin'
}

export function decodeBasicAuth(
  header: string | undefined
): { username: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const sep = decoded.indexOf(':')
  if (sep === -1) return null
  return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'requireAuth',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
      } catch {
        reply.status(401).send({ error: 'Unauthorized' })
        return
      }
    }
  )

  fastify.decorate(
    'requireAuthOrBasic',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const basic = decodeBasicAuth(request.headers.authorization)
      if (basic) {
        const valid = await verifyPassword(basic.password)
        if (!valid) {
          reply.status(401).send({ error: 'Invalid credentials' })
          return
        }
        return
      }
      try {
        await request.jwtVerify()
      } catch {
        reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  )
}

export default fp(authPlugin)
