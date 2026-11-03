// Tour state machine: intro → steps (auto-advance) → outro → free exploration.
import type { Caption } from '../i18n/types.js'
import type { RunnerState, Step, TourContext } from './types.js'
import { delay, isAbort, readingTimeMs } from './dom.js'

export const OUTRO_MS = 10_000
const RECORD_OUTRO_MS = 8000
const TICK_MS = 100

export interface RunnerDeps {
  createContext: (signal: AbortSignal) => TourContext
  getText: (stepId: string) => Caption
  onState: (s: RunnerState) => void
  recordMode: boolean
  /** Current location (path + search, without basename). */
  getLocation: () => string
  introMs?: number
}

export class TourRunner {
  private state: RunnerState
  private controller: AbortController | null = null
  private ticker: ReturnType<typeof setInterval> | undefined
  private readonly introMs: number

  constructor(private readonly steps: Step[], private readonly deps: RunnerDeps) {
    this.introMs = deps.introMs ?? 10_000
    this.state = { phase: 'intro', stepIndex: 0, stepCount: steps.length, stepId: null, target: null, progress: 0, paused: false }
  }

  start(): void { this.restart() }

  restart(): void {
    this.cancel()
    this.emit({ phase: 'intro', stepIndex: 0, stepId: null, target: null, progress: 0, paused: false })
    const signal = this.newSignal()
    delay(this.introMs, signal).then(() => this.runStep(0), () => {})
  }

  pause(): void {
    if (this.state.phase !== 'step' || this.state.paused) return
    this.cancel()
    this.emit({ paused: true })
  }

  play(): void {
    if (this.state.phase !== 'step') return
    void this.runStep(this.state.stepIndex)
  }

  next(): void {
    if (this.state.phase === 'intro') return void this.runStep(0)
    if (this.state.phase === 'step') void this.runStep(this.state.stepIndex + 1)
  }

  prev(): void {
    if (this.state.phase === 'step') void this.runStep(Math.max(0, this.state.stepIndex - 1))
    else if (this.state.phase === 'outro') void this.runStep(this.steps.length - 1)
  }

  exit(): void {
    this.cancel()
    this.emit({ phase: 'free', target: null, paused: false, progress: 0 })
  }

  /** Called for pointerdown events; a real visitor clicking into the app pauses the tour. */
  handleUserInteraction(e: { isTrusted: boolean; target: EventTarget | null }): void {
    if (this.deps.recordMode || !e.isTrusted) return
    const el = e.target as Element | null
    if (el?.closest?.('#tour-overlay')) return
    this.pause()
  }

  estimatedTotalMs(actionEstimateMs: Record<string, number> = {}): number {
    return this.introMs + OUTRO_MS + this.steps.reduce((sum, s) => sum + this.stepDurationMs(s, actionEstimateMs), 0)
  }

  private stepDurationMs(s: Step, est: Record<string, number> = {}): number {
    const c = this.deps.getText(s.id)
    return Math.max(readingTimeMs(c.title + ' ' + c.body), est[s.id] ?? 0) + (s.holdMs ?? 0)
  }

  private emit(patch: Partial<RunnerState>): void {
    this.state = { ...this.state, ...patch }
    this.deps.onState(this.state)
  }

  private newSignal(): AbortSignal {
    this.controller = new AbortController()
    return this.controller.signal
  }

  private cancel(): void {
    this.controller?.abort()
    this.controller = null
    clearInterval(this.ticker)
  }

  private async runStep(index: number): Promise<void> {
    this.cancel()
    if (index >= this.steps.length) return this.outro()
    const step = this.steps[index]
    const signal = this.newSignal()
    const ctx = this.deps.createContext(signal)
    this.emit({ phase: 'step', stepIndex: index, stepId: step.id, target: null, progress: 0, paused: false })

    const minMs = this.stepDurationMs({ ...step, holdMs: 0 })
    const start = Date.now()
    this.ticker = setInterval(() => {
      this.emit({ progress: Math.min(0.99, (Date.now() - start) / (minMs + (step.holdMs ?? 0))) })
    }, TICK_MS)

    try {
      if (step.route && this.deps.getLocation() !== step.route) await ctx.navigate(step.route)
      let found = true
      if (step.target) {
        found = (await ctx.waitFor(step.target)) != null
        if (found) this.emit({ target: step.target })
        else console.warn(`[tour] target not found, skipping action: ${step.id} → ${step.target}`)
      }
      if (found && step.action) await step.action(ctx)
      const rest = minMs - (Date.now() - start)
      if (rest > 0) await delay(rest, signal)
      if (step.holdMs) await delay(step.holdMs, signal)
    } catch (e) {
      if (isAbort(e) || signal.aborted) return
      console.warn(`[tour] step failed: ${step.id}`, e)
    }
    if (signal.aborted) return
    clearInterval(this.ticker)
    this.emit({ progress: 1 })
    void this.runStep(index + 1)
  }

  private outro(): void {
    this.cancel()
    this.emit({ phase: 'outro', target: null, progress: 0, paused: false })
    if (this.deps.recordMode) {
      const signal = this.newSignal()
      delay(RECORD_OUTRO_MS, signal).then(() => { (window as { __tourDone?: boolean }).__tourDone = true }, () => {})
    }
  }
}
