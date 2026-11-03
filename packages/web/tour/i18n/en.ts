import type { TourStrings } from './types.js'
import { captionsEn } from './captions.en.js'

export const en: TourStrings = {
  notices: {
    analysisUnavailable: 'The demo only includes stored AI analyses for a few shots. On your own server, every shot can be analysed with your API key.',
    notInDemo: 'Not available in the demo — this runs on your own server.',
  },
  toast: { blocked: 'Disabled in the demo — runs on your own server.' },
  ui: { step: 'Step {n} of {total}', pause: 'Pause', play: 'Play', prev: 'Back', next: 'Next', exit: 'Exit tour', restart: 'Restart tour', explore: 'Explore the demo', skip: 'Skip intro' },
  intro: {
    kicker: 'Visualizer Lite',
    title: 'Your shots. Your server.',
    subtitle: 'A self-hosted shot manager for the Decent DE1.',
    points: ['Runs in a single Docker container', 'No cloud, no account', 'Every shot, for years'],
  },
  outro: {
    title: 'Your data stays yours.',
    subtitle: 'Install Visualizer Lite on your NAS or home server in a minute.',
    install: 'docker run -d -p 3000:3000 -v ./data:/data -e VL_SESSION_SECRET="$(openssl rand -base64 48)" -e VL_PASSWORD=change-me ghcr.io/tomschmidtdev/visualizer-lite:latest',
    repo: 'View on GitHub',
  },
  captions: captionsEn,
}
