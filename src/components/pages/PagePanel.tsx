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
  const activePageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

    const updateActivePageAfterScroll = () => {
      if (activePageTimerRef.current) clearTimeout(activePageTimerRef.current)
      activePageTimerRef.current = setTimeout(() => {
        const panelRect = panel.getBoundingClientRect()
        let mostVisiblePageId: string | null = null
        let greatestVisibleArea = 0

        panel.querySelectorAll<HTMLElement>('[data-note-page-id]').forEach((page) => {
          const rect = page.getBoundingClientRect()
          const visibleHeight = Math.max(
            0,
            Math.min(rect.bottom, panelRect.bottom) - Math.max(rect.top, panelRect.top),
          )
          const visibleArea = visibleHeight * Math.max(0, Math.min(rect.right, panelRect.right) - Math.max(rect.left, panelRect.left))
          if (visibleArea > greatestVisibleArea) {
            greatestVisibleArea = visibleArea
            mostVisiblePageId = page.getAttribute('data-note-page-id')
          }
        })

        // Keep page/canvas mounting out of the active scroll gesture. Updating
        // this only after scroll events settle prevents React work from
        // interrupting Safari's compositor-driven PDF scrolling on iPad.
        if (mostVisiblePageId) setActivePage(mostVisiblePageId)
        activePageTimerRef.current = null
      }, 140)
    }

    panel.addEventListener('scroll', updateActivePageAfterScroll, { passive: true })
    return () => {
      panel.removeEventListener('scroll', updateActivePageAfterScroll)
      if (activePageTimerRef.current) clearTimeout(activePageTimerRef.current)
      activePageTimerRef.current = null
    }
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

  const handleTouchPointerGuard = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !isFullscreen ||
      event.pointerType !== 'touch' ||
      !window.matchMedia('(any-pointer: coarse)').matches ||
      !(event.target instanceof HTMLCanvasElement)
    ) return

    // Do not let a finger begin a stroke in fullscreen. Safari handles scrolling
    // natively; Apple Pencil remains a pointerType "pen" and can still write.
    event.stopPropagation()
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
        onPointerDownCapture={handleTouchPointerGuard}
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
