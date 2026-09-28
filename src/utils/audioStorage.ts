export interface AudioRecording {
  id: string
  notebookId: string
  title: string
  createdAt: number
  blob: Blob
}

const DATABASE_NAME = 'freenotes-media'
const STORE_NAME = 'audio-recordings'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('notebookId', 'notebookId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open audio storage.'))
  })
}

export async function listAudioRecordings(notebookId: string): Promise<AudioRecording[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).index('notebookId').getAll(notebookId)
    request.onsuccess = () => resolve((request.result as AudioRecording[]).sort((a, b) => a.createdAt - b.createdAt))
    request.onerror = () => reject(request.error ?? new Error('Unable to load audio recordings.'))
    transaction.oncomplete = () => database.close()
  })
}

export async function saveAudioRecording(recording: AudioRecording): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(recording)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Unable to save recording.')) }
  })
}

export async function deleteAudioRecording(id: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Unable to delete recording.')) }
  })
}
