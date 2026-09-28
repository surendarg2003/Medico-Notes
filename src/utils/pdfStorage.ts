import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

const DATABASE_NAME = 'freenotes-pdf-assets'
const STORE_NAME = 'pdf-files'
const MAX_OPEN_DOCUMENTS = 2
const MAX_CONCURRENT_PAGE_RENDERS = 2

interface QueuedPageRender<T> {
  priority: boolean
  render: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

interface CachedPdfDocument {
  promise: Promise<PDFDocumentProxy>
  task: PDFDocumentLoadingTask
  touchedAt: number
}

const documentCache = new Map<string, CachedPdfDocument>()
const pendingDocuments = new Map<string, Promise<PDFDocumentProxy>>()
const pageRenderQueue: QueuedPageRender<unknown>[] = []
let activePageRenders = 0

function pumpPageRenderQueue() {
  while (activePageRenders < MAX_CONCURRENT_PAGE_RENDERS && pageRenderQueue.length > 0) {
    const queued = pageRenderQueue.shift()!
    activePageRenders += 1
    void queued.render().then(queued.resolve, queued.reject).finally(() => {
      activePageRenders -= 1
      pumpPageRenderQueue()
    })
  }
}

function schedulePageRender<T>(render: () => Promise<T>, priority: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const queued: QueuedPageRender<T> = { priority, render, resolve, reject }
    const insertionIndex = pageRenderQueue.findIndex((item) => !item.priority && priority)
    pageRenderQueue.splice(insertionIndex < 0 ? pageRenderQueue.length : insertionIndex, 0, queued as QueuedPageRender<unknown>)
    pumpPageRenderQueue()
  })
}

function trimDocumentCache(activeId: string) {
  const oldest = [...documentCache.entries()]
    .sort((left, right) => left[1].touchedAt - right[1].touchedAt)
  while (documentCache.size > MAX_OPEN_DOCUMENTS && oldest.length > 0) {
    const [oldestId, oldEntry] = oldest.shift()!
    if (oldestId === activeId) continue
    documentCache.delete(oldestId)
    void oldEntry.task.destroy().catch(() => undefined)
  }
}

export function registerPdfDocument(
  id: string,
  document: PDFDocumentProxy,
  task: PDFDocumentLoadingTask,
) {
  documentCache.set(id, {
    promise: Promise.resolve(document),
    task,
    touchedAt: Date.now(),
  })
  trimDocumentCache(id)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open PDF storage.'))
  })
}

export async function savePdfAsset(id: string, file: Blob): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(file, id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Unable to save the PDF.')) }
  })
}

export async function getPdfAsset(id: string): Promise<Blob> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(id)
    request.onsuccess = () => {
      if (request.result instanceof Blob) resolve(request.result)
      else reject(new Error('This PDF is no longer available on this device.'))
    }
    request.onerror = () => reject(request.error ?? new Error('Unable to read the PDF.'))
    transaction.oncomplete = () => database.close()
  })
}

export async function deletePdfAsset(id: string): Promise<void> {
  const cached = documentCache.get(id)
  documentCache.delete(id)
  if (cached) void cached.task.destroy().catch(() => undefined)

  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Unable to remove the PDF.')) }
  })
}

async function loadPdfDocument(id: string): Promise<PDFDocumentProxy> {
  const cached = documentCache.get(id)
  if (cached) {
    cached.touchedAt = Date.now()
    return cached.promise
  }
  const pending = pendingDocuments.get(id)
  if (pending) return pending

  const loadPromise = (async () => {
    const source = await getPdfAsset(id)
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    const task = pdfjs.getDocument({ data: new Uint8Array(await source.arrayBuffer()) })
    const entry: CachedPdfDocument = {
      task,
      promise: task.promise,
      touchedAt: Date.now(),
    }
    documentCache.set(id, entry)
    try {
      const document = await entry.promise
      trimDocumentCache(id)
      return document
    } catch (error) {
      if (documentCache.get(id) === entry) documentCache.delete(id)
      throw error
    }
  })()
  pendingDocuments.set(id, loadPromise)
  try {
    return await loadPromise
  } finally {
    if (pendingDocuments.get(id) === loadPromise) pendingDocuments.delete(id)
  }
}

export async function renderPdfPageImage(
  assetId: string,
  pageNumber: number,
  maxDimension = 2800,
  extractText = false,
  priority = false,
): Promise<{ url: string; text: string }> {
  return schedulePageRender(async () => {
    const pdf = await loadPdfDocument(assetId)
    const page = await pdf.getPage(pageNumber)
    const pageWidth = Math.abs(page.view[2] - page.view[0])
    const pageHeight = Math.abs(page.view[3] - page.view[1])
    const pixelBudgetScale = Math.sqrt(8_500_000 / (pageWidth * pageHeight))
    const viewport = page.getViewport({
      scale: Math.min(maxDimension / Math.max(pageWidth, pageHeight), pixelBudgetScale),
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to render this PDF page.')

    try {
      const [blob, textContent] = await Promise.all([
        page.render({ canvas, canvasContext: context, viewport }).promise.then(() =>
          new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((image) => image
              ? resolve(image)
              : reject(new Error('Unable to encode this PDF page.')), 'image/jpeg', 0.92)
          }),
        ),
        // Text indexing is optional. A damaged or unsupported text layer must
        // never discard a page image that rendered successfully.
        extractText ? page.getTextContent().catch(() => null) : Promise.resolve(null),
      ])
      return {
        url: URL.createObjectURL(blob),
        text: textContent
          ? textContent.items
              .map((item) => ('str' in item ? item.str : ''))
              .filter(Boolean)
              .join(' ')
          : '',
      }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  }, priority)
}

export async function extractPdfPageText(assetId: string, pageNumber: number): Promise<string> {
  const pdf = await loadPdfDocument(assetId)
  const page = await pdf.getPage(pageNumber)
  const textContent = await page.getTextContent()
  return textContent.items
    .map((item) => ('str' in item ? item.str : ''))
    .filter(Boolean)
    .join(' ')
}
