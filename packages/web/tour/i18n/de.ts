import type { TourStrings } from './types.js'

export const de: TourStrings = {
  notices: {
    analysisUnavailable: 'Die Demo enthält gespeicherte AI-Analysen nur für einige Shots. Auf deinem eigenen Server lässt sich jeder Shot mit deinem API-Key analysieren.',
    notInDemo: 'In der Demo nicht verfügbar – läuft auf deinem eigenen Server.',
  },
  toast: { blocked: 'In der Demo deaktiviert – läuft auf deinem eigenen Server.' },
  ui: { step: 'Schritt {n} von {total}', pause: 'Pause', play: 'Weiter', prev: 'Zurück', next: 'Vor', exit: 'Tour beenden', restart: 'Tour neu starten', explore: 'Demo selbst erkunden', skip: 'Intro überspringen' },
  intro: {
    kicker: 'Visualizer Lite',
    title: 'Deine Shots. Dein Server.',
    subtitle: 'Ein selbst gehosteter Shot-Manager für die Decent DE1.',
    points: ['Läuft in einem einzigen Docker-Container', 'Keine Cloud, kein Konto', 'Jeder Shot, über Jahre'],
  },
  outro: {
    title: 'Deine Daten bleiben deine.',
    subtitle: 'Installiere Visualizer Lite in einer Minute auf deinem NAS oder Heimserver.',
    install: 'docker run -d -p 3000:3000 -v ./data:/data -e VL_SESSION_SECRET="$(openssl rand -base64 48)" -e VL_PASSWORD=change-me ghcr.io/tomschmidtdev/visualizer-lite:latest',
    repo: 'Auf GitHub ansehen',
  },
  captions: {},
}
