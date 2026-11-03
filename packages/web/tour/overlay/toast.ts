// Tiny pub/sub for the demo toast, shared by guards (producer) and overlay (consumer).
type Listener = (msg: string | null) => void
const listeners = new Set<Listener>()
let timer: ReturnType<typeof setTimeout> | undefined

export function showToast(msg: string, ms = 3500): void {
  listeners.forEach((l) => l(msg))
  clearTimeout(timer)
  timer = setTimeout(() => listeners.forEach((l) => l(null)), ms)
}

export function onToast(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
