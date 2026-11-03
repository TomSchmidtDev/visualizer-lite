// Visual layer of the tour: gold ring, speech bubble with auto-advance progress,
// fake cursor, intro/outro cards, control bar and toast. Purely presentational.
import type { TourStrings } from '../i18n/types.js'
import type { Control, OverlayState, Placement, Rect } from './types.js'
import './overlay.css'

const REPO_URL = 'https://github.com/TomSchmidtDev/visualizer-lite'
const PAD = 6
const BUBBLE_W = 320
const BUBBLE_H = 150

export interface TourOverlayProps {
  state: OverlayState
  strings: TourStrings
  recordMode: boolean
  onControl: (c: Control) => void
}

function bubblePlacement(r: Rect, pref: Placement = 'auto') {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720
  const fitsBelow = r.y + r.height + PAD + 14 + BUBBLE_H < vh
  const fitsAbove = r.y - PAD - 14 - BUBBLE_H > 16
  const below = pref === 'above' ? !fitsAbove : pref === 'below' ? true : fitsBelow
  const left = Math.min(Math.max(16, r.x), Math.max(16, vw - BUBBLE_W - 16))
  const top = below ? r.y + r.height + PAD + 14 : Math.max(16, r.y - PAD - 14 - BUBBLE_H)
  const arrowX = Math.min(Math.max(20, r.x + r.width / 2 - left), BUBBLE_W - 28)
  return { left, top, below, arrowX }
}

function Cursor({ cursor }: { cursor: OverlayState['cursor'] }) {
  if (!cursor.visible) return null
  return (
    <div className={`tour-cursor${cursor.clicking ? ' clicking' : ''}`} style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.8 L9.6 12 L16 12 Z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function Toast({ text }: { text: string | null }) {
  return text ? <div className="tour-toast" role="status">{text}</div> : null
}

export function TourOverlay({ state, strings, recordMode, onControl }: TourOverlayProps) {
  const { phase, targetRect, caption } = state

  if (phase === 'free') {
    return (
      <div id="tour-overlay">
        <Toast text={state.toast} />
        {!recordMode && <button className="tour-pill" onClick={() => onControl('restart')}>↺ {strings.ui.restart}</button>}
      </div>
    )
  }

  if (phase === 'intro' || phase === 'outro') {
    const intro = phase === 'intro'
    return (
      <div id="tour-overlay">
        <div className="tour-scrim" />
        <div className="tour-card" role="dialog" aria-label={intro ? strings.intro.title : strings.outro.title}>
          {intro ? (
            <>
              <div className="tour-kicker">{strings.intro.kicker}</div>
              <h1>{strings.intro.title}</h1>
              <p className="tour-sub">{strings.intro.subtitle}</p>
              <ul>{strings.intro.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </>
          ) : (
            <>
              <h1>{strings.outro.title}</h1>
              <p className="tour-sub">{strings.outro.subtitle}</p>
              <pre className="tour-code">{strings.outro.install}</pre>
              <div className="tour-actions">
                <a className="tour-btn primary" href={REPO_URL} target="_blank" rel="noopener noreferrer">{strings.outro.repo}</a>
                {!recordMode && <button className="tour-btn" onClick={() => onControl('explore')}>{strings.ui.explore}</button>}
                {!recordMode && <button className="tour-btn" onClick={() => onControl('restart')}>{strings.ui.restart}</button>}
              </div>
            </>
          )}
        </div>
        <Toast text={state.toast} />
      </div>
    )
  }

  const place = targetRect ? bubblePlacement(targetRect, state.placement) : null
  const stepLabel = strings.ui.step.replace('{n}', String(state.stepIndex + 1)).replace('{total}', String(state.stepCount))

  return (
    <div id="tour-overlay">
      {targetRect && (
        <div
          className="tour-ring"
          style={{ left: `${targetRect.x - PAD}px`, top: `${targetRect.y - PAD}px`, width: `${targetRect.width + 2 * PAD}px`, height: `${targetRect.height + 2 * PAD}px` }}
        />
      )}
      {caption && (
        <div
          className={`tour-bubble${place ? (place.below ? ' below' : ' above') : ' centered'}`}
          style={place ? { left: `${place.left}px`, top: `${place.top}px`, ['--arrow-x' as string]: `${place.arrowX}px` } : undefined}
        >
          <b>{caption.title}</b>
          <p>{caption.body}</p>
          <div className="tour-step">
            <span>{stepLabel}</span>
            <span className="tour-progress"><i style={{ width: `${Math.round(state.progress * 100)}%` }} /></span>
          </div>
        </div>
      )}
      <Cursor cursor={state.cursor} />
      <Toast text={state.toast} />
      {!recordMode && (
        <div className="tour-controls">
          <button aria-label={strings.ui.prev} title={strings.ui.prev} onClick={() => onControl('prev')}>⏮</button>
          {state.paused
            ? <button aria-label={strings.ui.play} title={strings.ui.play} onClick={() => onControl('play')}>▶</button>
            : <button aria-label={strings.ui.pause} title={strings.ui.pause} onClick={() => onControl('pause')}>⏸</button>}
          <button aria-label={strings.ui.next} title={strings.ui.next} onClick={() => onControl('next')}>⏭</button>
          <button aria-label={strings.ui.exit} title={strings.ui.exit} onClick={() => onControl('exit')}>✕</button>
        </div>
      )}
    </div>
  )
}
