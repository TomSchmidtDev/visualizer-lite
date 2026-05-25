import { beforeAll, afterAll } from 'vitest'

beforeAll(() => {
  process.env.DATA_DIR = '/tmp/vl-test'
  process.env.VL_SESSION_SECRET = 'test-secret-32-chars-minimum-ok!'
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = 'file:/tmp/vl-test.db'
})
