// packages/api/src/routes/auth.ts
import type { FastifyPluginAsync } from 'fastify'
import { verifyPassword, getUsername } from '../plugins/auth.js'
import { config } from '../config.js'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { username: string; password: string } }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const valid = await verifyPassword(request.body.password)
      if (!valid) return reply.status(401).send({ error: 'Invalid credentials' })

      const username = await getUsername()
      const token = fastify.jwt.sign({ username }, { expiresIn: '30d' })

      return reply
        .setCookie('token', token, {
          httpOnly: true,
          secure: config.useTls,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        })
        // Non-httpOnly indicator so the SPA can detect login state via document.cookie
        .setCookie('vl_loggedin', '1', {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        })
        .send({ ok: true })
    }
  )

  fastify.post('/logout', async (_req, reply) => {
    return reply
      .clearCookie('token', { path: '/' })
      .clearCookie('vl_loggedin', { path: '/' })
      .send({ ok: true })
  })
}

export default authRoutes
