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
  const lastTouchScrollYRef = useRef<number | null>(null)
  const lastTouchScrollSampleRef = useRef<{ y: number; time: number } | null>(null)
  const pendingTouchScrollDeltaRef = useRef(0)
  const touchScrollFrameRef = useRef<number | null>(null)
  const touchScrollVelocityRef = useRef(0)
  const touchInertiaFrameRef = useRef<number | null>(null)
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
    if (!isFullscreen || !window.matchMedia('(any-pointer: coarse)').matches) return
    const panel = pagePanelRef.current
    if (!panel) return

    const getMidpointY = (touches: TouchList) => {
      let total = 0
      for (let index = 0; index < touches.length; index += 1) total += touches[index].clientY
      return total / touches.length
    }
    const isCanvasTouch = (event: TouchEvent) =>
      event.target instanceof Element && Boolean(event.target.closest('.note-canvas-container'))

    const handleTouchStart = (event: TouchEvent) => {
      if (!isCanvasTouch(event) || event.touches.length < 2) return
      if (touchInertiaFrameRef.current !== null) {
        cancelAnimationFrame(touchInertiaFrameRef.current)
        touchInertiaFrameRef.current = null
      }
      touchScrollVelocityRef.current = 0
      lastTouchScrollYRef.current = getMidpointY(event.touches)
      lastTouchScrollSampleRef.current = {
        y: lastTouchScrollYRef.current,
        time: event.timeStamp,
      }
      event.preventDefault()
    }
    const handleTouchMove = (event: TouchEvent) => {
      if (!isCanvasTouch(event) || event.touches.length < 2) return
      event.preventDefault()
      const midpointY = getMidpointY(event.touches)
      if (lastTouchScrollYRef.current !== null) {
        pendingTouchScrollDeltaRef.current += lastTouchScrollYRef.current - midpointY
        const sample = lastTouchScrollSampleRef.current
        const elapsed = sample ? event.timeStamp - sample.time : 0
        if (elapsed > 0) {
          const instantVelocity = Math.max(-2.5, Math.min(2.5, (sample!.y - midpointY) / elapsed))
          touchScrollVelocityRef.current =
            touchScrollVelocityRef.current * 0.65 + instantVelocity * 0.35
        }
        if (touchScrollFrameRef.current === null) {
          touchScrollFrameRef.current = requestAnimationFrame(() => {
            panel.scrollTop += pendingTouchScrollDeltaRef.current
            pendingTouchScrollDeltaRef.current = 0
            touchScrollFrameRef.current = null
          })
        }
      }
      lastTouchScrollYRef.current = midpointY
      lastTouchScrollSampleRef.current = { y: midpointY, time: event.timeStamp }
    }
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        lastTouchScrollYRef.current = getMidpointY(event.touches)
        lastTouchScrollSampleRef.current = {
          y: lastTouchScrollYRef.current,
          time: event.timeStamp,
        }
        return
      }

      lastTouchScrollYRef.current = null
      lastTouchScrollSampleRef.current = null
      if (touchScrollFrameRef.current !== null) {
        cancelAnimationFrame(touchScrollFrameRef.current)
        touchScrollFrameRef.current = null
      }
      panel.scrollTop += pendingTouchScrollDeltaRef.current
      pendingTouchScrollDeltaRef.current = 0

      let previousTime = performance.now()
      const continueScrolling = (time: number) => {
        const elapsed = Math.min(32, time - previousTime)
        previousTime = time
        panel.scrollTop += touchScrollVelocityRef.current * elapsed
        touchScrollVelocityRef.current *= Math.pow(0.92, elapsed / 16.67)
        if (Math.abs(touchScrollVelocityRef.current) < 0.025) {
          touchInertiaFrameRef.current = null
          touchScrollVelocityRef.current = 0
          return
        }
        touchInertiaFrameRef.current = requestAnimationFrame(continueScrolling)
      }
      if (Math.abs(touchScrollVelocityRef.current) >= 0.025) {
        touchInertiaFrameRef.current = requestAnimationFrame(continueScrolling)
      }
    }

    panel.addEventListener('touchstart', handleTouchStart, { passive: false })
    panel.addEventListener('touchmove', handleTouchMove, { passive: false })
    panel.addEventListener('touchend', handleTouchEnd, { passive: true })
    panel.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    return () => {
      panel.removeEventListener('touchstart', handleTouchStart)
      panel.removeEventListener('touchmove', handleTouchMove)
      panel.removeEventListener('touchend', handleTouchEnd)
      panel.removeEventListener('touchcancel', handleTouchEnd)
      if (touchScrollFrameRef.current !== null) cancelAnimationFrame(touchScrollFrameRef.current)
      if (touchInertiaFrameRef.current !== null) cancelAnimationFrame(touchInertiaFrameRef.current)
      touchScrollFrameRef.current = null
      touchInertiaFrameRef.current = null
      pendingTouchScrollDeltaRef.current = 0
      touchScrollVelocityRef.current = 0
      lastTouchScrollYRef.current = null
    }
  }, [isFullscreen])

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

  const handleTouchPointerGuard = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !isFullscreen ||
      event.pointerType !== 'touch' ||
      !window.matchMedia('(any-pointer: coarse)').matches ||
      !(event.target instanceof HTMLCanvasElement)
    ) return

    // Do not let a finger begin a stroke in fullscreen. Native touch events
    // below own two-finger scrolling; Apple Pencil remains a pointerType "pen".
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
