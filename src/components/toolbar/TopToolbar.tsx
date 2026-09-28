import {
  ChevronDown,
  Circle,
  Eraser,
  Highlighter,
  MoreHorizontal,
  Pencil,
  Pen,
  Redo2,
  Search,
  Share2,
  Square,
  Triangle,
  Type,
  Undo2,
  WandSparkles,
  MousePointer2,
  Lasso,
  Crosshair,
  StickyNote,
  Ruler,
  Expand,
  Minimize2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { usePageStore } from '../../stores/pageStore'
import { useToolStore } from '../../stores/toolStore'
import AudioRecorder from './AudioRecorder'

function TopToolbar() {
  const activeTool = useToolStore((state) => state.activeTool)
  const shapeType = useToolStore((state) => state.shapeType)
  const color = useToolStore((state) => state.color)
  const width = useToolStore((state) => state.width)
  const eraserSize = useToolStore(
    (state) => state.eraserSize,
  )

  const setActiveTool = useToolStore(
    (state) => state.setActiveTool,
  )
  const setShapeType = useToolStore(
    (state) => state.setShapeType,
  )
  const setColor = useToolStore((state) => state.setColor)
  const setWidth = useToolStore((state) => state.setWidth)
  const setEraserSize = useToolStore(
    (state) => state.setEraserSize,
  )
  const autoShapeRecognition = useToolStore((state) => state.autoShapeRecognition)
  const setAutoShapeRecognition = useToolStore((state) => state.setAutoShapeRecognition)
  const rulerVisible = useToolStore((state) => state.rulerVisible)
  const setRulerVisible = useToolStore((state) => state.setRulerVisible)


  const history = useDocumentStore((state) => state.history)
  const future = useDocumentStore((state) => state.future)
  const undo = useDocumentStore((state) => state.undo)
  const redo = useDocumentStore((state) => state.redo)
  const notebook = useDocumentStore((state) => state.notebook)
  const renameNotebook = useDocumentStore((state) => state.renameNotebook)
  const switchNotebook = useDocumentStore((state) => state.switchNotebook)
  const setActivePage = usePageStore((state) => state.setActivePage)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncFullscreenState = () => {
      const nativeFullscreen = document.fullscreenElement === document.documentElement
      if (nativeFullscreen) document.documentElement.classList.remove('app-fullscreen-fallback')
      const fullscreen = nativeFullscreen || document.documentElement.classList.contains('app-fullscreen-fallback')
      document.documentElement.classList.toggle('app-note-focus', fullscreen)
      setIsFullscreen(fullscreen)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        document.documentElement.classList.remove('app-fullscreen-fallback')
        document.documentElement.classList.remove('app-note-focus')
        setIsFullscreen(false)
      }
    }

    document.addEventListener('fullscreenchange', syncFullscreenState)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen()
      } else {
        document.documentElement.classList.remove('app-fullscreen-fallback')
        document.documentElement.classList.remove('app-note-focus')
        setIsFullscreen(false)
      }
      return
    }

    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen()
        document.documentElement.classList.remove('app-fullscreen-fallback')
        document.documentElement.classList.add('app-note-focus')
        setIsFullscreen(true)
        return
      } catch {
        // Fall back to an app-sized view in browsers that deny fullscreen.
      }
    }

    document.documentElement.classList.add('app-fullscreen-fallback')
    document.documentElement.classList.add('app-note-focus')
    setIsFullscreen(true)
  }

  const exportNotebook = () => {
    if (!notebook) return
    const blob = new Blob([JSON.stringify({ format: 'freenotes-notebook', version: 1, notebook }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${notebook.title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'notebook'}.freenotes.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  const searchResults = normalizedSearchQuery && notebook
    ? notebook.pages.flatMap((page, index) => {
        const pdfText = (page as typeof page & { pdfText?: string }).pdfText ?? ''
        const content = [
          page.title,
          ...page.elements.flatMap((element) =>
            element.type === 'text' || element.type === 'sticky-note'
              ? [element.text]
              : [],
          ),
          pdfText,
        ].filter(Boolean).join(' ')
        const matchIndex = content.toLocaleLowerCase().indexOf(normalizedSearchQuery)
        if (matchIndex === -1) return []
        const start = Math.max(0, matchIndex - 45)
        const end = Math.min(content.length, matchIndex + normalizedSearchQuery.length + 75)
        return [{ id: page.id, title: page.title, pageNumber: index + 1, snippet: `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}` }]
      })
    : []

  const importNotebook = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const candidate = parsed && typeof parsed === 'object' && 'notebook' in parsed ? parsed.notebook : parsed
      if (!candidate || typeof candidate !== 'object' || !('title' in candidate) || typeof candidate.title !== 'string' || !('pages' in candidate) || !Array.isArray(candidate.pages) || candidate.pages.length === 0) {
        throw new Error('This file is not a valid Medico Notes notebook.')
      }
      const imported = structuredClone(candidate) as typeof notebook
      if (!imported) return
      imported.id = crypto.randomUUID()
      imported.createdAt = Date.now()
      imported.updatedAt = Date.now()
      imported.pages = imported.pages.map((page) => ({ ...page, id: crypto.randomUUID(), elements: page.elements.map((element) => ({ ...element, id: crypto.randomUUID() })) }))
      useDocumentStore.setState((state) => {
        const notebooks = [...state.notebooks, imported]
        const activeNotebookId = imported.id
        localStorage.setItem('freenotes-notebooks', JSON.stringify({ notebooks, activeNotebookId, pinnedNotebookIds: state.pinnedNotebookIds, folders: state.folders, notebookFolderIds: state.notebookFolderIds }))
        return { notebooks, notebook: imported, activeNotebookId, history: [], future: [] }
      })
      setActivePage(imported.pages[0].id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to import this notebook.')
    }
    if (importInputRef.current) importInputRef.current.value = ''
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) {
        return
      }

      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()

        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [undo, redo])

  useEffect(() => {
    const closeSearch = () => setSearchOpen(false)
    window.addEventListener('freenotes-close-search', closeSearch)
    return () => window.removeEventListener('freenotes-close-search', closeSearch)
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [searchOpen])

  return (
    <header className={`top-toolbar${isFullscreen ? ' top-toolbar-fullscreen' : ''}`}>
      <div className="toolbar-left">
        <button className="toolbar-note-selector" onClick={() => {
          if (!notebook) return
          const title = window.prompt('Rename notebook', notebook.title)?.trim()
          if (title) renameNotebook(notebook.id, title)
        }} title="Rename notebook">
          <span>{notebook?.title ?? 'No notebook'}</span>
          <ChevronDown size={16} />
        </button>

        <div className="drawing-tools">
          <button
            className="toolbar-button"
            onClick={undo}
            disabled={history.length === 0}
            aria-label="Undo"
            title="Undo"
          >
            <Undo2 size={18} />
          </button>

          <button
            className="toolbar-button"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Redo"
            title="Redo"
          >
            <Redo2 size={18} />
          </button>

          <button
            className={`toolbar-button ${activeTool === 'select' ? 'toolbar-button-active' : ''}`}
            onClick={() => setActiveTool('select')}
            aria-label="Select and move elements"
            title="Select and move elements"
          >
            <MousePointer2 size={18} />
          </button>

          <button
            className={`toolbar-button ${activeTool === 'lasso' ? 'toolbar-button-active' : ''}`}
            onClick={() => setActiveTool('lasso')}
            aria-label="Lasso select"
            title="Lasso select objects and handwriting"
          >
            <Lasso size={18} />
          </button>

          <button
            className={`toolbar-button ${activeTool === 'laser' ? 'toolbar-button-active' : ''}`}
            onClick={() => setActiveTool('laser')}
            aria-label="Laser pointer"
            title="Laser pointer: point at content without leaving marks"
          >
            <Crosshair size={18} />
          </button>

          <button
            className={`toolbar-button ${rulerVisible ? 'toolbar-button-active' : ''}`}
            onClick={() => setRulerVisible(!rulerVisible)}
            aria-label={rulerVisible ? 'Hide ruler' : 'Show ruler'}
            aria-pressed={rulerVisible}
            title={rulerVisible ? 'Hide ruler' : 'Show ruler. Draw with pen or pencil along either edge.'}
          >
            <Ruler size={18} />
          </button>

          <button
            className={`toolbar-button ${activeTool === 'sticky-note' ? 'toolbar-button-active' : ''}`}
            onClick={() => setActiveTool('sticky-note')}
            aria-label="Add sticky note"
            title="Add sticky note, then click the page. Double-click a sticky note to edit its text."
          >
            <StickyNote size={18} />
          </button>

          <button
            className={`toolbar-button ${
              activeTool === 'pen'
                ? 'toolbar-button-active'
                : ''
            }`}
            onClick={() => setActiveTool('pen')}
            aria-label="Pen"
            title="Pen"
          >
            <Pen size={18} />
          </button>

          <button
            className={`toolbar-button ${
              activeTool === 'pencil'
                ? 'toolbar-button-active'
                : ''
            }`}
            onClick={() => setActiveTool('pencil')}
            aria-label="Pencil"
            title="Pencil"
          >
            <Pencil size={18} />
          </button>

          <button
            className={`toolbar-button ${autoShapeRecognition ? 'toolbar-button-active' : ''}`}
            onClick={() => setAutoShapeRecognition(!autoShapeRecognition)}
            aria-label="Toggle automatic shape recognition"
            aria-pressed={autoShapeRecognition}
            title={autoShapeRecognition ? 'Auto-shapes on: straighten lines and recognize circles and squares' : 'Auto-shapes off'}
          >
            <WandSparkles size={17} />
          </button>

          <button
            className={`toolbar-button ${
              activeTool === 'highlighter'
                ? 'toolbar-button-active'
                : ''
            }`}
            onClick={() => setActiveTool('highlighter')}
            aria-label="Highlighter"
            title="Highlighter"
          >
            <Highlighter size={18} />
          </button>

          <button
            className={`toolbar-button ${
              activeTool === 'eraser'
                ? 'toolbar-button-active'
                : ''
            }`}
            onClick={() => setActiveTool('eraser')}
            aria-label="Eraser"
            title="Eraser"
          >
            <Eraser size={18} />
          </button>

          <button
            className={`toolbar-button ${
              activeTool === 'text'
                ? 'toolbar-button-active'
                : ''
            }`}
            onClick={() => setActiveTool('text')}
            aria-label="Text"
            title="Text"
          >
            <Type size={18} />
          </button>

          <button
            className={`toolbar-button ${
              activeTool === 'shape'
                ? 'toolbar-button-active'
                : ''
            }`}
            onClick={() => setActiveTool('shape')}
            aria-label="Shape"
            title="Shape"
          >
            {shapeType === 'circle' ? (
              <Circle size={18} />
            ) : shapeType === 'triangle' ? (
              <Triangle size={18} />
            ) : (
              <Square size={18} />
            )}
          </button>

          {activeTool === 'shape' ? (
            <>
              <button
                className={`toolbar-button ${
                  shapeType === 'rectangle'
                    ? 'toolbar-button-active'
                    : ''
                }`}
                onClick={() => {
                  setShapeType('rectangle')
                  setActiveTool('shape')
                }}
                aria-label="Rectangle or Square"
                title="Rectangle / Square"
              >
                <Square size={17} />
              </button>

              <button
                className={`toolbar-button ${
                  shapeType === 'circle'
                    ? 'toolbar-button-active'
                    : ''
                }`}
                onClick={() => {
                  setShapeType('circle')
                  setActiveTool('shape')
                }}
                aria-label="Circle"
                title="Circle"
              >
                <Circle size={17} />
              </button>

              <button
                className={`toolbar-button ${
                  shapeType === 'triangle'
                    ? 'toolbar-button-active'
                    : ''
                }`}
                onClick={() => {
                  setShapeType('triangle')
                  setActiveTool('shape')
                }}
                aria-label="Triangle"
                title="Triangle"
              >
                <Triangle size={17} />
              </button>
            </>
          ) : null}

          {activeTool === 'eraser' ? (
            <div className="eraser-controls">
              <input
                type="range"
                min="6"
                max="50"
                value={eraserSize}
                onChange={(event) =>
                  setEraserSize(Number(event.target.value))
                }
                aria-label="Eraser size"
              />

              <span className="eraser-size-label">
                {eraserSize}px
              </span>
            </div>
          ) : activeTool === 'text' ? (
            <span className="text-tool-label">
              Click on the page to type
            </span>
          ) : (
            <>
              <input
                type="color"
                value={color}
                onChange={(event) =>
                  setColor(event.target.value)
                }
                aria-label="Pen color"
              />

              <input
                type="range"
                min="1"
                max="12"
                value={width}
                onChange={(event) =>
                  setWidth(Number(event.target.value))
                }
                aria-label="Pen thickness"
              />
            </>
          )}
        </div>
      </div>

      <div className="toolbar-right">
        <button
          className="toolbar-button"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          title={isFullscreen ? 'Exit full screen' : 'Full screen'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Expand size={18} />}
        </button>
        <AudioRecorder notebookId={notebook?.id ?? null} notebookTitle={notebook?.title ?? 'Notebook'} />
        <div className="toolbar-search-container" ref={searchContainerRef}>
          <button
            className="toolbar-button"
            onClick={() => {
              const nextOpen = !searchOpen
              if (nextOpen) window.dispatchEvent(new Event('freenotes-close-audio'))
              setSearchOpen(nextOpen)
              setSearchQuery('')
            }}
            aria-label="Search"
            aria-expanded={searchOpen}
            title="Search notebook content"
          >
            <Search size={19} />
          </button>
          {searchOpen && <div className="notebook-search-popover">
          <input
            autoFocus
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchOpen(false)
              if (event.key === 'Enter' && searchResults[0]) {
                setActivePage(searchResults[0].id)
                setSearchOpen(false)
              }
            }}
            placeholder="Search this notebook"
            aria-label="Search note content"
          />
          <div className="notebook-search-results" aria-live="polite">
            {!normalizedSearchQuery ? null
              : searchResults.length === 0 ? <p>No matches found.</p>
                : searchResults.map((result) => <button key={result.id} type="button" onClick={() => { setActivePage(result.id); setSearchOpen(false) }}>
                    <strong>Page {result.pageNumber}: {result.title}</strong>
                    <span>{result.snippet}</span>
                  </button>)}
          </div>
          </div>}
        </div>

        <button
          className="toolbar-button"
          onClick={async () => {
            if (!notebook) return
            const file = new File([JSON.stringify({ format: 'freenotes-notebook', version: 1, notebook }, null, 2)], `${notebook.title}.freenotes.json`, { type: 'application/json' })
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
              try { await navigator.share({ title: notebook.title, files: [file] }) } catch { /* User cancelled sharing. */ }
            } else exportNotebook()
          }}
          aria-label="Share"
          title="Share"
        >
          <Share2 size={19} />
        </button>

        <button
          className="toolbar-button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="More options"
          title="More options"
        >
          <MoreHorizontal size={20} />
        </button>
        {menuOpen && <div className="toolbar-menu">
          <button onClick={() => { exportNotebook(); setMenuOpen(false) }}>Export notebook</button>
          <button onClick={() => { importInputRef.current?.click(); setMenuOpen(false) }}>Import notebook</button>
          {notebook && <button onClick={() => { const duplicate = structuredClone(notebook); duplicate.id = crypto.randomUUID(); duplicate.title = `${duplicate.title} Copy`; duplicate.createdAt = Date.now(); duplicate.updatedAt = Date.now(); duplicate.pages = duplicate.pages.map((page) => ({ ...page, id: crypto.randomUUID(), elements: page.elements.map((element) => ({ ...element, id: crypto.randomUUID() })) })); useDocumentStore.setState((state) => { const notebooks = [...state.notebooks, duplicate]; localStorage.setItem('freenotes-notebooks', JSON.stringify({ notebooks, activeNotebookId: duplicate.id, pinnedNotebookIds: state.pinnedNotebookIds, folders: state.folders, notebookFolderIds: state.notebookFolderIds })); return { notebooks, notebook: duplicate, activeNotebookId: duplicate.id, history: [], future: [] } }); setActivePage(duplicate.pages[0].id); switchNotebook(duplicate.id); setMenuOpen(false) }}>Duplicate notebook</button>}
          <button onClick={() => setMenuOpen(false)}>Close</button>
        </div>}
        <input ref={importInputRef} type="file" accept=".json,.freenotes.json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importNotebook(file) }} />
      </div>
    </header>
  )
}

export default TopToolbar
