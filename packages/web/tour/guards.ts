// Buttons that trigger a full page navigation (window.location.href = '/api/...')
// cannot be answered by the fetch shim. Intercept them before the app sees the click.
export type BlockedKind = 'export' | 'download' | 'logout'

const SELECTOR = '[data-tour="export"], [data-tour="download"], [data-tour="logout"]'

export function installDemoGuards(onBlocked: (kind: BlockedKind) => void): () => void {
  const listener = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.(SELECTOR)
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    onBlocked(el.getAttribute('data-tour') as BlockedKind)
  }
  document.addEventListener('click', listener, true)
  return () => document.removeEventListener('click', listener, true)
}
