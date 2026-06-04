# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.13.1] - 2026-06-05

### Fixed
- **AI analysis: profile- and bean-scoped historical context** — Historical baseline stats (avg pressure, flow, temperature) are now computed only from shots that ran with the same profile. When bean info (`beanBrand` + `beanType`) is also set, the comparison is further narrowed to the same coffee. Fallback: same profile only → profile+bean only when ≥2 matching shots exist. Shots with no profile set produce no historical context. The prompt now labels the match level ("same profile & bean" or "same profile") so the model knows exactly what it is comparing against.

## [1.13.0] - 2026-06-04

### Changed
- **Settings tabbed navigation** — Reorganized the Settings page into 4 icon+label tabs: 🎨 Ansicht (Language, Theme, Statistics), 💾 Daten (DE1 Import, Export, Database Info), 🔒 Sicherheit (Password), 🤖 KI Analyse (AI Analysis). Active tab is remembered across sessions via `localStorage`.

## [1.12.0] - 2026-06-04

### Added
- **Optimized Analysis Mode**: New A/B toggle in Settings → AI Analysis. "Optimiert" uses a compressed system prompt (~50% fewer tokens), compact key=value prompt format, higher channeling threshold (σ > 0.20 ml/s), and Claude prompt caching — reducing API costs significantly while eliminating false-positive warnings.

## [1.11.0] - 2026-06-04

### Added
- **AI analysis cost tracking** — input and output token costs (USD) are now stored at the time of analysis and displayed inline: `date • model • ↑ N / ↓ N Tokens • ↑ $X / ↓ $Y = $total`. Pricing is fetched live from the OpenRouter API (24 h in-memory cache) with a hardcoded fallback; unavailable pricing silently stores `null` without affecting the analysis. Costs are stored persistently so historical entries remain accurate even if prices change later.

## [1.10.0] - 2026-06-04

### Added
- **AI analysis metadata** — creation date, model name, and token counts (input / output) are now displayed above the "Regenerate" button on the shot detail page

### Documentation
- README overhaul (EN + DE): story-first structure with new "Why Visualizer Lite?" section, expanded Quick Start with parameter explanations and HTTPS guidance, new "Importing Shots" section, expanded DE1 Plugins section describing both plugins and the HTTP/HTTPS extension, Related Links section, and BUSL-compliant Disclaimer
- Architecture diagrams updated: AI API as external node, Analysis route added, ShotAnalysis model added to data model diagram

## [1.9.2] - 2026-06-02

### Fixed
- Docker runtime image: upgrade npm to v11.x to resolve bundled dependency CVEs (picomatch CVE-2026-33671/33672, brace-expansion CVE-2026-33750, ip-address CVE-2026-42338)

## [1.9.0] - 2026-06-02

### Added
- **KI-Analyse (experimentell)** — On-demand AI analysis of individual espresso shots using Claude or OpenAI models
  - Two perspectives: **Barista** (brewing technique) and **Röster** (bean & roast analysis)
  - Supports Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.8 and GPT-4o mini / GPT-4o
  - User-provided API keys stored in Settings (Claude and/or OpenAI)
  - Per-model selector dropdown in Settings
  - Optional machine context textarea (pre-filled with DE1-specific knowledge)
  - Results cached per shot; regenerate button to refresh
  - Dark-theme aware UI with tab navigation (☕ Barista / 🔥 Röster)
- **Phase-aware analysis**: shot curves automatically segmented into Preinfusion and Extraction phases based on profile goal signals; statistics computed per phase, not over the whole shot
- **Stable sub-phase detection**: extraction stats (σ, avg, min, max) computed only after the flow minimum is reached, excluding the pressure ramp-down
- **Flow vs. pressure control semantics**: flow-controlled phases treat pressure as puck resistance (output), not a stability metric; channeling signals only raised in pressure-controlled phases
- Shot date and days-since-roast passed to the AI for freshness-aware roast analysis
- Scale flow (cup output) included in the analysis: first-drop timing and stability

### Changed
- Language-aware AI prompts: German or English based on app language setting

## [1.8.0] - 2026-05-31

### Added
- Statistics: **Roasters & Beans** tab — sortable table of all roasters with expandable bean sub-rows (shots, avg enjoyment, avg ratio, avg duration, total bean weight)
- Statistics: **Profiles** tab — sortable table of all Decent profiles with the same metrics plus avg dose
- Both new tabs respect the existing Period and Beverage filters

## [1.7.2] - 2026-05-31

### Fixed
- Pagination scroll position now also preserved when navigating to an uncached page (React Query's intermediate `undefined` state no longer clears the scroll flag prematurely)

## [1.7.1] - 2026-05-31

### Fixed
- Pagination scroll position now preserved when navigating to a cached page (was only working for uncached pages)

## [1.7.0] - 2026-05-31

### Added
- Beverage type shown on each shot card in the list view (above the ratio)
- Architecture documentation in both READMEs with Mermaid diagrams (system overview, container internals, data ingestion flows, monorepo structure, data model)

### Changed
- Pagination `‹` / `›` buttons now jump 10 pages at a time instead of 1; `«` / `»` still jump to first/last page
- Pagination now preserves scroll position after page change — page loads at the pagination bar, not the top of the list

### Removed
- Redundant upload button in the stats bar below the filters (upload button in the top navigation bar remains)

## [1.6.1] - 2026-05-31

### Fixed
- FTS + beverageType combined search now returns the correct filtered total and page count (was using raw FTS hit count, ignoring the beverage filter)
- Re-uploading an existing `.shot` file no longer overwrites a previously set `beverageType` with `null` when the file itself carries no `beverage_type` field

## [1.6.0] - 2026-05-31

### Added
- Beverage type filter in the shot list — dynamically populated from the database (shows all stored values incl. "Unknown" for shots without a beverage type)
- Beverage type chip shown in shot detail view (before the profile chip)
- Beverage type field in the shot edit form (Espresso / Filter / Not set); value is normalised to lowercase on save
- DE1 direct import: configurable default beverage type in Settings used as fallback when the machine does not transmit a `beverage_type`
- `beverageType` exposed in all API responses and list/filter endpoints

### Fixed
- Incoming `beverageType` values from the DE1 parser are now normalised to lowercase, preventing case-sensitive mismatches (e.g. `Espresso` vs. `espresso`)
- "Unknown" beverage filter now matches both `NULL` and empty-string values in the database

## [1.5.0] - 2026-05-31

### Added
- Statistics page (`/stats`) with dashboard tab: KPI tiles (shots, bean weight, output, ratio, avg rating, shots/day, duration, top grind setting), top-N ranked lists (roasters, roasts, profiles), and beverage type toggle (Espresso / Filter / All)
- Nine selectable rolling time windows: 24h · 7 days · 2 weeks · 1 month · 6 months · 1 year · 2 years · 3 years · All time — each with comparison to the preceding window
- KPI delta indicators show arrow + delta value + optional previous-period value (configurable in Settings)
- New `beverageType` field on Shot, extracted from `profile.beverage_type` in both JSON and Tcl shot file parsers; populated on import and re-import via both the upload endpoint and DE1 direct import
- Settings → Statistics: configurable Top-N (1–20, default 10) and toggle for showing previous-period values in KPI tiles

## [1.4.0] - 2026-05-31

### Added
- DE1 Direct Import now remembers the last "Bis" date; on the next visit the "Von" field is pre-filled with that date so repeat imports require no manual date adjustment

## [1.3.0] - 2026-05-30

### Added
- Shot comparison feature: "Vergleichen" button in shot detail opens the list in compare mode; clicking a second shot navigates to `/compare?a=…&b=…`
- Comparison page with overlaid extraction curves (Shot A solid, Shot B dashed at 70% opacity) and a toggle to split-view mode
- Key metrics table (dose/yield, ratio, duration, enjoyment) with differing values highlighted
- Tasting scores, bean/equipment info, and notes shown side by side

## [1.2.1] - 2026-05-30

### Added
- GitHub Actions release workflow: multi-platform Docker image (linux/amd64 + linux/arm64) published to ghcr.io and as release assets on every GitHub Release
- Gitleaks secret scan as a gate step before any build
- Quick Start section in README with `docker run` commands for NAS, macOS, and Windows

### Fixed
- `gitleaks/gitleaks-action@v2` replaced with direct binary invocation (action does not support the `release` event)

## [1.2.0] - 2026-05-28

### Added
- Filtered ∅ Ratio: always computed from the active filter (same WHERE clause as the shot list)
- `showAvgRatio` setting with toggle in Settings → Theme card
- Covering index `@@index([beanWeight, drinkWeight])` for the ratio aggregate query
- App description, feature list, and screenshots to both README files (EN + DE)

### Fixed
- Double shot-count display ("13 13 Shots gefunden") — count is now shown once, with "X von Y" when a filter is active
- ∅ Enjoyment now only shown when no filter is active

## [1.1.0] - 2026-05-26

### Added
- DE1 direct import via machine HTTP API (NDJSON streaming with live progress counter)
- Tolerant `roastDate` parsing via `parseOptionalDate()` — invalid dates return null instead of crashing
- `normalizeDateStr()` applied in JSON parser (was missing, only Tcl parser did it)
- Concise error log format for DE1 import (first non-empty line only)
- Version display in app footer and login page (`__APP_VERSION__`, `__BUILD_TIME__`, `__GIT_HASH__`)
- `bcryptjs` replaces native `bcrypt` (cross-platform Docker builds on Apple Silicon)
- Stale password hash recovery: `seedInitialUser` force-rehashes when `VL_PASSWORD` is set

### Fixed
- `vl_loggedin` cookie used `secure: NODE_ENV === 'production'` — switched to `secure: config.useTls` so login works over HTTP on the NAS
- Upload URL mismatch: client called `/shots/upload` instead of `/api/shots/upload`
- Docker cross-compilation: replaced `buildx --output type=docker,dest=...` with `docker build --platform linux/amd64`

## [1.0.0] - 2026-05-25

### Added
- Initial release: self-hosted espresso shot manager for the Decent Espresso DE1
- Shot list with search & filter (bean brand, type, profile, grinder, date range, full-text)
- Shot detail with extraction curves (pressure, flow, weight, temperature)
- Manual `.shot` file upload
- DE1 plugin for automatic upload
- Tasting notes & enjoyment score (0–100) with tasting scores
- Edit shot metadata
- Dark / light theme, German and English UI
- ZIP data export
- Single Docker container with SQLite database
