// One-off CLI: reads a Visualizer Lite SQLite database, selects shots,
// anonymizes them and writes tour/data/demo.json for the demo tour.
//
//   npm run export:tour-data -w packages/web -- --db <visualizer.db> \
//     [--include id1:en,id2:de] [--count 40] [--import-batch 8] [--out tour/data/demo.json]
//
// Review the printed summary and the JSON before committing it.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AnalysisResponse, Shot, ShotData } from '../../src/types.js'
import type { DemoDataset, DemoShot } from '../data/types.js'
import { anonymizeShot, anonymizeAnalysis } from './anonymize.js'

type Row = Record<string, unknown>

export function toIso(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'number' || typeof v === 'bigint') return new Date(Number(v)).toISOString()
  if (typeof v === 'string') return /^\d+$/.test(v) ? new Date(Number(v)).toISOString() : new Date(v).toISOString()
  throw new Error(`Unsupported date value: ${String(v)}`)
}

export function guessLang(texts: string[]): 'en' | 'de' {
  const t = texts.join(' ').toLowerCase()
  const de = (t.match(/\b(und|der|die|das|ist|nicht|mit|leicht|zu)\b/g) ?? []).length
  const en = (t.match(/\b(and|the|is|not|with|slightly|too)\b/g) ?? []).length
  return de > en ? 'de' : 'en'
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] ?? ''
  }
  if (!args.db) throw new Error('Missing --db <path to visualizer.db>')
  const include = (args.include ?? '').split(',').filter(Boolean).map((s) => {
    const [id, lang] = s.split(':')
    return { id, lang: lang === 'de' || lang === 'en' ? (lang as 'en' | 'de') : undefined }
  })
  return {
    db: resolve(args.db),
    include,
    count: parseInt(args.count ?? '40', 10),
    importBatch: parseInt(args['import-batch'] ?? '8', 10),
    out: resolve(args.out ?? 'tour/data/demo.json'),
  }
}

function rowToShot(r: Row): DemoShot {
  const num = (k: string) => (r[k] == null ? null : Number(r[k]))
  const str = (k: string) => (r[k] == null ? null : String(r[k]))
  const shot: Shot = {
    id: String(r.id),
    startTime: toIso(r.startTime)!,
    duration: num('duration'), beanWeight: num('beanWeight'), drinkWeight: num('drinkWeight'),
    drinkTds: num('drinkTds'), drinkEy: num('drinkEy'),
    profileTitle: str('profileTitle'), beverageType: str('beverageType'),
    grinderModel: str('grinderModel'), grinderSetting: str('grinderSetting'), barista: str('barista'),
    beanBrand: str('beanBrand'), beanType: str('beanType'), roastDate: toIso(r.roastDate), roastLevel: str('roastLevel'),
    espressoEnjoyment: num('espressoEnjoyment'),
    fragrance: num('fragrance'), aroma: num('aroma'), flavor: num('flavor'), aftertaste: num('aftertaste'),
    acidity: num('acidity'), bitterness: num('bitterness'), sweetness: num('sweetness'), mouthfeel: num('mouthfeel'),
    beanNotes: str('beanNotes'), espressoNotes: str('espressoNotes'), privateNotes: str('privateNotes'),
    tags: [],
  }
  return { ...shot, shotData: JSON.parse(String(r.shotData)) as ShotData }
}

function normalize(items: unknown[]): string[] {
  return items.map((item) => typeof item === 'string' ? item
    : item && typeof item === 'object' ? Object.values(item).filter((v): v is string => typeof v === 'string').join(' — ')
    : String(item))
}

function rowToAnalysis(r: Row): AnalysisResponse {
  return {
    id: String(r.id), shotId: String(r.shotId),
    analysisType: r.analysisType === 'stats' ? 'stats' : 'detail',
    aiModel: String(r.aiModel),
    barista: normalize(JSON.parse(String(r.barista))), roaster: normalize(JSON.parse(String(r.roaster))),
    analyst: JSON.parse(String(r.analyst)),
    tokenInputCount: Number(r.tokenInputCount), tokenOutputCount: Number(r.tokenOutputCount),
    costInputUsd: r.costInputUsd == null ? null : Number(r.costInputUsd),
    costOutputUsd: r.costOutputUsd == null ? null : Number(r.costOutputUsd),
    analysisMode: String(r.analysisMode ?? 'standard'),
    preprocessDurationMs: r.preprocessDurationMs == null ? null : Number(r.preprocessDurationMs),
    aiDurationMs: r.aiDurationMs == null ? null : Number(r.aiDurationMs),
    createdAt: toIso(r.createdAt)!,
    contextSummary: null,
  }
}

const DAY = 86_400_000

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const db = new DatabaseSync(opts.db, { readOnly: true })

  const includeIds = opts.include.map((i) => i.id)
  const included = includeIds.length
    ? db.prepare(`SELECT * FROM Shot WHERE id IN (${includeIds.map(() => '?').join(',')})`).all(...includeIds) as Row[]
    : []
  const missing = includeIds.filter((id) => !included.some((r) => r.id === id))
  if (missing.length) throw new Error(`--include ids not found: ${missing.join(', ')}`)

  const recent = db.prepare('SELECT * FROM Shot ORDER BY startTime DESC LIMIT ?').all(opts.count) as Row[]
  const rows = [...included, ...recent.filter((r) => !includeIds.includes(String(r.id)))].slice(0, Math.max(opts.count, included.length))

  const timeShiftMs = Math.round((7 + Math.random() * 14) * DAY + Math.random() * 3_600_000)
  const idMap = new Map<string, string>()
  const shots = rows.map(rowToShot).map((s) => {
    const newId = randomUUID()
    idMap.set(s.id, newId)
    return anonymizeShot(s, { newId, timeShiftMs })
  }).sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))

  const analyses: Record<string, AnalysisResponse> = {}
  const analysisLang: Record<string, 'en' | 'de'> = {}
  const ids = [...idMap.keys()]
  const aRows = db.prepare(`SELECT * FROM ShotAnalysis WHERE shotId IN (${ids.map(() => '?').join(',')})`).all(...ids) as Row[]
  for (const r of aRows) {
    const a = rowToAnalysis(r)
    const newId = idMap.get(a.shotId)!
    analyses[newId] = anonymizeAnalysis(a, newId, timeShiftMs)
    analysisLang[newId] = opts.include.find((i) => i.id === a.shotId)?.lang ?? guessLang([...a.barista, ...a.roaster])
  }

  // Featured (analysed) shots must stay visible from the start, so keep them out of the import batch.
  const importBatchIds = shots.filter((s) => !analyses[s.id]).slice(0, opts.importBatch).map((s) => s.id)
  const ds: DemoDataset = {
    exportedAt: new Date(Date.parse(shots[0].startTime) + 3_600_000).toISOString(),
    shots, importBatchIds, analyses, analysisLang,
  }
  writeFileSync(opts.out, JSON.stringify(ds) + '\n')

  const roasters = [...new Set(shots.map((s) => `${s.beanBrand ?? '—'} · ${s.beanType ?? '—'}`))]
  console.log(`\nWrote ${opts.out}`)
  console.log(`Shots: ${shots.length} (import batch ${importBatchIds.length}), analyses: ${aRows.length}`)
  console.log(`Roaster · bean:\n  ${roasters.join('\n  ')}`)
  for (const [id, a] of Object.entries(analyses)) {
    console.log(`\n── Analysis for ${id} [${analysisLang[id]}] (${a.aiModel}) ──`)
    console.log('Barista:\n  ' + a.barista.join('\n  '))
    console.log('Roaster:\n  ' + a.roaster.join('\n  '))
  }
  console.log('\nReview the analysis texts above for personal references before committing.')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? '')) main()
