// Records the demo tour to MP4 (one per language) for the README videos.
//
//   npm run record:tour -w packages/web -- [--lang en|de|both] [--out tour/out] [--crf 26]
//
// Requires: `npx playwright install chromium` and ffmpeg on PATH.
// Output: tour/out/visualizer-lite-tour-<lang>.mp4 — upload these via the GitHub web editor (see tour/README.md).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

type Lang = 'en' | 'de'
const PORT = 4173
const VIEWPORT = { width: 1280, height: 720 }
const MAX_TOUR_MS = 8 * 60_000
const GITHUB_LIMIT_BYTES = 10 * 1024 * 1024

export function parseRecordArgs(argv: string[]): { langs: Lang[]; out: string; crf: number } {
  const get = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined }
  const lang = get('lang') ?? 'both'
  if (!['en', 'de', 'both'].includes(lang)) throw new Error(`--lang must be en, de or both (got ${lang})`)
  return {
    langs: lang === 'both' ? ['en', 'de'] : [lang as Lang],
    out: get('out') ?? 'tour/out',
    crf: get('crf') ? parseInt(get('crf')!, 10) : 26,
  }
}

export function ffmpegArgs(input: string, output: string, crf: number): string[] {
  return ['-y', '-i', input, '-vf', 'scale=1280:720:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output]
}

function requireTool(cmd: string, args: string[], hint: string) {
  const r = spawnSync(cmd, args, { stdio: 'ignore' })
  if (r.error || r.status !== 0) throw new Error(`${cmd} not available — ${hint}`)
}

async function waitForServer(url: string, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Preview server did not start at ${url}`)
}

async function recordLang(lang: Lang, outDir: string, crf: number) {
  const { chromium } = await import('playwright')
  const rawDir = join(outDir, `raw-${lang}`)
  rmSync(rawDir, { recursive: true, force: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: lang === 'de' ? 'de-DE' : 'en-US', recordVideo: { dir: rawDir, size: VIEWPORT } })
  const page = await context.newPage()
  page.on('console', (m) => { if (m.text().startsWith('[tour]')) console.warn(`  ${lang}: ${m.text()}`) })
  const t0 = Date.now()
  await page.goto(`http://localhost:${PORT}/?lang=${lang}&record=1`)
  await page.waitForFunction(() => (window as { __tourDone?: boolean }).__tourDone === true, null, { timeout: MAX_TOUR_MS, polling: 500 })
  await context.close()
  await browser.close()
  console.log(`  ${lang}: tour finished after ${((Date.now() - t0) / 1000).toFixed(0)} s`)

  const raw = readdirSync(rawDir).find((f) => f.endsWith('.webm'))
  if (!raw) throw new Error(`No video recorded for ${lang}`)
  const webm = join(outDir, `visualizer-lite-tour-${lang}.webm`)
  renameSync(join(rawDir, raw), webm)
  rmSync(rawDir, { recursive: true, force: true })

  const mp4 = join(outDir, `visualizer-lite-tour-${lang}.mp4`)
  const r = spawnSync('ffmpeg', ffmpegArgs(webm, mp4, crf), { stdio: ['ignore', 'ignore', 'inherit'] })
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${lang}`)
  rmSync(webm)
  const size = statSync(mp4).size
  const mb = (size / 1024 / 1024).toFixed(1)
  console.log(`  ${lang}: ${mp4} (${mb} MB)`)
  if (size > GITHUB_LIMIT_BYTES) console.warn(`  ⚠ ${lang}: larger than 10 MB (GitHub free-plan upload limit) — re-run with a higher --crf, e.g. --crf ${crf + 4}`)
}

async function main() {
  const opts = parseRecordArgs(process.argv.slice(2))
  const outDir = resolve(opts.out)
  mkdirSync(outDir, { recursive: true })
  requireTool('ffmpeg', ['-version'], 'install it, e.g. `brew install ffmpeg`')

  console.log('Building tour…')
  const build = spawnSync('npm', ['run', 'build:tour'], { stdio: 'inherit', env: { ...process.env, TOUR_BASE: '/' } })
  if (build.status !== 0) throw new Error('build:tour failed')

  let server: ChildProcess | undefined
  try {
    server = spawn('npx', ['vite', 'preview', '-c', 'tour/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, TOUR_BASE: '/' } })
    await waitForServer(`http://localhost:${PORT}/`)
    for (const lang of opts.langs) {
      console.log(`Recording ${lang}…`)
      await recordLang(lang, outDir, opts.crf)
    }
  } catch (e) {
    if (e instanceof Error && /Executable doesn't exist/.test(e.message)) {
      throw new Error('Playwright browser missing — run `npx playwright install chromium`')
    }
    throw e
  } finally {
    server?.kill()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? '')) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
