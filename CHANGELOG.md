# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
