# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
