// Kill-switch service worker — clears all stale caches and unregisters itself.
// This file must live at the same URL as any previously registered service worker
// so the browser picks it up as an update.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', async () => {
  const keys = await caches.keys()
  await Promise.all(keys.map(key => caches.delete(key)))
  await self.clients.claim()
  await self.registration.unregister()
})
