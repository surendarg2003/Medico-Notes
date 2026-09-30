import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { renderPdfPageImage } from '../../utils/pdfStorage'

interface PdfPageImageProps {
  assetId: string
  pageNumber: number
  enabled?: boolean
  priority?: boolean
  maxDimension?: number
  extractText?: boolean
  className?: string
  onText?: (text: string) => void
}

function PdfPageImage({
  assetId,
  pageNumber,
  enabled = true,
  priority = false,
  maxDimension = 1100,
  extractText = false,
  className = '',
  onText,
}: PdfPageImageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches,
  )
  const [isNearViewport, setIsNearViewport] = useState(() => typeof IntersectionObserver === 'undefined')
  const [renderedPage, setRenderedPage] = useState<{ key: string; url: string } | null>(null)
  const [failedPageKey, setFailedPageKey] = useState<string | null>(null)
  const reportText = useEffectEvent((text: string) => onText?.(text))
  const renderDimension = isCoarsePointer && maxDimension > 300
    ? Math.min(maxDimension, maxDimension > 1000 ? 1600 : 600)
    : maxDimension
  const renderPixelBudget = isCoarsePointer ? 3_000_000 : 8_500_000
  const pageKey = `${assetId}:${pageNumber}:${renderDimension}:${renderPixelBudget}:${extractText}`
  const shouldLoad = enabled || isNearViewport
  const imageUrl = renderedPage?.key === pageKey ? renderedPage.url : null
  const failed = failedPageKey === pageKey

  useEffect(() => {
    const query = window.matchMedia('(any-pointer: coarse)')
    const updatePointerMode = () => setIsCoarsePointer(query.matches)
    updatePointerMode()
    query.addEventListener('change', updatePointerMode)
    return () => query.removeEventListener('change', updatePointerMode)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || enabled || !('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting)
      },
      { rootMargin: '120px' },
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [enabled])

  useEffect(() => {
    if (!shouldLoad) return
    let cancelled = false
    let ownedUrl: string | null = null

    void renderPdfPageImage(
      assetId,
      pageNumber,
      renderDimension,
      extractText,
      priority,
      renderPixelBudget,
    ).then((result) => {
      if (cancelled) {
        URL.revokeObjectURL(result.url)
        return
      }
      ownedUrl = result.url
      setRenderedPage({ key: pageKey, url: result.url })
      reportText(result.text)
    }).catch(() => {
      if (!cancelled) setFailedPageKey(pageKey)
    })

    return () => {
      cancelled = true
      if (ownedUrl) URL.revokeObjectURL(ownedUrl)
    }
  }, [assetId, enabled, extractText, isNearViewport, pageNumber, pageKey, priority, renderDimension, renderPixelBudget, shouldLoad])

  return (
    <div ref={hostRef} className={`pdf-page-image ${className}`} aria-busy={shouldLoad && !imageUrl && !failed}>
      {imageUrl ? (
        <img src={imageUrl} alt="" draggable={false} />
      ) : (
        <span className="pdf-page-image-status" aria-hidden="true">
          {failed ? 'PDF unavailable' : 'Loading page…'}
        </span>
      )}
    </div>
  )
}

export default PdfPageImage
