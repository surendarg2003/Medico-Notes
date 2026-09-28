const CACHE_NAME = 'freenotes-app-v1'
const APP_SHELL = ['./', './favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const indexResponse = await fetch('./index.html')
      if (!indexResponse.ok) throw new Error('Unable to cache the Medico Notes app shell.')
      await cache.put('./index.html', indexResponse.clone())
      const manifestResponse = await fetch('./precache-manifest.json')
      if (!manifestResponse.ok) throw new Error('Unable to load the offline asset list.')
      const assetPaths = await manifestResponse.json()
      if (!Array.isArray(assetPaths)) throw new Error('The offline asset list is invalid.')
      await cache.addAll([...APP_SHELL, './index.html', ...assetPaths])

      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('freenotes-app-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const requestUrl = new URL(request.url)
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match('./index.html')),
      ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse
      try {
        const response = await fetch(request)
        if (response.ok) {
          const copy = response.clone()
          await (await caches.open(CACHE_NAME)).put(request, copy)
        }
        return response
      } catch {
        return Response.error()
      }
    }),
  )
})
