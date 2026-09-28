import {
  FileText,
  Folder as FolderIcon,
  LayoutTemplate,
  Settings,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  Search,
  X,
  Pin,
  PinOff,
  Clock3,
  ChevronDown,
  ChevronRight,
  FolderPlus,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type DragEvent,
} from 'react'
import {
  useUIStore,
  type SidebarSection,
} from '../../stores/uiStore'
import {
  useDocumentStore,
  type Folder,
} from '../../stores/documentStore'

const navigationItems: {
  id: SidebarSection
  label: string
  icon: typeof FileText
}[] = [
  {
    id: 'notes',
    label: 'Notes',
    icon: FileText,
  },
  {
    id: 'folders',
    label: 'Folders',
    icon: FolderIcon,
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: LayoutTemplate,
  },
]

const RECENT_NOTEBOOKS_STORAGE_KEY =
  'freenotes-recent-notebooks'

const MAX_RECENT_NOTEBOOKS = 5

function loadRecentNotebookIds(): string[] {
  try {
    const saved = localStorage.getItem(
      RECENT_NOTEBOOKS_STORAGE_KEY,
    )

    if (!saved) {
      return []
    }

    const parsed: unknown = JSON.parse(saved)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (id): id is string =>
        typeof id === 'string',
    )
  } catch {
    return []
  }
}

function saveRecentNotebookIds(
  notebookIds: string[],
) {
  try {
    localStorage.setItem(
      RECENT_NOTEBOOKS_STORAGE_KEY,
      JSON.stringify(notebookIds),
    )
  } catch {
    // Ignore storage errors.
  }
}

function Sidebar() {
  const activeSection = useUIStore(
    (state) => state.activeSection,
  )

  const setActiveSection = useUIStore(
    (state) => state.setActiveSection,
  )

  const notebooks = useDocumentStore(
    (state) => state.notebooks,
  )

  const activeNotebookId = useDocumentStore(
    (state) => state.activeNotebookId,
  )

  const createNotebook = useDocumentStore(
    (state) => state.createNotebook,
  )

  const switchNotebook = useDocumentStore(
    (state) => state.switchNotebook,
  )

  const renameNotebook = useDocumentStore(
    (state) => state.renameNotebook,
  )

  const deleteNotebook = useDocumentStore(
    (state) => state.deleteNotebook,
  )

  const reorderNotebook = useDocumentStore(
    (state) => state.reorderNotebook,
  )

  const pinnedNotebookIds = useDocumentStore(
    (state) => state.pinnedNotebookIds,
  )

  const toggleNotebookPinned =
    useDocumentStore(
      (state) => state.toggleNotebookPinned,
    )

  const folders = useDocumentStore(
    (state) => state.folders,
  )

  const createFolder = useDocumentStore(
    (state) => state.createFolder,
  )

  const renameFolder = useDocumentStore(
    (state) => state.renameFolder,
  )

  const deleteFolder = useDocumentStore(
    (state) => state.deleteFolder,
  )

  const [openMenuId, setOpenMenuId] =
    useState<string | null>(null)

  const [openFolderMenuId, setOpenFolderMenuId] =
    useState<string | null>(null)

  const [openFolderIds, setOpenFolderIds] =
    useState<string[]>([])

  const [searchQuery, setSearchQuery] =
    useState('')

  const [draggedNotebookId, setDraggedNotebookId] =
    useState<string | null>(null)

  const [dragOverNotebookId, setDragOverNotebookId] =
    useState<string | null>(null)

  const [hoveredNotebookId, setHoveredNotebookId] =
    useState<string | null>(null)

  const [hoveredFolderId, setHoveredFolderId] =
    useState<string | null>(null)

  const [recentNotebookIds, setRecentNotebookIds] =
    useState<string[]>(() =>
      loadRecentNotebookIds(),
    )

  const notebookMenuRef =
    useRef<HTMLDivElement | null>(null)

  const folderMenuRef =
    useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const validNotebookIds = new Set(
      notebooks.map(
        (notebook) => notebook.id,
      ),
    )

    setRecentNotebookIds((currentIds) => {
      const cleanedIds = currentIds.filter(
        (id) => validNotebookIds.has(id),
      )

      if (
        cleanedIds.length !==
        currentIds.length
      ) {
        saveRecentNotebookIds(cleanedIds)
      }

      return cleanedIds
    })
  }, [notebooks])

  useEffect(() => {
    if (!activeNotebookId) {
      return
    }

    setRecentNotebookIds((currentIds) => {
      const nextIds = [
        activeNotebookId,
        ...currentIds.filter(
          (id) => id !== activeNotebookId,
        ),
      ].slice(0, MAX_RECENT_NOTEBOOKS)

      saveRecentNotebookIds(nextIds)

      return nextIds
    })
  }, [activeNotebookId])

  useEffect(() => {
    if (
      !openMenuId &&
      !openFolderMenuId
    ) {
      return
    }

    const handleOutsideClick = (
      event: globalThis.MouseEvent,
    ) => {
      const target = event.target as Node

      const insideNotebookMenu =
        notebookMenuRef.current?.contains(
          target,
        ) ?? false

      const insideFolderMenu =
        folderMenuRef.current?.contains(
          target,
        ) ?? false

      if (
        !insideNotebookMenu &&
        !insideFolderMenu
      ) {
        setOpenMenuId(null)
        setOpenFolderMenuId(null)
      }
    }

    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null)
        setOpenFolderMenuId(null)
      }
    }

    document.addEventListener(
      'mousedown',
      handleOutsideClick,
    )

    document.addEventListener(
      'keydown',
      handleEscape,
    )

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick,
      )

      document.removeEventListener(
        'keydown',
        handleEscape,
      )
    }
  }, [
    openMenuId,
    openFolderMenuId,
  ])

  useEffect(() => {
    const handleQuickSwitch = (
      event: KeyboardEvent,
    ) => {
      const target =
        event.target as HTMLElement | null

      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (isTypingTarget) {
        return
      }

      if (
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey
      ) {
        return
      }

      const number = Number(
        event.key,
      )

      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 9
      ) {
        return
      }

      const notebookId =
        recentNotebookIds[number - 1]

      if (!notebookId) {
        return
      }

      event.preventDefault()

      switchNotebook(notebookId)
      setActiveSection('notes')
      setOpenMenuId(null)
      setOpenFolderMenuId(null)
      setSearchQuery('')
    }

    window.addEventListener(
      'keydown',
      handleQuickSwitch,
    )

    return () => {
      window.removeEventListener(
        'keydown',
        handleQuickSwitch,
      )
    }
  }, [
    recentNotebookIds,
    switchNotebook,
    setActiveSection,
  ])

  const rememberNotebook = (
    notebookId: string,
  ) => {
    setRecentNotebookIds((currentIds) => {
      const nextIds = [
        notebookId,
        ...currentIds.filter(
          (id) => id !== notebookId,
        ),
      ].slice(0, MAX_RECENT_NOTEBOOKS)

      saveRecentNotebookIds(nextIds)

      return nextIds
    })
  }

  const handleOpenNotebook = (
    notebookId: string,
  ) => {
    switchNotebook(notebookId)
    rememberNotebook(notebookId)
    setActiveSection('notes')
    setOpenMenuId(null)
    setOpenFolderMenuId(null)
  }

  const handleCreateNotebook = () => {
    const title = window.prompt(
      'Notebook name',
      'Untitled Note',
    )

    if (title === null) {
      return
    }

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      return
    }

    createNotebook(trimmedTitle)
    setActiveSection('notes')
    setOpenMenuId(null)
    setOpenFolderMenuId(null)
    setSearchQuery('')
  }

  const handleRenameNotebook = (
    notebookId: string,
    currentTitle: string,
  ) => {
    const title = window.prompt(
      'Rename notebook',
      currentTitle,
    )

    if (title === null) {
      return
    }

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      return
    }

    renameNotebook(
      notebookId,
      trimmedTitle,
    )

    setOpenMenuId(null)
  }

  const handleDeleteNotebook = (
    event: MouseEvent<HTMLButtonElement>,
    notebookId: string,
    title: string,
  ) => {
    event.stopPropagation()

    if (notebooks.length <= 1) {
      window.alert(
        'Medico Notes must keep at least one notebook.',
      )

      setOpenMenuId(null)
      return
    }

    const confirmed = window.confirm(
      `Delete "${title}"?\n\nThis will permanently delete the notebook and all of its pages.`,
    )

    if (!confirmed) {
      return
    }

    deleteNotebook(notebookId)

    setRecentNotebookIds(
      (currentIds) => {
        const nextIds =
          currentIds.filter(
            (id) => id !== notebookId,
          )

        saveRecentNotebookIds(
          nextIds,
        )

        return nextIds
      },
    )

    setOpenMenuId(null)
  }

  const handleNotebookMenuToggle = (
    event: MouseEvent<HTMLButtonElement>,
    notebookId: string,
  ) => {
    event.stopPropagation()

    setOpenFolderMenuId(null)

    setOpenMenuId((currentId) =>
      currentId === notebookId
        ? null
        : notebookId,
    )
  }

  const handleNotebookDragStart = (
    event: DragEvent<HTMLDivElement>,
    notebookId: string,
  ) => {
    setDraggedNotebookId(notebookId)
    setDragOverNotebookId(null)

    event.dataTransfer.effectAllowed =
      'move'

    event.dataTransfer.setData(
      'text/plain',
      notebookId,
    )
  }

  const handleNotebookDragOver = (
    event: DragEvent<HTMLDivElement>,
    notebookId: string,
  ) => {
    event.preventDefault()

    if (
      draggedNotebookId &&
      draggedNotebookId !== notebookId
    ) {
      const draggedIsPinned =
        pinnedNotebookIds.includes(
          draggedNotebookId,
        )

      const targetIsPinned =
        pinnedNotebookIds.includes(
          notebookId,
        )

      if (
        draggedIsPinned !==
        targetIsPinned
      ) {
        setDragOverNotebookId(null)
        return
      }

      event.dataTransfer.dropEffect =
        'move'

      setDragOverNotebookId(
        notebookId,
      )
    }
  }

  const handleNotebookDrop = (
    event: DragEvent<HTMLDivElement>,
    targetNotebookId: string,
  ) => {
    event.preventDefault()

    const sourceNotebookId =
      event.dataTransfer.getData(
        'text/plain',
      ) ||
      draggedNotebookId

    if (
      !sourceNotebookId ||
      sourceNotebookId ===
        targetNotebookId
    ) {
      setDraggedNotebookId(null)
      setDragOverNotebookId(null)
      return
    }

    const sourceIndex =
      notebooks.findIndex(
        (notebook) =>
          notebook.id ===
          sourceNotebookId,
      )

    const targetIndex =
      notebooks.findIndex(
        (notebook) =>
          notebook.id ===
          targetNotebookId,
      )

    const sourceIsPinned =
      pinnedNotebookIds.includes(
        sourceNotebookId,
      )

    const targetIsPinned =
      pinnedNotebookIds.includes(
        targetNotebookId,
      )

    if (
      sourceIndex !== -1 &&
      targetIndex !== -1 &&
      sourceIsPinned === targetIsPinned
    ) {
      reorderNotebook(
        sourceNotebookId,
        targetIndex,
      )
    }

    setDraggedNotebookId(null)
    setDragOverNotebookId(null)
    setHoveredNotebookId(null)
  }

  const handleNotebookDragEnd = () => {
    setDraggedNotebookId(null)
    setDragOverNotebookId(null)
    setHoveredNotebookId(null)
  }

  const handleCreateFolder = () => {
    const title = window.prompt(
      'Folder name',
      'New Folder',
    )

    if (title === null) {
      return
    }

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      return
    }

    createFolder(trimmedTitle)
    setOpenFolderMenuId(null)
  }

  const handleRenameFolder = (
    folderId: string,
    currentTitle: string,
  ) => {
    const title = window.prompt(
      'Rename folder',
      currentTitle,
    )

    if (title === null) {
      return
    }

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      return
    }

    renameFolder(
      folderId,
      trimmedTitle,
    )

    setOpenFolderMenuId(null)
  }

  const handleDeleteFolder = (
    folderId: string,
    title: string,
  ) => {
    const confirmed = window.confirm(
      `Delete "${title}"?\n\nThe folder will be removed, but the notebooks inside it will remain safe.`,
    )

    if (!confirmed) {
      return
    }

    deleteFolder(folderId)
    setOpenFolderMenuId(null)
  }

  const toggleFolderOpen = (
    folderId: string,
  ) => {
    setOpenFolderIds(
      (currentIds) =>
        currentIds.includes(folderId)
          ? currentIds.filter(
              (id) => id !== folderId,
            )
          : [
              ...currentIds,
              folderId,
            ],
    )
  }

  const handleFolderMenuToggle = (
    event: MouseEvent<HTMLButtonElement>,
    folderId: string,
  ) => {
    event.stopPropagation()

    setOpenMenuId(null)

    setOpenFolderMenuId(
      (currentId) =>
        currentId === folderId
          ? null
          : folderId,
    )
  }

  const renderFolder = (
    folder: Folder,
  ) => {
    const isOpen =
      openFolderIds.includes(
        folder.id,
      )

    const isMenuOpen =
      openFolderMenuId === folder.id

    const isHovered =
      hoveredFolderId === folder.id

    return (
      <div
        key={folder.id}
        style={{
          position: 'relative',
        }}
      >
        <div
          onMouseEnter={() => setHoveredFolderId(folder.id)}
          onMouseLeave={() => setHoveredFolderId(null)}
          style={{
            minHeight: 38,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding:
              '4px 5px 4px 4px',
            boxSizing: 'border-box',
            background:
              isMenuOpen || isHovered
                ? '#f4f4f5'
                : 'transparent',
          }}
        >
          <button
            type="button"
            title={
              isOpen
                ? 'Collapse folder'
                : 'Expand folder'
            }
            aria-label={
              isOpen
                ? `Collapse ${folder.title}`
                : `Expand ${folder.title}`
            }
            onClick={() =>
              toggleFolderOpen(
                folder.id,
              )
            }
            style={{
              width: 24,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background:
                'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'center',
              color: '#888',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
          >
            {isOpen ? (
              <ChevronDown
                size={14}
                strokeWidth={1.8}
              />
            ) : (
              <ChevronRight
                size={14}
                strokeWidth={1.8}
              />
            )}
          </button>

          <button
            type="button"
            title={folder.title}
            onClick={() =>
              toggleFolderOpen(
                folder.id,
              )
            }
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 30,
              border: 'none',
              background:
                'transparent',
              display: 'flex',
              alignItems:
                'center',
              gap: 8,
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              color: '#333',
            }}
          >
            <FolderIcon
              size={16}
              strokeWidth={1.8}
              style={{
                flexShrink: 0,
              }}
            />

            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow:
                  'ellipsis',
                whiteSpace:
                  'nowrap',
                fontSize: 13,
                fontWeight: 400,
              }}
            >
              {folder.title}
            </span>
          </button>

          <button
            type="button"
            title="Folder options"
            aria-label={`Options for ${folder.title}`}
            aria-expanded={
              isMenuOpen
            }
            onClick={(event) =>
              handleFolderMenuToggle(
                event,
                folder.id,
              )
            }
            style={{
              width: 28,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background:
                isMenuOpen
                  ? '#d9d9dc'
                  : 'transparent',
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              color: '#777',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <MoreHorizontal
              size={16}
            />
          </button>
        </div>

        {isMenuOpen && (
          <div
            style={{
              position:
                'absolute',
              right: 4,
              top: 40,
              zIndex: 60,
              width: 150,
              padding: 5,
              border:
                '1px solid #ddd',
              borderRadius: 9,
              background:
                '#ffffff',
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.12)',
            }}
          >
            <button
              type="button"
              onClick={() =>
                handleRenameFolder(
                  folder.id,
                  folder.title,
                )
              }
              style={{
                width: '100%',
                border: 'none',
                background:
                  'transparent',
                borderRadius: 6,
                padding:
                  '8px 9px',
                display: 'flex',
                alignItems:
                  'center',
                gap: 8,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#333',
                fontSize: 13,
              }}
            >
              <Pencil
                size={15}
              />

              Rename
            </button>

            <button
              type="button"
              onClick={() =>
                handleDeleteFolder(
                  folder.id,
                  folder.title,
                )
              }
              style={{
                width: '100%',
                border: 'none',
                background:
                  'transparent',
                borderRadius: 6,
                padding:
                  '8px 9px',
                display: 'flex',
                alignItems:
                  'center',
                gap: 8,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#c0392b',
                fontSize: 13,
              }}
            >
              <Trash2
                size={15}
              />

              Delete
            </button>
          </div>
        )}

        {isOpen && (
          <div
            style={{
              margin:
                '0 0 4px 27px',
              padding:
                '6px 8px',
              borderLeft:
                '1px solid #e5e5e5',
              color: '#aaa',
              fontSize: 11,
            }}
          >
            Empty folder
          </div>
        )}
      </div>
    )
  }

  const normalizedSearchQuery =
    searchQuery.trim().toLowerCase()

  const filteredNotebooks =
    normalizedSearchQuery.length === 0
      ? notebooks
      : notebooks.filter(
          (notebook) =>
            notebook.title
              .toLowerCase()
              .includes(
                normalizedSearchQuery,
              ),
        )

  const pinnedNotebooks =
    filteredNotebooks.filter(
      (notebook) =>
        pinnedNotebookIds.includes(
          notebook.id,
        ),
    )

  const otherNotebooks =
    filteredNotebooks.filter(
      (notebook) =>
        !pinnedNotebookIds.includes(
          notebook.id,
        ),
    )

  const recentNotebooks =
    recentNotebookIds
      .map((id) =>
        notebooks.find(
          (notebook) =>
            notebook.id === id,
        ),
      )
      .filter(
        (
          notebook,
        ): notebook is (typeof notebooks)[number] =>
          Boolean(notebook),
      )
      .filter((notebook) =>
        normalizedSearchQuery.length ===
        0
          ? true
          : notebook.title
              .toLowerCase()
              .includes(
                normalizedSearchQuery,
              ),
      )

  const recentNotebookIdSet = new Set(
    recentNotebooks.map((notebook) => notebook.id),
  )

  const visiblePinnedNotebooks =
    recentNotebooks.length > 0
      ? pinnedNotebooks.filter(
          (notebook) =>
            !recentNotebookIdSet.has(notebook.id),
        )
      : pinnedNotebooks

  const visibleOtherNotebooks =
    recentNotebooks.length > 0
      ? otherNotebooks.filter(
          (notebook) =>
            !recentNotebookIdSet.has(notebook.id),
        )
      : otherNotebooks

  const renderNotebook = (
    notebook: (typeof notebooks)[number],
    options?: {
      showRecentNumber?: number
    },
  ) => {
    const isSelected =
      notebook.id === activeNotebookId

    const isMenuOpen =
      openMenuId === notebook.id

    const isPinned =
      pinnedNotebookIds.includes(
        notebook.id,
      )

    const isHovered =
      hoveredNotebookId === notebook.id

    const recentNumber =
      options?.showRecentNumber

    return (
      <div
        key={notebook.id}
        draggable
        onDragStart={(event) =>
          handleNotebookDragStart(
            event,
            notebook.id,
          )
        }
        onDragOver={(event) =>
          handleNotebookDragOver(
            event,
            notebook.id,
          )
        }
        onDrop={(event) =>
          handleNotebookDrop(
            event,
            notebook.id,
          )
        }
        onDragEnd={
          handleNotebookDragEnd
        }
        onMouseEnter={() =>
          setHoveredNotebookId(notebook.id)
        }
        onMouseLeave={() =>
          setHoveredNotebookId(null)
        }
        style={{
          position: 'relative',
          opacity:
            draggedNotebookId ===
            notebook.id
              ? 0.5
              : 1,
          borderTop:
            dragOverNotebookId ===
            notebook.id
              ? '2px solid #888'
              : '2px solid transparent',
          transition:
            'opacity 120ms ease, border-color 120ms ease',
          cursor: 'grab',
        }}
      >
        <div
          style={{
            width: '100%',
            minHeight: 40,
            borderRadius: 8,
            background:
              isSelected
                ? '#e5e5e7'
                : isHovered
                  ? '#f4f4f5'
                  : 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding:
              '5px 5px 5px 8px',
            boxSizing:
              'border-box',
          }}
        >
          <button
            type="button"
            onClick={() =>
              handleOpenNotebook(
                notebook.id,
              )
            }
            title={
              recentNumber
                ? `${notebook.title} — Cmd/Ctrl + Shift + ${recentNumber}`
                : notebook.title
            }
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 30,
              border: 'none',
              background:
                'transparent',
              display: 'flex',
              alignItems:
                'center',
              gap: 8,
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              color: '#333',
            }}
          >
            {recentNumber ? (
              <span
                style={{
                  width: 17,
                  height: 17,
                  flexShrink: 0,
                  borderRadius: 5,
                  background:
                    '#ededee',
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'center',
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#777',
                }}
              >
                {recentNumber}
              </span>
            ) : (
              <FileText
                size={16}
                strokeWidth={1.8}
                style={{
                  flexShrink: 0,
                }}
              />
            )}

            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow:
                  'hidden',
                textOverflow:
                  'ellipsis',
                whiteSpace:
                  'nowrap',
                fontSize: 13,
                fontWeight:
                  isSelected
                    ? 600
                    : 400,
              }}
            >
              {notebook.title}
            </span>

            {isPinned && (
              <Pin
                size={13}
                strokeWidth={2}
                style={{
                  flexShrink: 0,
                  color: '#666',
                }}
              />
            )}

            {isSelected && (
              <Check
                size={15}
                strokeWidth={2}
                style={{
                  flexShrink: 0,
                  color: '#555',
                }}
              />
            )}
          </button>

          <button
            type="button"
            title="Notebook options"
            aria-label={`Options for ${notebook.title}`}
            aria-expanded={
              isMenuOpen
            }
            onClick={(event) =>
              handleNotebookMenuToggle(
                event,
                notebook.id,
              )
            }
            style={{
              width: 28,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background:
                isMenuOpen
                  ? '#d9d9dc'
                  : 'transparent',
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              color: '#777',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <MoreHorizontal
              size={16}
            />
          </button>
        </div>

        {isMenuOpen && (
          <div
            style={{
              position:
                'absolute',
              right: 4,
              top: 42,
              zIndex: 50,
              width: 160,
              padding: 5,
              border:
                '1px solid #ddd',
              borderRadius: 9,
              background:
                '#ffffff',
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.12)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                toggleNotebookPinned(
                  notebook.id,
                )

                setOpenMenuId(
                  null,
                )
              }}
              style={{
                width: '100%',
                border: 'none',
                background:
                  'transparent',
                borderRadius: 6,
                padding:
                  '8px 9px',
                display: 'flex',
                alignItems:
                  'center',
                gap: 8,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#333',
                fontSize: 13,
              }}
            >
              {isPinned ? (
                <PinOff
                  size={15}
                />
              ) : (
                <Pin
                  size={15}
                />
              )}

              {isPinned
                ? 'Unpin'
                : 'Pin'}
            </button>

            <button
              type="button"
              onClick={() =>
                handleRenameNotebook(
                  notebook.id,
                  notebook.title,
                )
              }
              style={{
                width: '100%',
                border: 'none',
                background:
                  'transparent',
                borderRadius: 6,
                padding:
                  '8px 9px',
                display: 'flex',
                alignItems:
                  'center',
                gap: 8,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#333',
                fontSize: 13,
              }}
            >
              <Pencil
                size={15}
              />

              Rename
            </button>

            <button
              type="button"
              onClick={(event) =>
                handleDeleteNotebook(
                  event,
                  notebook.id,
                  notebook.title,
                )
              }
              style={{
                width: '100%',
                border: 'none',
                background:
                  'transparent',
                borderRadius: 6,
                padding:
                  '8px 9px',
                display: 'flex',
                alignItems:
                  'center',
                gap: 8,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#c0392b',
                fontSize: 13,
              }}
            >
              <Trash2
                size={15}
              />

              Delete
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          M
        </div>

        <span>
          Medico Notes
        </span>
      </div>

      <nav className="sidebar-navigation">
        {navigationItems.map(
          (item) => {
            const Icon =
              item.icon

            const isActive =
              activeSection ===
              item.id

            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-item ${
                  isActive
                    ? 'sidebar-item-active'
                    : ''
                }`}
                onClick={() => {
                  setActiveSection(
                    item.id,
                  )

                  setOpenMenuId(
                    null,
                  )

                  setOpenFolderMenuId(
                    null,
                  )
                }}
              >
                <Icon
                  size={19}
                  strokeWidth={1.8}
                />

                <span>
                  {item.label}
                </span>
              </button>
            )
          },
        )}
      </nav>

      {activeSection ===
        'notes' && (
        <div
          ref={notebookMenuRef}
          style={{
            padding:
              '14px 10px 0',
            minHeight: 0,
            flex: 1,
            overflowY:
              'auto',
          }}
        >
          {folders.length > 0 && (
            <div
              ref={folderMenuRef}
              style={{
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom:
                  '1px solid #ededed',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  padding:
                    '0 6px 7px',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#777',
                    textTransform:
                      'uppercase',
                    letterSpacing:
                      '0.05em',
                  }}
                >
                  Folders
                </span>

                <button
                  type="button"
                  title="New folder"
                  aria-label="New folder"
                  onClick={
                    handleCreateFolder
                  }
                  style={{
                    width: 28,
                    height: 28,
                    border: 'none',
                    borderRadius: 7,
                    background:
                      'transparent',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    cursor: 'pointer',
                    color: '#555',
                  }}
                >
                  <FolderPlus
                    size={17}
                    strokeWidth={1.8}
                  />
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection:
                    'column',
                  gap: 2,
                }}
              >
                {folders.map(
                  (
                    folder,
                  ) =>
                    renderFolder(
                      folder,
                    ),
                )}
              </div>
            </div>
          )}

          {folders.length === 0 && (
            <div
              style={{
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom:
                  '1px solid #ededed',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  padding:
                    '0 6px 7px',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#777',
                    textTransform:
                      'uppercase',
                    letterSpacing:
                      '0.05em',
                  }}
                >
                  Folders
                </span>

                <button
                  type="button"
                  title="New folder"
                  aria-label="New folder"
                  onClick={
                    handleCreateFolder
                  }
                  style={{
                    width: 28,
                    height: 28,
                    border: 'none',
                    borderRadius: 7,
                    background:
                      'transparent',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    cursor: 'pointer',
                    color: '#555',
                  }}
                >
                  <FolderPlus
                    size={17}
                    strokeWidth={1.8}
                  />
                </button>
              </div>

              <div
                style={{
                  padding:
                    '7px 7px 3px',
                  color: '#aaa',
                  fontSize: 11,
                }}
              >
                No folders yet
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'space-between',
              padding:
                '0 6px 8px',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#777',
                textTransform:
                  'uppercase',
                letterSpacing:
                  '0.05em',
              }}
            >
              Notebooks
            </span>

            <button
              type="button"
              title="New notebook"
              aria-label="New notebook"
              onClick={
                handleCreateNotebook
              }
              style={{
                width: 28,
                height: 28,
                border: 'none',
                borderRadius: 7,
                background:
                  'transparent',
                display: 'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                cursor: 'pointer',
                color: '#555',
              }}
            >
              <Plus
                size={17}
                strokeWidth={2}
              />
            </button>
          </div>

          {notebooks.length >
            0 && (
            <div
              style={{
                position:
                  'relative',
                margin:
                  '0 0 10px',
              }}
            >
              <Search
                size={15}
                strokeWidth={1.8}
                style={{
                  position:
                    'absolute',
                  left: 9,
                  top: '50%',
                  transform:
                    'translateY(-50%)',
                  color: '#888',
                  pointerEvents:
                    'none',
                }}
              />

              <input
                type="text"
                value={
                  searchQuery
                }
                onChange={(
                  event,
                ) =>
                  setSearchQuery(
                    event.target
                      .value,
                  )
                }
                onKeyDown={(
                  event,
                ) => {
                  if (
                    event.key ===
                    'Escape'
                  ) {
                    setSearchQuery(
                      '',
                    )

                    event.currentTarget.blur()
                  }
                }}
                placeholder="Search notebooks"
                aria-label="Search notebooks"
                style={{
                  width: '100%',
                  height: 34,
                  boxSizing:
                    'border-box',
                  border:
                    '1px solid #dedede',
                  borderRadius: 8,
                  background:
                    '#fafafa',
                  padding:
                    searchQuery.length >
                    0
                      ? '0 30px 0 31px'
                      : '0 10px 0 31px',
                  outline: 'none',
                  color: '#333',
                  fontSize: 13,
                }}
              />

              {searchQuery.length >
                0 && (
                <button
                  type="button"
                  title="Clear search"
                  aria-label="Clear notebook search"
                  onClick={() =>
                    setSearchQuery(
                      '',
                    )
                  }
                  style={{
                    position:
                      'absolute',
                    right: 5,
                    top: '50%',
                    transform:
                      'translateY(-50%)',
                    width: 25,
                    height: 25,
                    border: 'none',
                    borderRadius: 6,
                    background:
                      'transparent',
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'center',
                    cursor: 'pointer',
                    color: '#777',
                  }}
                >
                  <X
                    size={14}
                  />
                </button>
              )}
            </div>
          )}

          {notebooks.length ===
          0 ? (
            <button
              type="button"
              onClick={
                handleCreateNotebook
              }
              style={{
                width: '100%',
                border:
                  '1px dashed #cfcfcf',
                borderRadius: 9,
                background:
                  'transparent',
                padding:
                  '12px 10px',
                color: '#777',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              + Create notebook
            </button>
          ) : filteredNotebooks.length ===
            0 ? (
            <div
              style={{
                padding:
                  '18px 10px',
                textAlign:
                  'center',
                color: '#888',
                fontSize: 13,
                lineHeight:
                  1.45,
              }}
            >
              <Search
                size={18}
                strokeWidth={1.7}
                style={{
                  display:
                    'block',
                  margin:
                    '0 auto 7px',
                  color: '#aaa',
                }}
              />

              No notebooks found

              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  color: '#aaa',
                }}
              >
                Try a different name
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection:
                  'column',
                gap: 4,
              }}
            >
              {recentNotebooks.length >
                0 && (
                <>
                  <div
                    style={{
                      display:
                        'flex',
                      alignItems:
                        'center',
                      gap: 5,
                      padding:
                        '4px 7px 3px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#999',
                      textTransform:
                        'uppercase',
                      letterSpacing:
                        '0.05em',
                    }}
                  >
                    <Clock3
                      size={12}
                      strokeWidth={1.8}
                    />

                    Recent
                  </div>

                  {recentNotebooks.map(
                    (
                      notebook,
                      index,
                    ) =>
                      renderNotebook(
                        notebook,
                        {
                          showRecentNumber:
                            index +
                              1 <=
                            9
                              ? index +
                                1
                              : undefined,
                        },
                      ),
                  )}

                  <div
                    style={{
                      height: 1,
                      background:
                        '#ededed',
                      margin:
                        '6px 7px 3px',
                    }}
                  />
                </>
              )}

              {visiblePinnedNotebooks.length >
                0 && (
                <div
                  style={{
                    padding:
                      '4px 7px 3px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#999',
                    textTransform:
                      'uppercase',
                    letterSpacing:
                      '0.05em',
                  }}
                >
                  Pinned
                </div>
              )}

              {visiblePinnedNotebooks.map(
                (notebook) =>
                  renderNotebook(
                    notebook,
                  ),
              )}

              {visibleOtherNotebooks.length >
                0 && (
                <div
                  style={{
                    padding:
                      visiblePinnedNotebooks.length >
                      0
                        ? '10px 7px 3px'
                        : '4px 7px 3px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#999',
                    textTransform:
                      'uppercase',
                    letterSpacing:
                      '0.05em',
                  }}
                >
                  Other notebooks
                </div>
              )}

              {visibleOtherNotebooks.map(
                (notebook) =>
                  renderNotebook(
                    notebook,
                  ),
              )}
            </div>
          )}
        </div>
      )}

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`sidebar-item ${
            activeSection ===
            'settings'
              ? 'sidebar-item-active'
              : ''
          }`}
          onClick={() => {
            setActiveSection(
              'settings',
            )

            setOpenMenuId(
              null,
            )

            setOpenFolderMenuId(
              null,
            )
          }}
        >
          <Settings
            size={19}
            strokeWidth={1.8}
          />

          <span>
            Settings
          </span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
