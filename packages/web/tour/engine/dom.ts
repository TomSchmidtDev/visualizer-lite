// DOM helpers for driving the real app like a user would.

export const readingTimeMs = (text: string): number => Math.min(12_000, Math.max(3500, 1500 + 45 * text.length))

export function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

export const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError'

/** setTimeout as a promise that rejects with AbortError when the signal aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(t); reject(abortError()) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Polls for a selector; resolves null after the timeout. */
export async function waitFor(selector: string, timeoutMs = 5000, signal?: AbortSignal): Promise<Element | null> {
  const end = Date.now() + timeoutMs
  for (;;) {
    const el = document.querySelector(selector)
    if (el) return el
    if (Date.now() >= end) return null
    await delay(100, signal)
  }
}

function setNativeValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
}

/** Sets a <select> value so React's onChange fires (React tracks the native value setter). */
export function setSelectValue(el: HTMLSelectElement, value: string): void {
  setNativeValue(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  setNativeValue(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Moves a synthetic mouse over an element (or its uPlot overlay) at a fractional position. */
export function hoverAt(el: Element, xFrac: number, yFrac = 0.5): { x: number; y: number } {
  const target = el.querySelector('.u-over') ?? el
  const r = target.getBoundingClientRect()
  const x = r.left + r.width * xFrac
  const y = r.top + r.height * yFrac
  for (const type of ['mouseenter', 'mouseover', 'mousemove']) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: type !== 'mouseenter', clientX: x, clientY: y }))
  }
  return { x, y }
}
