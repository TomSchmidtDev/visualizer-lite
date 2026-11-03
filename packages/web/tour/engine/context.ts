// TourContext backed by the real DOM: a fake cursor travels to each element before acting.
import type { TourContext } from './types.js'
import { delay, hoverAt, setInputValue, setSelectValue, waitFor } from './dom.js'

export interface CursorState { x: number; y: number; clicking: boolean; visible: boolean }

export interface DomContextDeps {
  navigate: (path: string) => void
  setCursor: (c: CursorState) => void
  /** Multiplier for all animation pauses (0 in tests). Default 1. */
  speed?: number
}

const MOVE_MS = 750   // matches the cursor CSS transition
const SCROLL_MS = 450
const CLICK_MS = 250
const TYPE_MS = 60

export function createDomContext(signal: AbortSignal, deps: DomContextDeps): TourContext {
  const k = deps.speed ?? 1
  const wait = (ms: number) => delay(ms * k, signal)
  let cursor: CursorState = { x: 0, y: 0, clicking: false, visible: false }
  const setCursor = (patch: Partial<CursorState>) => { cursor = { ...cursor, ...patch }; deps.setCursor(cursor) }

  async function reach(selector: string): Promise<HTMLElement | null> {
    const el = (await waitFor(selector, 5000, signal)) as HTMLElement | null
    if (!el) { console.warn(`[tour] element not found: ${selector}`); return null }
    const r0 = el.getBoundingClientRect()
    if (r0.top < 60 || r0.bottom > window.innerHeight - 60) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      await wait(SCROLL_MS)
    }
    const r = el.getBoundingClientRect()
    setCursor({ x: r.left + r.width / 2, y: r.top + r.height / 2, visible: true })
    await wait(MOVE_MS)
    return el
  }

  async function press(el: HTMLElement) {
    setCursor({ clicking: true })
    await wait(CLICK_MS)
    setCursor({ clicking: false })
  }

  return {
    signal,
    wait,
    waitFor: (selector, timeoutMs) => waitFor(selector, timeoutMs, signal),
    async navigate(path) {
      deps.navigate(path)
      await wait(400)
    },
    async click(selector) {
      const el = await reach(selector)
      if (!el) return
      await press(el)
      el.click()
    },
    async select(selector, value) {
      const el = await reach(selector)
      if (!el) return
      await press(el)
      setSelectValue(el as unknown as HTMLSelectElement, value)
    },
    async type(selector, text) {
      const el = await reach(selector)
      if (!el) return
      await press(el)
      el.focus()
      for (let i = 1; i <= text.length; i++) {
        setInputValue(el as HTMLInputElement, text.slice(0, i))
        await wait(TYPE_MS)
      }
    },
    async hover(selector, xFrac, yFrac = 0.5) {
      const el = await reach(selector)
      if (!el) return
      const p = hoverAt(el, xFrac, yFrac)
      setCursor({ x: p.x, y: p.y })
      await wait(MOVE_MS)
    },
    async scrollTo(selector) {
      const el = (await waitFor(selector, 5000, signal)) as HTMLElement | null
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      await wait(SCROLL_MS * 2)
    },
  }
}
