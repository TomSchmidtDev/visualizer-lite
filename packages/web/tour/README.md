# Demo tour

A self-running, ~4½-minute guided tour of the real Visualizer Lite UI. It is published on
GitHub Pages (https://tomschmidtdev.github.io/visualizer-lite/) and recorded to the videos
embedded in the READMEs.

The tour is a **separate static build**. Nothing in `src/` imports from `tour/`, and the Docker
image does not contain it. A test (`build-separation.test.ts`) guards this.

## How it works

| Part | File(s) |
|---|---|
| Entry / boot (language, demo data, fetch shim, click guards) | `main.tsx`, `boot.tsx` |
| Demo "backend": every `/api/` request is answered in the browser | `mock/handlers.ts`, `mock/store.ts`, `mock/stats.ts`, `mock/installFetch.ts` |
| Buttons that would trigger real downloads/navigation → toast | `guards.ts` |
| Storyboard (stations, targets, actions) | `script/steps.ts` |
| Captions EN/DE | `i18n/captions.en.ts`, `i18n/captions.de.ts` |
| Runner (auto-advance, pause on interaction) and DOM driver (cursor, clicks) | `engine/` |
| Overlay (ring, bubble, cursor, cards, controls) | `overlay/` |

Language: `?lang=en|de`, otherwise the browser language. `?record=1` hides the control bar and
sets `window.__tourDone` when the tour has finished (used by the recorder).

The app's own elements are targeted via `data-tour="…"` (and `data-shot-id`) attributes. If you
rename or remove one in `src/`, `script/steps.test.ts` and a tour run will tell you.

## Develop

```bash
npm run dev:tour -w packages/web          # http://localhost:5174/?lang=de
npm run build:tour -w packages/web        # → packages/web/dist-tour/
```

## Refresh the demo data

`data/demo.json` holds anonymized real shots. To regenerate it:

1. In your own Visualizer Lite instance, generate AI analyses for 2–3 shots you want to feature —
   ideally one in English and one in German (the tour shows the analysis matching its language).
2. Copy the database (`/data/visualizer.db`) to your machine, then run:

   ```bash
   npm run export:tour-data -w packages/web -- \
     --db /path/to/visualizer.db \
     --include <shotId>:en,<shotId>:de \
     --count 40 --import-batch 8
   ```

3. **Review before committing.** The script prints the roasters/beans and every analysis text.
   Check them for personal references, and search the JSON for your name and your DE1 address.
   What is kept: curves, dose/yield/time/TDS/EY, grinder, profile, scores, roaster and bean names.
   What is removed or replaced: barista (→ "Alex"), private notes, notes (→ neutral samples), tags,
   IDs, and absolute timestamps (shifted; the tour rebases them to "now" at runtime).

## Record the videos

Requires ffmpeg (`brew install ffmpeg`) and Playwright's Chromium (`npx playwright install chromium`).

```bash
npm run record:tour -w packages/web                 # both languages
npm run record:tour -w packages/web -- --lang de    # one language
npm run record:tour -w packages/web -- --crf 30     # smaller file, softer image (default 26)
```

Output: `packages/web/tour/out/visualizer-lite-tour-en.mp4` and `…-de.mp4` (git-ignored).

## Put the videos into the READMEs (manual)

GitHub only shows an inline player for videos uploaded through its web editor, so this step is
done by hand, once, and again whenever the tour changes:

1. On github.com, open `README.md` → ✏️ *Edit*.
2. Find the line `<!-- TOUR_VIDEO: … -->` and drag `visualizer-lite-tour-en.mp4` onto the editor
   right below it. GitHub uploads the file and inserts a `https://github.com/user-attachments/assets/…` link.
3. Commit the change.
4. Repeat for `README.de.md` with `visualizer-lite-tour-de.mp4`.

Free GitHub plans accept videos up to 10 MB; the recorder warns if a file is larger.

## Deploy

`.github/workflows/tour-pages.yml` builds and deploys the tour on every push to `main` that
touches `packages/web/`. One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
