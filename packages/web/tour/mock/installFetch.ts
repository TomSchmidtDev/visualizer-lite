// Replaces window.fetch so that /api/ requests are answered by the demo handler.
export function installFetch(handler: (req: Request) => Promise<Response>, base = '/'): () => void {
  const original = globalThis.fetch
  const prefix = base.replace(/\/$/, '')

  const shim: typeof fetch = (input, init) => {
    const raw = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
    const url = new URL(raw, globalThis.location?.href ?? 'http://localhost/')
    const local = prefix && url.pathname.startsWith(prefix + '/') ? url.pathname.slice(prefix.length) : url.pathname
    if (!local.startsWith('/api/')) return original(input, init)
    return handler(input instanceof Request && !init ? input : new Request(url.href, init))
  }

  globalThis.fetch = shim
  return () => { if (globalThis.fetch === shim) globalThis.fetch = original }
}
