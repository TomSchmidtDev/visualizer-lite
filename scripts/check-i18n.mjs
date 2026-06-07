#!/usr/bin/env node
// scripts/check-i18n.mjs — pre-commit i18n key validation
// Checks that all static t('...') calls in packages/web/src match both de.json and en.json,
// and that both JSON files have identical key sets.

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'

// ─── Paths ───────────────────────────────────────────────────────────────────

const root = new URL('..', import.meta.url).pathname
const deJsonPath = join(root, 'packages/web/src/i18n/de.json')
const enJsonPath = join(root, 'packages/web/src/i18n/en.json')
const srcDir     = join(root, 'packages/web/src')

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recursively flatten a nested object to dot-notation key paths. */
function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null ? flattenKeys(v, full) : [full]
  })
}

/** Recursively collect .ts / .tsx files, skipping node_modules and dist. */
function collectSourceFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectSourceFiles(full))
    } else if (['.ts', '.tsx'].includes(extname(entry))) {
      results.push(full)
    }
  }
  return results
}

// ─── Load JSON ───────────────────────────────────────────────────────────────

let deKeys, enKeys
try {
  deKeys = new Set(flattenKeys(JSON.parse(readFileSync(deJsonPath, 'utf8'))))
  enKeys = new Set(flattenKeys(JSON.parse(readFileSync(enJsonPath, 'utf8'))))
} catch (e) {
  console.error(`❌ i18n: could not load translation files — ${e.message}`)
  console.error('Is the repo fully checked out? Expected:')
  console.error(`  ${deJsonPath}`)
  console.error(`  ${enJsonPath}`)
  process.exit(1)
}

// ─── Extract t() calls from source files ─────────────────────────────────────

// Matches t('key') and t("key") — static strings only.
// Does NOT match template literals: t(`...`).
const STATIC_T_RE = /\bt\(\s*(['"])([^'"]+)\1/g
// Matches template literal calls: t(`...`) — these are skipped with a warning.
const DYNAMIC_T_RE = /\bt\(\s*`[^`]+`\s*\)/g

const failures   = []   // { file, key, missingIn }
const dynamics   = []   // { file, snippet }

for (const filePath of collectSourceFiles(srcDir)) {
  const code     = readFileSync(filePath, 'utf8')
  const relPath  = relative(root, filePath)

  // Warn about dynamic keys (template literals)
  for (const match of code.matchAll(DYNAMIC_T_RE)) {
    const snippet = match[0].slice(0, 60)
    dynamics.push({ file: relPath, snippet })
  }

  // Validate static keys
  for (const match of code.matchAll(STATIC_T_RE)) {
    const key = match[2]
    const missingIn = []
    if (!deKeys.has(key)) missingIn.push('de.json')
    if (!enKeys.has(key)) missingIn.push('en.json')
    if (missingIn.length > 0) {
      failures.push({ file: relPath, key, missingIn })
    }
  }
}

// ─── Symmetry check ──────────────────────────────────────────────────────────

const onlyDe = [...deKeys].filter(k => !enKeys.has(k))
const onlyEn = [...enKeys].filter(k => !deKeys.has(k))

// ─── Output ──────────────────────────────────────────────────────────────────

// Dynamic key warnings (non-blocking)
if (dynamics.length > 0) {
  console.warn('⚠ Dynamic i18n key(s) skipped (cannot validate statically):')
  for (const { file, snippet } of dynamics) {
    console.warn(`  ${file}  →  ${snippet}`)
  }
  console.warn()
}

const errorCount = failures.length + onlyDe.length + onlyEn.length

if (errorCount === 0) {
  process.exit(0)
}

console.error('❌ i18n validation failed:\n')

if (failures.length > 0) {
  console.error('  Missing keys (used in code but not in translation files):')
  // Align columns: pad filename to the longest filename length
  const maxLen = Math.max(...failures.map(f => f.file.length))
  for (const { file, key, missingIn } of failures) {
    console.error(`    ${file.padEnd(maxLen)}  →  '${key}'  (missing in: ${missingIn.join(', ')})`)
  }
  console.error()
}

if (onlyDe.length > 0 || onlyEn.length > 0) {
  console.error('  Asymmetric keys (present in one file only):')
  for (const k of onlyDe) console.error(`    de.json only: ${k}`)
  for (const k of onlyEn) console.error(`    en.json only: ${k}`)
  console.error()
}

console.error(`${errorCount} error(s) — commit aborted.`)
console.error(`Run \`npm run check:i18n\` to reproduce.`)
process.exit(1)
