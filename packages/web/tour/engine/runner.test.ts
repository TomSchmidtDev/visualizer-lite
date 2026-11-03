import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TourRunner } from './runner.js'
import { delay } from './dom.js'
import type { RunnerState, Step, TourContext } from './types.js'

const SHORT = { title: 'T', body: 'B' } // readingTime 3500 ms
const INTRO = 1000

function harness(steps: Step[], opts: { recordMode?: boolean; missing?: string[]; location?: string } = {}) {
  const states: RunnerState[] = []
  let location = opts.location ?? '/'
  const navigate = vi.fn(async (p: string) => { location = p })
  const signals: AbortSignal[] = []
  const revealed: string[] = []
  const createContext = (signal: AbortSignal): TourContext => {
    signals.push(signal)
    return {
      navigate,
      click: async () => {}, select: async () => {}, type: async () => {}, hover: async () => {}, scrollTo: async () => {},
      reveal: async (sel: string) => { revealed.push(sel) },
      waitFor: async (sel) => (opts.missing?.includes(sel) ? null : document.body),
      wait: (ms) => delay(ms, signal),
      signal,
    }
  }
  const runner = new TourRunner(steps, {
    createContext,
    getText: () => SHORT,
    onState: (s) => states.push(s),
    recordMode: opts.recordMode ?? false,
    getLocation: () => location,
    introMs: INTRO,
  })
  const last = () => states[states.length - 1]
  return { runner, states, last, navigate, signals, revealed, setLocation: (l: string) => { location = l } }
}

describe('TourRunner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); delete (window as { __tourDone?: boolean }).__tourDone })

  it('runs intro, steps in order, then the outro', async () => {
    const h = harness([{ id: 'a' }, { id: 'b' }])
    h.runner.start()
    expect(h.last().phase).toBe('intro')
    await vi.advanceTimersByTimeAsync(INTRO + 50)
    expect(h.last()).toMatchObject({ phase: 'step', stepId: 'a', stepIndex: 0, stepCount: 2 })
    await vi.advanceTimersByTimeAsync(3600)
    expect(h.last().stepId).toBe('b')
    await vi.advanceTimersByTimeAsync(3600)
    expect(h.last().phase).toBe('outro')
  })

  it('a step lasts at least its reading time and reports progress', async () => {
    const h = harness([{ id: 'a' }, { id: 'b' }])
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 3000)
    expect(h.last().stepId).toBe('a')
    expect(h.last().progress).toBeGreaterThan(0.7)
    expect(h.last().progress).toBeLessThan(1)
  })

  it('pause stops the tour; play restarts the current step', async () => {
    const h = harness([{ id: 'a' }, { id: 'b' }])
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 2000)
    h.runner.pause()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(h.last()).toMatchObject({ stepId: 'a', paused: true })
    h.runner.play()
    expect(h.last()).toMatchObject({ stepId: 'a', paused: false, progress: 0 })
    await vi.advanceTimersByTimeAsync(3600)
    expect(h.last().stepId).toBe('b')
  })

  it("resumes on the step's route after the visitor navigated away", async () => {
    const h = harness([{ id: 'a', route: '/stats' }, { id: 'b' }], { location: '/stats' })
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 50)
    expect(h.navigate).not.toHaveBeenCalled()
    h.runner.pause()
    h.setLocation('/settings')
    h.runner.play()
    await vi.advanceTimersByTimeAsync(50)
    expect(h.navigate).toHaveBeenCalledWith('/stats')
  })

  it('after the visitor navigated away, play restarts from the nearest step with a route', async () => {
    const h = harness([{ id: 'a', route: '/settings' }, { id: 'b' }, { id: 'c' }], { location: '/settings' })
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 3600)
    expect(h.last().stepId).toBe('b')
    h.runner.pause()
    h.setLocation('/stats')
    h.runner.play()
    await vi.advanceTimersByTimeAsync(50)
    expect(h.last().stepId).toBe('a')
    expect(h.navigate).toHaveBeenCalledWith('/settings')
  })

  it('play without navigation resumes the same step', async () => {
    const h = harness([{ id: 'a', route: '/settings' }, { id: 'b' }], { location: '/settings' })
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 3600)
    h.runner.pause()
    h.runner.play()
    expect(h.last().stepId).toBe('b')
  })

  it('reveals the target once it is found', async () => {
    const h = harness([{ id: 'a', target: '#t' }])
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 50)
    expect(h.revealed).toContain('#t')
  })

  it('skips the action when the target never appears, but still advances', async () => {
    const action = vi.fn(async () => {})
    const h = harness([{ id: 'a', target: '#missing', action }, { id: 'b' }], { missing: ['#missing'] })
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 3600)
    expect(action).not.toHaveBeenCalled()
    expect(h.last().stepId).toBe('b')
  })

  it('a trusted pointerdown inside the app pauses; untrusted or overlay clicks do not', async () => {
    const h = harness([{ id: 'a' }, { id: 'b' }])
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 50)
    const overlay = document.createElement('div'); overlay.id = 'tour-overlay'; document.body.appendChild(overlay)
    h.runner.handleUserInteraction({ isTrusted: false, target: document.body })
    h.runner.handleUserInteraction({ isTrusted: true, target: overlay })
    expect(h.last().paused).toBe(false)
    h.runner.handleUserInteraction({ isTrusted: true, target: document.body })
    expect(h.last().paused).toBe(true)
    overlay.remove()
  })

  it('record mode ignores visitor interaction and sets window.__tourDone after the outro', async () => {
    const h = harness([{ id: 'a' }], { recordMode: true })
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 50)
    h.runner.handleUserInteraction({ isTrusted: true, target: document.body })
    expect(h.last().paused).toBe(false)
    await vi.advanceTimersByTimeAsync(3600)
    expect(h.last().phase).toBe('outro')
    expect((window as { __tourDone?: boolean }).__tourDone).toBeUndefined()
    await vi.advanceTimersByTimeAsync(10_000)
    expect((window as { __tourDone?: boolean }).__tourDone).toBe(true)
  })

  it('next and prev abort the running action', async () => {
    let aborted = false
    const h = harness([
      { id: 'a', action: async (ctx) => { try { await ctx.wait(60_000) } catch { aborted = ctx.signal.aborted } } },
      { id: 'b' },
    ])
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 100)
    h.runner.next()
    await vi.advanceTimersByTimeAsync(10)
    expect(aborted).toBe(true)
    expect(h.last().stepId).toBe('b')
    h.runner.prev()
    await vi.advanceTimersByTimeAsync(10)
    expect(h.last().stepId).toBe('a')
  })

  it('exit switches to free exploration; restart begins with the intro', async () => {
    const h = harness([{ id: 'a' }])
    h.runner.start()
    await vi.advanceTimersByTimeAsync(INTRO + 50)
    h.runner.exit()
    expect(h.last().phase).toBe('free')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(h.last().phase).toBe('free')
    h.runner.restart()
    expect(h.last().phase).toBe('intro')
  })

  it('estimates the total duration from reading time, estimates and holds', () => {
    const h = harness([{ id: 'a', holdMs: 500 }, { id: 'b' }])
    expect(h.runner.estimatedTotalMs({ b: 8000 })).toBe(INTRO + 3500 + 500 + 8000 + 10_000)
  })
})
