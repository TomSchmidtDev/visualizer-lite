// Hosts the tour next to the app routes: runs the storyboard and renders the overlay.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DemoDataset } from './data/types.js'
import { onToast } from './overlay/toast.js'
import { TourOverlay } from './overlay/TourOverlay.js'
import type { Control, OverlayState, Rect } from './overlay/types.js'
import { INITIAL_OVERLAY } from './overlay/types.js'
import type { RunnerState } from './engine/types.js'
import { TourRunner } from './engine/runner.js'
import { createDomContext, type CursorState } from './engine/context.js'
import { buildSteps } from './script/steps.js'
import { tourText } from './i18n/index.js'
import type { TourLang } from './lang.js'

export interface TourShellProps {
  dataset: DemoDataset
  recordMode: boolean
  autoStart: boolean
}

const langOf = (l: string | undefined): TourLang => (l?.startsWith('de') ? 'de' : 'en')

function sameRect(a: Rect | null, b: Rect | null) {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
}

export function TourShell({ dataset, recordMode, autoStart }: TourShellProps) {
  const { i18n } = useTranslation()
  const strings = tourText(langOf(i18n.language))
  const navigate = useNavigate()
  const location = useLocation()

  const navigateRef = useRef(navigate)
  const locationRef = useRef(location.pathname + location.search)
  navigateRef.current = navigate
  locationRef.current = location.pathname + location.search

  const [runnerState, setRunnerState] = useState<RunnerState>({
    phase: autoStart ? 'intro' : 'free', stepIndex: 0, stepCount: 0, stepId: null, target: null, progress: 0, paused: false,
  })
  const [cursor, setCursor] = useState<CursorState>(INITIAL_OVERLAY.cursor)
  const [toast, setToast] = useState<string | null>(null)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)

  const runner = useMemo(() => {
    const { steps } = buildSteps(dataset, langOf(i18n.language))
    return new TourRunner(steps, {
      createContext: (signal) => createDomContext(signal, { navigate: (p) => navigateRef.current(p), setCursor }),
      getText: (id) => tourText(langOf(i18n.language)).captions[id] ?? { title: id, body: '' },
      onState: setRunnerState,
      recordMode,
      getLocation: () => locationRef.current,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, recordMode])

  useEffect(() => onToast(setToast), [])

  useEffect(() => {
    if (!autoStart) return
    runner.start()
    return () => runner.exit()
  }, [runner, autoStart])

  // A real visitor clicking into the app pauses the tour.
  useEffect(() => {
    const onDown = (e: PointerEvent) => runner.handleUserInteraction(e)
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [runner])

  // Keep the ring on its target while the page scrolls, renders or resizes.
  useEffect(() => {
    const sel = runnerState.phase === 'step' ? runnerState.target : null
    if (!sel) { setTargetRect(null); return }
    let raf = 0
    const tick = () => {
      const el = document.querySelector(sel)
      const r = el?.getBoundingClientRect()
      const next = r && r.width > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null
      setTargetRect((prev) => (sameRect(prev, next) ? prev : next))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [runnerState.phase, runnerState.target])

  function onControl(c: Control) {
    switch (c) {
      case 'pause': return runner.pause()
      case 'play': return runner.play()
      case 'prev': return runner.prev()
      case 'next': return runner.next()
      case 'exit':
      case 'explore': setCursor((cur) => ({ ...cur, visible: false })); return runner.exit()
      case 'restart': {
        // Fresh demo state (the simulated import runs again): reload at the start page.
        const base = import.meta.env.BASE_URL
        window.location.assign(base + window.location.search)
      }
    }
  }

  const overlay: OverlayState = {
    phase: runnerState.phase,
    stepIndex: runnerState.stepIndex,
    stepCount: runnerState.stepCount,
    targetRect: runnerState.phase === 'step' ? targetRect : null,
    caption: runnerState.stepId ? strings.captions[runnerState.stepId] ?? null : null,
    progress: runnerState.progress,
    paused: runnerState.paused,
    placement: runnerState.placement,
    cursor: runnerState.phase === 'step' ? cursor : { ...cursor, visible: false },
    toast,
  }

  return <TourOverlay state={overlay} strings={strings} recordMode={recordMode} onControl={onControl} />
}
