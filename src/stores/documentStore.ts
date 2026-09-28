import { create } from 'zustand'
import type {
  Notebook,
  Page,
  StrokeElement,
  TextElement,
} from '../types/document'

interface DocumentState {
  notebook: Notebook | null
  notebooks: Notebook[]
  activeNotebookId: string | null
  pinnedNotebookIds: string[]
  folders: Folder[]
  notebookFolderIds: Record<string, string | null>
  history: Notebook[]
  future: Notebook[]
  createNotebook: (title?: string) => void
  switchNotebook: (notebookId: string) => void
  renameNotebook: (notebookId: string, title: string) => void
  deleteNotebook: (notebookId: string) => boolean
  reorderNotebook: (notebookId: string, targetIndex: number) => void
  toggleNotebookPinned: (notebookId: string) => void
  createFolder: (title?: string) => void
  renameFolder: (folderId: string, title: string) => void
  deleteFolder: (folderId: string) => boolean
  setNotebookFolder: (notebookId: string, folderId: string | null) => void
  addPage: () => string | null
  duplicatePage: (pageId: string) => string | null
  deletePage: (pageId: string) => boolean
  renamePage: (pageId: string, title: string) => void
  setNotebookTitle: (title: string) => void
  setPageBackground: (
    pageId: string,
    background: Page['background'],
  ) => void
  addStroke: (pageId: string, stroke: StrokeElement) => void
  removeStroke: (
    pageId: string,
    strokeId: string,
  ) => void
  addText: (pageId: string, text: TextElement) => void
  updateText: (
    pageId: string,
    textId: string,
    text: string,
  ) => void
  removeText: (
    pageId: string,
    textId: string,
  ) => void
  undo: () => void
  redo: () => void
}

function createPage(pageNumber = 1): Page {
  return {
    id: crypto.randomUUID(),
    title: `Page ${pageNumber}`,
    elements: [],
    background: 'plain',
  }
}

function cloneNotebook(
  notebook: Notebook,
): Notebook {
  return structuredClone(notebook)
}

function clonePage(page: Page): Page {
  const clonedPage = structuredClone(page)

  clonedPage.id = crypto.randomUUID()
  clonedPage.title = `${page.title} Copy`

  clonedPage.elements =
    clonedPage.elements.map(
      (element) => ({
        ...element,
        id: crypto.randomUUID(),
      }),
    )

  return clonedPage
}

const STORAGE_KEY =
  'freenotes-notebooks'

const LEGACY_STORAGE_KEY =
  'freenotes-document'

export interface Folder {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

interface NotebookStorage {
  notebooks: Notebook[]
  activeNotebookId: string | null
  pinnedNotebookIds: string[]
  folders: Folder[]
  notebookFolderIds: Record<string, string | null>
}

function loadNotebookStorage(): NotebookStorage {
  try {
    const saved = localStorage.getItem(
      STORAGE_KEY,
    )

    if (saved) {
      const parsed = JSON.parse(saved)

      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray(parsed.notebooks)
      ) {
        const loadedNotebooks =
          parsed.notebooks.filter(
            (item: unknown): item is Notebook =>
              !!item &&
              typeof item === 'object' &&
              Array.isArray(
                (item as Notebook).pages,
              ),
          )

        const notebooks: Notebook[] = loadedNotebooks.map((notebook: Notebook) => ({
          ...notebook,
          pages: notebook.pages.map((page) =>
            (page.background as string) === 'cornell'
              ? { ...page, background: 'plain' }
              : page,
          ),
        }))

        if (loadedNotebooks.some((notebook: Notebook) =>
          notebook.pages.some((page) => (page.background as string) === 'cornell'),
        )) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, notebooks }))
        }

        const folders: Folder[] = Array.isArray(parsed.folders)
          ? parsed.folders.filter(
              (item: unknown): item is Folder =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as Folder).id === 'string' &&
                typeof (item as Folder).title === 'string',
            )
          : []

        const rawNotebookFolderIds =
          parsed.notebookFolderIds &&
          typeof parsed.notebookFolderIds === 'object'
            ? parsed.notebookFolderIds as Record<string, unknown>
            : {}

        const validFolderIds = new Set(
          folders.map((folder) => folder.id),
        )

        const notebookFolderIds: Record<string, string | null> = {}
        notebooks.forEach((notebook: Notebook) => {
          const folderId = rawNotebookFolderIds[notebook.id]
          notebookFolderIds[notebook.id] =
            typeof folderId === 'string' && validFolderIds.has(folderId)
              ? folderId
              : null
        })

        const storedPinnedNotebookIds =
          Array.isArray(parsed.pinnedNotebookIds)
            ? parsed.pinnedNotebookIds.filter(
                (id: unknown): id is string =>
                  typeof id === 'string',
              )
            : []

        const pinnedNotebookIds =
          storedPinnedNotebookIds.filter((id: string) =>
            notebooks.some(
              (notebook: Notebook) =>
                notebook.id === id,
            ),
          )

        const activeNotebookId =
          typeof parsed.activeNotebookId ===
            'string' &&
          notebooks.some(
            (notebook: Notebook) =>
  notebook.id ===
  parsed.activeNotebookId,
          )
            ? parsed.activeNotebookId
            : notebooks[0]?.id ?? null

        return {
          notebooks,
          activeNotebookId,
          pinnedNotebookIds,
          folders,
          notebookFolderIds,
        }
      }
    }

    /*
     * Migrate the previous single-notebook
     * storage format.
     */
    const legacy = localStorage.getItem(
      LEGACY_STORAGE_KEY,
    )

    if (legacy) {
      const parsedLegacy =
        JSON.parse(legacy)

      if (
        parsedLegacy &&
        typeof parsedLegacy === 'object' &&
        Array.isArray(parsedLegacy.pages)
      ) {
        const notebook =
          parsedLegacy as Notebook

        return {
          notebooks: [notebook],
          activeNotebookId: notebook.id,
          pinnedNotebookIds: [],
          folders: [],
          notebookFolderIds: {},
        }
      }
    }

    return {
      notebooks: [],
      activeNotebookId: null,
      pinnedNotebookIds: [],
      folders: [],
      notebookFolderIds: {},
    }
  } catch {
    return {
      notebooks: [],
      activeNotebookId: null,
      pinnedNotebookIds: [],
      folders: [],
      notebookFolderIds: {},
    }
  }
}

interface NotebookStorageSnapshot {
  notebooks: Notebook[]
  activeNotebookId: string | null
  pinnedNotebookIds: string[]
  folders: Folder[]
  notebookFolderIds: Record<string, string | null>
}

let pendingStorageSnapshot: NotebookStorageSnapshot | null = null
let storageSaveTimer: ReturnType<typeof setTimeout> | null = null

function flushNotebookStorage() {
  if (!pendingStorageSnapshot) return

  if (storageSaveTimer) {
    clearTimeout(storageSaveTimer)
    storageSaveTimer = null
  }

  const snapshot = pendingStorageSnapshot
  pendingStorageSnapshot = null

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore storage errors so the editor continues to work normally.
  }
}

function saveNotebookStorage(
  notebooks: Notebook[],
  activeNotebookId: string | null,
  pinnedNotebookIds: string[] = [],
  folders: Folder[] = [],
  notebookFolderIds: Record<string, string | null> = {},
) {
  pendingStorageSnapshot = {
    notebooks,
    activeNotebookId,
    pinnedNotebookIds,
    folders,
    notebookFolderIds,
  }

  if (storageSaveTimer) clearTimeout(storageSaveTimer)
  storageSaveTimer = setTimeout(flushNotebookStorage, 300)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNotebookStorage)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNotebookStorage()
  })
}

const initialStorage =
  loadNotebookStorage()

const initialNotebook =
  initialStorage.notebooks.find(
    (notebook) =>
      notebook.id ===
      initialStorage.activeNotebookId,
  ) ??
  initialStorage.notebooks[0] ??
  null

const initialActiveNotebookId =
  initialNotebook?.id ?? null

export const useDocumentStore =
  create<DocumentState>((set) => ({
    notebook: initialNotebook,
    notebooks: initialStorage.notebooks,
    activeNotebookId:
      initialActiveNotebookId,
    history: [],
    future: [],
    pinnedNotebookIds: initialStorage.pinnedNotebookIds,
    folders: initialStorage.folders,
    notebookFolderIds: initialStorage.notebookFolderIds,

    createNotebook: (
      title = 'Untitled Note',
    ) => {
      const now = Date.now()

      const notebook: Notebook = {
        id: crypto.randomUUID(),
        title,
        createdAt: now,
        updatedAt: now,
        pages: [createPage()],
      }

      set((state) => {
        const notebooks = [
          ...state.notebooks,
          notebook,
        ]

        saveNotebookStorage(
          notebooks,
          notebook.id,
          state.pinnedNotebookIds,
          state.folders,
          state.notebookFolderIds,
        )

        return {
          notebooks,
          activeNotebookId:
            notebook.id,
          notebook,
          history: [],
          future: [],
        }
      })
    },

    switchNotebook: (notebookId) => {
      set((state) => {
        const targetNotebook =
          state.notebooks.find(
            (notebook) =>
              notebook.id ===
              notebookId,
          )

        if (!targetNotebook) {
          return state
        }

        saveNotebookStorage(
          state.notebooks,
          notebookId,
          state.pinnedNotebookIds,
          state.folders,
          state.notebookFolderIds,
        )

        return {
          notebook:
            cloneNotebook(
              targetNotebook,
            ),
          activeNotebookId:
            notebookId,
          history: [],
          future: [],
        }
      })
    },

    renameNotebook: (
      notebookId,
      title,
    ) => {
      const trimmedTitle =
        title.trim()

      if (!trimmedTitle) {
        return
      }

      set((state) => {
        const targetNotebook =
          state.notebooks.find(
            (notebook) =>
              notebook.id ===
              notebookId,
          )

        if (!targetNotebook) {
          return state
        }

        const notebooks =
          state.notebooks.map(
            (notebook) =>
              notebook.id === notebookId
                ? {
                    ...notebook,
                    title:
                      trimmedTitle,
                    updatedAt:
                      Date.now(),
                  }
                : notebook,
          )

        const updatedNotebook =
          notebooks.find(
            (notebook) =>
              notebook.id ===
              notebookId,
          )!

        saveNotebookStorage(
          notebooks,
          state.activeNotebookId,
          state.pinnedNotebookIds,
          state.folders,
          state.notebookFolderIds,
        )

        return {
          notebooks,
          notebook:
            state.activeNotebookId ===
            notebookId
              ? updatedNotebook
              : state.notebook,
          history:
            state.activeNotebookId ===
            notebookId &&
            state.notebook
              ? [
                  ...state.history,
                  cloneNotebook(
                    state.notebook,
                  ),
                ]
              : state.history,
          future:
            state.activeNotebookId ===
            notebookId
              ? []
              : state.future,
        }
      })
    },

    deleteNotebook: (notebookId) => {
      let deleted = false

      set((state) => {
        const index =
          state.notebooks.findIndex(
            (notebook) =>
              notebook.id ===
              notebookId,
          )

        if (index === -1) {
          return state
        }

        const notebooks =
          state.notebooks.filter(
            (notebook) =>
              notebook.id !==
              notebookId,
          )

        let activeNotebookId =
          state.activeNotebookId

        let notebook =
          state.notebook

        let history =
          state.history

        let future =
          state.future

        if (
          activeNotebookId ===
          notebookId
        ) {
          const replacement =
            notebooks[
              Math.min(
                index,
                notebooks.length - 1,
              )
            ] ?? null

          activeNotebookId =
            replacement?.id ??
            null

          notebook =
            replacement
              ? cloneNotebook(
                  replacement,
                )
              : null

          history = []
          future = []
        }

        deleted = true

        saveNotebookStorage(
          notebooks,
          activeNotebookId,
          state.pinnedNotebookIds.filter((id) =>
            notebooks.some((notebook) => notebook.id === id),
          ),
        )

        return {
          notebooks,
          activeNotebookId,
          notebook,
          history,
          future,
        }
      })

      return deleted
    },

    reorderNotebook: (notebookId, targetIndex) => {
      set((state) => {
        const currentIndex = state.notebooks.findIndex(
          (notebook) => notebook.id === notebookId,
        )

        if (
          currentIndex === -1 ||
          targetIndex < 0 ||
          targetIndex >= state.notebooks.length ||
          currentIndex === targetIndex
        ) {
          return state
        }

        const notebooks = [...state.notebooks]
        const [movedNotebook] = notebooks.splice(
          currentIndex,
          1,
        )

        notebooks.splice(
          targetIndex,
          0,
          movedNotebook,
        )

        saveNotebookStorage(
          notebooks,
          state.activeNotebookId,
          state.pinnedNotebookIds,
          state.folders,
          state.notebookFolderIds,
        )

        return {
          notebooks,
        }
      })
    },

    toggleNotebookPinned: (notebookId) => {
      set((state) => {
        const exists = state.notebooks.some(
          (notebook) => notebook.id === notebookId,
        )

        if (!exists) {
          return state
        }

        const isPinned = state.pinnedNotebookIds.includes(
          notebookId,
        )

        const pinnedNotebookIds = isPinned
          ? state.pinnedNotebookIds.filter(
              (id) => id !== notebookId,
            )
          : [...state.pinnedNotebookIds, notebookId]

        saveNotebookStorage(
          state.notebooks,
          state.activeNotebookId,
          pinnedNotebookIds,
        )

        return {
          pinnedNotebookIds,
        }
      })
    },

    createFolder: (title = 'New Folder') => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) return

      const now = Date.now()
      const folder: Folder = {
        id: crypto.randomUUID(),
        title: trimmedTitle,
        createdAt: now,
        updatedAt: now,
      }

      set((state) => {
        const folders = [...state.folders, folder]
        saveNotebookStorage(
          state.notebooks,
          state.activeNotebookId,
          state.pinnedNotebookIds,
          folders,
          state.notebookFolderIds,
        )
        return { folders }
      })
    },

    renameFolder: (folderId, title) => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) return

      set((state) => {
        const exists = state.folders.some((folder) => folder.id === folderId)
        if (!exists) return state

        const folders = state.folders.map((folder) =>
          folder.id === folderId
            ? { ...folder, title: trimmedTitle, updatedAt: Date.now() }
            : folder,
        )

        saveNotebookStorage(
          state.notebooks,
          state.activeNotebookId,
          state.pinnedNotebookIds,
          folders,
          state.notebookFolderIds,
        )
        return { folders }
      })
    },

    deleteFolder: (folderId) => {
      let deleted = false

      set((state) => {
        if (!state.folders.some((folder) => folder.id === folderId)) {
          return state
        }

        const folders = state.folders.filter((folder) => folder.id !== folderId)
        const notebookFolderIds = { ...state.notebookFolderIds }

        Object.keys(notebookFolderIds).forEach((notebookId) => {
          if (notebookFolderIds[notebookId] === folderId) {
            notebookFolderIds[notebookId] = null
          }
        })

        deleted = true
        saveNotebookStorage(
          state.notebooks,
          state.activeNotebookId,
          state.pinnedNotebookIds,
          folders,
          notebookFolderIds,
        )
        return { folders, notebookFolderIds }
      })

      return deleted
    },

    setNotebookFolder: (notebookId, folderId) => {
      set((state) => {
        if (!state.notebooks.some((item) => item.id === notebookId)) return state
        if (folderId !== null && !state.folders.some((item) => item.id === folderId)) return state
        const notebookFolderIds = { ...state.notebookFolderIds, [notebookId]: folderId }
        saveNotebookStorage(state.notebooks, state.activeNotebookId, state.pinnedNotebookIds, state.folders, notebookFolderIds)
        return { notebookFolderIds }
      })
    },

    addPage: () => {
      let newPageId: string | null =
        null

      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pageNumber =
          state.notebook.pages.length +
          1

        const newPage =
          createPage(pageNumber)

        newPageId =
          newPage.id

        const notebook: Notebook = {
          ...state.notebook,
          pages: [
            ...state.notebook.pages,
            newPage,
          ],
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })

      return newPageId
    },

    duplicatePage: (pageId) => {
      let newPageId: string | null =
        null

      set((state) => {
        if (!state.notebook) {
          return state
        }

        const pageIndex =
          state.notebook.pages.findIndex(
            (page) =>
              page.id === pageId,
          )

        if (pageIndex === -1) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const originalPage =
          state.notebook.pages[
            pageIndex
          ]

        const newPage =
          clonePage(originalPage)

        newPageId =
          newPage.id

        const pages = [
          ...state.notebook.pages,
        ]

        pages.splice(
          pageIndex + 1,
          0,
          newPage,
        )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })

      return newPageId
    },

    deletePage: (pageId) => {
      let deleted = false

      set((state) => {
        if (!state.notebook) {
          return state
        }

        if (
          state.notebook.pages.length <=
          1
        ) {
          return state
        }

        const pageExists =
          state.notebook.pages.some(
            (page) =>
              page.id === pageId,
          )

        if (!pageExists) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.filter(
            (page) =>
              page.id !== pageId,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        deleted = true

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })

      return deleted
    },

    renamePage: (
      pageId,
      title,
    ) => {
      const trimmedTitle =
        title.trim()

      if (!trimmedTitle) {
        return
      }

      set((state) => {
        if (!state.notebook) {
          return state
        }

        const pageExists =
          state.notebook.pages.some(
            (page) =>
              page.id === pageId,
          )

        if (!pageExists) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.map(
            (page) =>
              page.id === pageId
                ? {
                    ...page,
                    title:
                      trimmedTitle,
                  }
                : page,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    setNotebookTitle: (title) => {
      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const notebook: Notebook = {
          ...state.notebook,
          title,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    setPageBackground: (
      pageId,
      background,
    ) => {
      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.map(
            (page) =>
              page.id === pageId
                ? {
                    ...page,
                    background,
                  }
                : page,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    addStroke: (
      pageId,
      stroke,
    ) => {
      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.map(
            (page) =>
              page.id === pageId
                ? {
                    ...page,
                    elements: [
                      ...page.elements,
                      stroke,
                    ],
                  }
                : page,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    removeStroke: (
      pageId,
      strokeId,
    ) => {
      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.map(
            (page) =>
              page.id === pageId
                ? {
                    ...page,
                    elements:
                      page.elements.filter(
                        (element) =>
                          element.id !==
                          strokeId,
                      ),
                  }
                : page,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    addText: (
      pageId,
      text,
    ) => {
      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.map(
            (page) =>
              page.id === pageId
                ? {
                    ...page,
                    elements: [
                      ...page.elements,
                      text,
                    ],
                  }
                : page,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    updateText: (
      pageId,
      textId,
      text,
    ) => {
      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.map(
            (page) =>
              page.id === pageId
                ? {
                    ...page,
                    elements:
                      page.elements.map(
                        (element) =>
                          element.id ===
                            textId &&
                          element.type ===
                            'text'
                            ? {
                                ...element,
                                text,
                              }
                            : element,
                      ),
                  }
                : page,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    removeText: (
      pageId,
      textId,
    ) => {
      set((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook =
          cloneNotebook(
            state.notebook,
          )

        const pages =
          state.notebook.pages.map(
            (page) =>
              page.id === pageId
                ? {
                    ...page,
                    elements:
                      page.elements.filter(
                        (element) =>
                          element.id !==
                          textId,
                      ),
                  }
                : page,
          )

        const notebook: Notebook = {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        }

        return {
          notebook,
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    },

    undo: () => {
      set((state) => {
        if (
          !state.notebook ||
          state.history.length === 0
        ) {
          return state
        }

        const previousNotebook =
          state.history[
            state.history.length - 1
          ]

        const notebook =
          cloneNotebook(
            previousNotebook,
          )

        return {
          notebook,
          history:
            state.history.slice(
              0,
              -1,
            ),
          future: [
            ...state.future,
            cloneNotebook(
              state.notebook,
            ),
          ],
        }
      })
    },

    redo: () => {
      set((state) => {
        if (
          !state.notebook ||
          state.future.length === 0
        ) {
          return state
        }

        const nextNotebook =
          state.future[
            state.future.length - 1
          ]

        const notebook =
          cloneNotebook(
            nextNotebook,
          )

        return {
          notebook,
          history: [
            ...state.history,
            cloneNotebook(
              state.notebook,
            ),
          ],
          future:
            state.future.slice(
              0,
              -1,
            ),
        }
      })
    },
  }))

/*
 * Persistence safety net.
 *
 * Some editor operations, especially shape
 * movement, resizing, rotation, styling,
 * layer ordering, copy/paste and PDF page
 * operations, update the Zustand store directly
 * with useDocumentStore.setState().
 *
 * Keep the multi-notebook collection synchronized
 * with the active notebook as well.
 */
let syncingNotebookCollection = false

useDocumentStore.subscribe((state, previousState) => {
  if (syncingNotebookCollection) return

  const notebookChanged = state.notebook !== previousState.notebook
  const notebooksChanged = state.notebooks !== previousState.notebooks
  const metadataChanged =
    state.activeNotebookId !== previousState.activeNotebookId ||
    state.pinnedNotebookIds !== previousState.pinnedNotebookIds ||
    state.folders !== previousState.folders ||
    state.notebookFolderIds !== previousState.notebookFolderIds

  // Tool and history updates often touch the store without changing saved
  // notebook data. Avoid serializing and writing the entire library for them.
  if (!notebookChanged && !notebooksChanged && !metadataChanged) return

  if (!state.notebook || !state.activeNotebookId) {
    if (state.notebooks.length === 0) saveNotebookStorage([], null)
    else if (notebooksChanged || metadataChanged) {
      saveNotebookStorage(
        state.notebooks,
        state.activeNotebookId,
        state.pinnedNotebookIds,
        state.folders,
        state.notebookFolderIds,
      )
    }
    return
  }

  const activeNotebookIndex =
    state.notebooks.findIndex(
      (notebook) =>
        notebook.id ===
        state.activeNotebookId,
    )

  let notebooks =
    state.notebooks

  if (
    activeNotebookIndex === -1
  ) {
    notebooks = [
      ...state.notebooks,
      state.notebook,
    ]
  } else {
    const currentStoredNotebook =
      state.notebooks[
        activeNotebookIndex
      ]

    const activeNotebookChanged =
      notebookChanged && currentStoredNotebook !== state.notebook

    if (activeNotebookChanged) {
      notebooks =
        state.notebooks.map(
          (notebook, index) =>
            index ===
            activeNotebookIndex
              ? state.notebook!
              : notebook,
        )
    }
  }

  saveNotebookStorage(
    notebooks,
    state.activeNotebookId,
    state.pinnedNotebookIds,
    state.folders,
    state.notebookFolderIds,
  )

  if (
    notebooks !==
    state.notebooks
  ) {
    syncingNotebookCollection =
      true

    useDocumentStore.setState({
      notebooks,
    })

    syncingNotebookCollection =
      false
  }
})
