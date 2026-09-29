import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { usePageStore } from '../../stores/pageStore'
import NoteCanvas from '../../canvas/NoteCanvas'
import PdfPageImage from './PdfPageImage'

function PagePanel() {
  const notebook = useDocumentStore((state) => state.notebook)
  const setPageBackground = useDocumentStore((state) => state.setPageBackground)
  const activePageId = usePageStore((state) => state.activePageId)
  const setActivePage = usePageStore((state) => state.setActivePage)
  const pagePanelRef = useRef<HTMLDivElement>(null)
  const touchScrollPointersRef = useRef(new Map<number, number>())
  const lastTouchScrollYRef = useRef<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(() =>
    document.documentElement.classList.contains('app-note-focus'),
  )

  useEffect(() => {
    const root = document.documentElement
    const updateFullscreen = () =>
      setIsFullscreen(root.classList.contains('app-note-focus'))

    const observer = new MutationObserver(updateFullscreen)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    updateFullscreen()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!notebook || notebook.pages.length === 0) return

    const activePageExists = notebook.pages.some((page) => page.id === activePageId)
    if (!activePageExists) setActivePage(notebook.pages[0].id)
  }, [notebook, activePageId, setActivePage])

  useEffect(() => {
    if (!isFullscreen) return
    const panel = pagePanelRef.current
    if (!panel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
        const pageId = mostVisible?.target.getAttribute('data-note-page-id')
        if (pageId && mostVisible.intersectionRatio >= 0.4) setActivePage(pageId)
      },
      { root: panel, threshold: [0.25, 0.4, 0.6, 0.8] },
    )

    panel.querySelectorAll<HTMLElement>('[data-note-page-id]').forEach((page) =>
      observer.observe(page),
    )
    return () => observer.disconnect()
  }, [isFullscreen, notebook?.id, notebook?.pages.length, setActivePage])

  useEffect(() => {
    if (!isFullscreen) return
    const panel = pagePanelRef.current
    if (!panel) return

    const frame = requestAnimationFrame(() => {
      panel.querySelector<HTMLElement>(`[data-note-page-id="${activePageId}"]`)
        ?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [isFullscreen])

  if (!notebook) return null

  const page = notebook.pages.find((item) => item.id === activePageId) ?? notebook.pages[0]
  const activeIndex = Math.max(0, notebook.pages.findIndex((item) => item.id === page.id))

  const handleTouchScrollStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !isFullscreen ||
      event.pointerType !== 'touch' ||
      !window.matchMedia('(pointer: coarse)').matches ||
      !(event.target instanceof HTMLCanvasElement)
    ) return

    // Fullscreen tablet gestures belong to the document scroller. Apple Pencil
    // events remain handled by NoteCanvas because they use pointerType "pen".
    event.preventDefault()
    event.stopPropagation()
    touchScrollPointersRef.current.set(event.pointerId, event.clientY)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some Safari versions can decline capture during a multi-touch gesture;
      // the touch pointer continues to bubble through this panel normally.
    }

    if (touchScrollPointersRef.current.size >= 2) {
      const pointers = [...touchScrollPointersRef.current.values()]
      lastTouchScrollYRef.current = pointers.reduce((sum, pointer) => sum + pointer, 0) / pointers.length
    }
  }

  const handleTouchScrollMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = touchScrollPointersRef.current
    if (!isFullscreen || event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return

    event.preventDefault()
    event.stopPropagation()
    pointers.set(event.pointerId, event.clientY)
    if (pointers.size < 2) return

    const midpointY = [...pointers.values()].reduce((sum, pointer) => sum + pointer, 0) / pointers.size
    if (lastTouchScrollYRef.current !== null) {
      event.currentTarget.scrollTop -= midpointY - lastTouchScrollYRef.current
    }
    lastTouchScrollYRef.current = midpointY
  }

  const handleTouchScrollEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = touchScrollPointersRef.current
    if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return

    event.preventDefault()
    event.stopPropagation()
    pointers.delete(event.pointerId)
    if (pointers.size < 2) lastTouchScrollYRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const renderPage = (
    pageItem: (typeof notebook.pages)[number],
    renderCanvas = true,
  ) => {
    const hasPdfBackground = Boolean(pageItem.pdfBackground || pageItem.pdfAssetId)

    return (
      <div className={`note-page note-page-${pageItem.background}`}>
        <div className="note-page-header">
          <span>{pageItem.title}</span>

          <select
            value={pageItem.background}
            title={hasPdfBackground ? 'Change the page paper behind the imported PDF' : 'Choose page paper'}
            onChange={(event) =>
              setPageBackground(
                pageItem.id,
                event.target.value as typeof pageItem.background,
              )
            }
          >
            <option value="plain">Plain</option>
            <option value="ruled">Ruled</option>
            <option value="grid">Grid</option>
            <option value="dotted">Dotted</option>
          </select>
          {hasPdfBackground && (
            <span className="page-background-note">
              Changes apply behind the imported PDF
            </span>
          )}
        </div>

        <div className={`note-page-content${hasPdfBackground ? ' note-page-content-pdf' : ''}`}>
          <div className="note-page-canvas-frame">
            {pageItem.pdfBackground && (
              <img
                className="note-page-pdf-background"
                src={pageItem.pdfBackground}
                alt=""
                draggable={false}
              />
            )}
            {pageItem.pdfAssetId && pageItem.pdfPageNumber && (
              <PdfPageImage
                assetId={pageItem.pdfAssetId}
                pageNumber={pageItem.pdfPageNumber}
                enabled={renderCanvas}
                maxDimension={pageItem.id === activePageId ? 2800 : 1000}
                priority={pageItem.id === activePageId}
                extractText={pageItem.id === activePageId}
                className="note-page-pdf-background"
                onText={(text) => {
                  if (pageItem.pdfText === text) return
                  useDocumentStore.setState((state) => {
                    if (!state.notebook) return state
                    return {
                      notebook: {
                        ...state.notebook,
                        pages: state.notebook.pages.map((item) =>
                          item.id === pageItem.id ? { ...item, pdfText: text } : item,
                        ),
                      },
                    }
                  })
                }}
              />
            )}
            {renderCanvas ? (
              <NoteCanvas pageId={pageItem.id} width={760} height={900} />
            ) : (
              <div className="fullscreen-page-placeholder" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    )
  }

  if (isFullscreen) {
    return (
      <div
        className="page-panel page-panel-scroll-mode"
        ref={pagePanelRef}
        onPointerDownCapture={handleTouchScrollStart}
        onPointerMoveCapture={handleTouchScrollMove}
        onPointerUpCapture={handleTouchScrollEnd}
        onPointerCancelCapture={handleTouchScrollEnd}
      >
        {notebook.pages.map((pageItem, index) => (
          <section
            key={pageItem.id}
            className="fullscreen-scroll-page"
            data-note-page-id={pageItem.id}
            aria-label={pageItem.title}
          >
            {renderPage(pageItem, Math.abs(index - activeIndex) <= 1)}
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="page-panel">
      {renderPage(page)}
    </div>
  )
}

export default PagePanel
