const CACHE_NAME = 'freenotes-app-v2'

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href
}

async function cacheOptionalAssets() {
  const manifestResponse = await fetch(scopedUrl('./precache-manifest.json'))
  if (!manifestResponse.ok) throw new Error('Unable to load the offline asset list.')
  const assetPaths = await manifestResponse.json()
  if (!Array.isArray(assetPaths)) throw new Error('The offline asset list is invalid.')

  const cache = await caches.open(CACHE_NAME)
  // Keep download concurrency low. This warm-up runs after the app shell is
  // already usable and must not contend heavily with the user's connection.
  for (let offset = 0; offset < assetPaths.length; offset += 2) {
    const batch = assetPaths.slice(offset, offset + 2)
    await Promise.allSettled(batch.map(async (path) => {
      const url = scopedUrl(path)
      if (await cache.match(url)) return
      const response = await fetch(url)
      if (response.ok) await cache.put(url, response)
    }))
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const indexUrl = scopedUrl('./index.html')
    const response = await fetch(indexUrl)
    if (!response.ok) throw new Error('Unable to cache the Medico Notes app shell.')
    const html = await response.clone().text()
    await cache.put(indexUrl, response.clone())
    await cache.put(scopedUrl('./'), response.clone())
    await cache.put(scopedUrl('./index.html'), response)

    // The entry script and stylesheet are required before offline use is
    // possible. Optional feature chunks are warmed after activation instead
    // of blocking installation on slow connections.
    const entryAssets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)]
      .map((match) => new URL(match[1], indexUrl).href)
    await Promise.all(entryAssets.map(async (url) => {
      const asset = await fetch(url)
      if (!asset.ok) throw new Error(`Unable to cache app entry asset: ${url}`)
      await cache.put(url, asset)
    }))
    await cache.put(scopedUrl('./favicon.svg'), await fetch(scopedUrl('./favicon.svg')))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('freenotes-app-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    ))
    .then(() => self.clients.claim()))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_OFFLINE_ASSETS') {
    event.waitUntil(cacheOptionalAssets().catch((error) => {
      console.warn('Some optional Medico Notes assets could not be cached yet.', error)
    }))
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const requestUrl = new URL(request.url)
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    const refresh = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })
    // Keep the UI responsive on a slow connection: use the local shell now,
    // while a network copy updates the cache in the background.
    event.waitUntil(refresh.then(() => undefined).catch(() => undefined))
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      return (await cache.match(request)) ??
        (await cache.match(scopedUrl('./index.html'))) ??
        refresh.catch(() => Response.error())
    })())
    return
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request)
    if (cached) return cached

    try {
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    } catch {
      return Response.error()
    }
  })())
})
