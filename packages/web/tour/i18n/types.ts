export interface Caption { title: string; body: string }

export interface TourStrings {
  notices: { analysisUnavailable: string; notInDemo: string }
  toast: { blocked: string }
  ui: { step: string; pause: string; play: string; prev: string; next: string; exit: string; restart: string; explore: string; skip: string }
  intro: { kicker: string; title: string; subtitle: string; points: string[] }
  outro: { title: string; subtitle: string; install: string; repo: string }
  captions: Record<string, Caption>
}
