import { MoreHorizontal } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import type {
  Page,
  ShapeElement,
  StrokeElement,
  TextElement,
} from '../../types/document'

interface PdfPageLike {
  pdfBackground?: string
  pdfSourceName?: string
}

interface PageThumbnailProps {
  page: Page
  pageNumber: number
  isActive: boolean
  canDelete: boolean
  onClick: () => void
  onDuplicate: () => void
  onDelete: () => void
  onRename: (title: string) => void
}

function getStrokePath(stroke: StrokeElement): string {
  if (stroke.points.length === 0) {
    return ''
  }

  const firstPoint = stroke.points[0]

  if (stroke.points.length === 1) {
    return `M ${firstPoint.x} ${firstPoint.y}`
  }

  let path = `M ${firstPoint.x} ${firstPoint.y}`

  for (
    let index = 1;
    index < stroke.points.length - 1;
    index += 1
  ) {
    const current = stroke.points[index]
    const next = stroke.points[index + 1]

    const midpointX = (current.x + next.x) / 2
    const midpointY = (current.y + next.y) / 2

    path += ` Q ${current.x} ${current.y} ${midpointX} ${midpointY}`
  }

  const lastPoint =
    stroke.points[stroke.points.length - 1]

  path += ` L ${lastPoint.x} ${lastPoint.y}`

  return path
}

function getBackgroundStyle(
  background: Page['background'],
): CSSProperties {
  if (background === 'ruled') {
    return {
      backgroundImage:
        'repeating-linear-gradient(to bottom, transparent 0, transparent 13px, #dfe3e8 14px)',
    }
  }

  if (background === 'grid') {
    return {
      backgroundImage:
        'linear-gradient(#e4e7eb 1px, transparent 1px), linear-gradient(90deg, #e4e7eb 1px, transparent 1px)',
      backgroundSize: '14px 14px',
    }
  }

  if (background === 'dotted') {
    return {
      backgroundImage:
        'radial-gradient(#d8dce1 1px, transparent 1px)',
      backgroundSize: '10px 10px',
    }
  }

  return {}
}

function stopEvent(event: MouseEvent) {
  event.stopPropagation()
}

function getShapeDashArray(
  shape: ShapeElement & {
    lineStyle?: 'solid' | 'dashed' | 'dotted'
  },
): string {
  if (shape.lineStyle === 'dashed') {
    return '12 8'
  }

  if (shape.lineStyle === 'dotted') {
    return '2 7'
  }

  return 'none'
}

function renderShape(
  shape: ShapeElement & {
    lineStyle?: 'solid' | 'dashed' | 'dotted'
  },
) {
  const centerX = shape.x + shape.width / 2
  const centerY = shape.y + shape.height / 2

  const transform = `rotate(${shape.rotation ?? 0} ${centerX} ${centerY})`

  const fill =
    shape.fillColor === 'transparent'
      ? 'none'
      : shape.fillColor

  const stroke =
    shape.strokeWidth > 0
      ? shape.strokeColor
      : 'none'

  const dashArray = getShapeDashArray(shape)

  if (shape.shape === 'rectangle') {
    return (
      <rect
        key={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx="1"
        fill={fill}
        stroke={stroke}
        strokeWidth={shape.strokeWidth}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={transform}
      />
    )
  }

  if (shape.shape === 'circle') {
    return (
      <ellipse
        key={shape.id}
        cx={centerX}
        cy={centerY}
        rx={shape.width / 2}
        ry={shape.height / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={shape.strokeWidth}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={transform}
      />
    )
  }

  return (
    <polygon
      key={shape.id}
      points={`
        ${centerX},${shape.y}
        ${shape.x + shape.width},${shape.y + shape.height}
        ${shape.x},${shape.y + shape.height}
      `}
      fill={fill}
      stroke={stroke}
      strokeWidth={shape.strokeWidth}
      strokeDasharray={dashArray}
      strokeLinecap="round"
      strokeLinejoin="round"
      transform={transform}
    />
  )
}

function renderText(text: TextElement) {
  const lineHeight = text.fontSize * 1.25

  const lines = text.text
    .split('\n')
    .slice(0, 8)

  const x =
    text.alignment === 'center'
      ? text.x + text.width / 2
      : text.alignment === 'right'
        ? text.x + text.width
        : text.x

  return (
    <g key={text.id}>
      {lines.map((line, index) => (
        <text
          key={`${text.id}-${index}`}
          x={x}
          y={text.y + index * lineHeight}
          fill={text.color}
          fontFamily={text.fontFamily}
          fontSize={text.fontSize}
          fontWeight={text.bold ? 700 : 400}
          fontStyle={text.italic ? 'italic' : 'normal'}
          textDecoration={
            text.underline ? 'underline' : 'none'
          }
          textAnchor={
            text.alignment === 'center'
              ? 'middle'
              : text.alignment === 'right'
                ? 'end'
                : 'start'
          }
        >
          {line || ' '}
        </text>
      ))}
    </g>
  )
}

function PageThumbnail({
  page,
  pageNumber,
  isActive,
  canDelete,
  onClick,
  onDuplicate,
  onDelete,
  onRename,
}: PageThumbnailProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(page.title)

  const inputRef = useRef<HTMLInputElement>(null)

  const pdfPage = page as Page & PdfPageLike
  const isPdfPage = Boolean(pdfPage.pdfBackground)

  const strokes = page.elements.filter(
    (element): element is StrokeElement =>
      element.type === 'stroke',
  )

  const shapes = page.elements.filter(
    (element): element is ShapeElement =>
      element.type === 'shape',
  )

  const texts = page.elements.filter(
    (element): element is TextElement =>
      element.type === 'text',
  )

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startRename = () => {
    setTitle(page.title)
    setMenuOpen(false)
    setEditing(true)
  }

  const finishRename = () => {
    const trimmedTitle = title.trim()

    if (trimmedTitle) {
      onRename(trimmedTitle)
      setTitle(trimmedTitle)
    } else {
      setTitle(page.title)
    }

    setEditing(false)
  }

  const handleRenameKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finishRename()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setTitle(page.title)
      setEditing(false)
    }
  }

  return (
    <div className="page-thumbnail-wrapper">
      <button
        className={`page-thumbnail ${
          isActive ? 'page-thumbnail-active' : ''
        }`}
        onClick={onClick}
        type="button"
      >
        <div
          className="page-thumbnail-preview"
          style={{
            ...getBackgroundStyle(page.background),
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {isPdfPage && (
            <img
              src={pdfPage.pdfBackground}
              alt={`PDF page ${pageNumber}`}
              draggable={false}
              className="page-thumbnail-pdf-preview"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 0,
              }}
            />
          )}

          <svg
            viewBox="0 0 760 900"
            preserveAspectRatio="none"
            className="page-thumbnail-canvas"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              zIndex: 1,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            <defs>
              <clipPath
                id={`page-thumbnail-clip-${page.id}`}
                clipPathUnits="userSpaceOnUse"
              >
                <rect
                  x="0"
                  y="0"
                  width="760"
                  height="900"
                />
              </clipPath>
            </defs>

            <g
              clipPath={`url(#page-thumbnail-clip-${page.id})`}
            >
              {strokes.map((stroke) => (
                <path
                  key={stroke.id}
                  d={getStrokePath(stroke)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeOpacity={stroke.opacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {shapes.map((shape) =>
                renderShape(
                  shape as ShapeElement & {
                    lineStyle?:
                      | 'solid'
                      | 'dashed'
                      | 'dotted'
                  },
                ),
              )}

              {texts.map((text) =>
                renderText(text),
              )}
            </g>
          </svg>

          {isPdfPage && (
            <div
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 5px',
                borderRadius: '4px',
                background:
                  'rgba(255, 255, 255, 0.92)',
                color: '#55555c',
                fontSize: '9px',
                fontWeight: 700,
                lineHeight: 1.2,
                pointerEvents: 'none',
                boxShadow:
                  '0 1px 3px rgba(0,0,0,0.08)',
              }}
              title={
                pdfPage.pdfSourceName
                  ? `Imported from ${pdfPage.pdfSourceName}`
                  : 'Imported PDF page'
              }
            >
              PDF
            </div>
          )}
        </div>

        <div className="page-thumbnail-footer">
          <span className="page-thumbnail-number">
            {pageNumber}
          </span>

          {editing ? (
            <input
              ref={inputRef}
              className="page-title-input"
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)
              }
              onBlur={finishRename}
              onKeyDown={handleRenameKeyDown}
              onClick={stopEvent}
              onMouseDown={stopEvent}
              type="text"
              aria-label="Page title"
            />
          ) : (
            <span className="page-thumbnail-title">
              {page.title}
            </span>
          )}
        </div>
      </button>

      <div className="page-thumbnail-menu-container">
        <button
          type="button"
          className="page-thumbnail-menu-button"
          onMouseDown={stopEvent}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((open) => !open)
          }}
          aria-label={`Page ${pageNumber} options`}
          title="Page options"
        >
          <MoreHorizontal size={15} />
        </button>

        {menuOpen && (
          <div
            className="page-thumbnail-menu"
            onMouseDown={stopEvent}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                startRename()
              }}
            >
              Rename
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen(false)
                onDuplicate()
              }}
            >
              Duplicate
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen(false)
                onDelete()
              }}
              disabled={!canDelete}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default PageThumbnail
