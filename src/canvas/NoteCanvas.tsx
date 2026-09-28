import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent,
  type CSSProperties,
} from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  FileDown,
  FileUp,
  ImagePlus,
  Italic,
  Loader2,
  Trash2,
  Underline,
  X,
} from 'lucide-react'
import { useDocumentStore } from '../stores/documentStore'
import { usePageStore } from '../stores/pageStore'
import { useToolStore } from '../stores/toolStore'
import type {
  Point,
  ImageElement,
  ShapeElement,
  StrokeElement,
  TextElement,
  Page,
  NoteElement,
  Notebook,
  StickyNoteElement,
} from '../types/document'

interface NoteCanvasProps {
  pageId: string
  width: number
  height: number
}

type ShapeLineStyle = 'solid' | 'dashed' | 'dotted'

type StyledShapeElement = ShapeElement & {
  lineStyle?: ShapeLineStyle
}

type PdfPage = Page & {
  pdfBackground?: string
  pdfSourceName?: string
  pdfText?: string
}

interface TextDragState {
  textId: string
  offsetX: number
  offsetY: number
}

interface StickyDragState {
  pointerId: number
  startPointer: Point
  currentPointer: Point
  sticky: StickyNoteElement
}

type ImageCropEdge = 'left' | 'right' | 'top' | 'bottom'

type ResizeHandle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'

interface TextResizeState {
  textId: string
  handle: ResizeHandle
  startPointerX: number
  startPointerY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

interface ShapeDrawState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface ShapeDragState {
  shapeId: string
  startPointerX: number
  startPointerY: number
  startX: number
  startY: number
}

interface ShapeRotationState {
  shapeId: string
  centerX: number
  centerY: number
  startRotation: number
  startPointerAngle: number
}

interface ShapeResizeState {
  shapeId: string
  handle: ResizeHandle
  startPointerX: number
  startPointerY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  startRotation: number
}

interface SelectionResizeState {
  pointerId: number
  startPointer: Point
  bounds: { x: number; y: number; width: number; height: number }
}

interface SelectionRotateState {
  pointerId: number
  centerX: number
  centerY: number
  startAngle: number
  startRotation: number
}

const TEXT_FONT_SIZES = [
  14,
  16,
  18,
  20,
  22,
  24,
  28,
  32,
  40,
  48,
]

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: StrokeElement,
) {
  const points = stroke.points

  if (points.length === 0) {
    return
  }

  context.save()
  context.beginPath()

  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2)
    context.fillStyle = stroke.color
    context.globalAlpha = stroke.opacity
    context.fill()
    context.restore()
    return
  }

  context.strokeStyle = stroke.color
  context.globalAlpha = stroke.opacity
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (points.some((point) => point.pressure !== undefined)) {
    drawPressureSegments(context, points, stroke.width)
  } else {
    traceSmoothStroke(context, points)
    context.lineWidth = stroke.width
    context.stroke()
  }
  context.restore()
}

function drawPressureSegments(context: CanvasRenderingContext2D, points: Point[], baseWidth: number) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    const pressure = Math.max(0.08, Math.min(1, ((previous.pressure ?? 0.5) + (point.pressure ?? 0.5)) / 2))
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(point.x, point.y)
    context.lineWidth = baseWidth * (0.35 + pressure * 1.3)
    context.stroke()
  }
}

function traceSmoothStroke(
  context: CanvasRenderingContext2D,
  points: Point[],
) {
  const filteredPoints = points.length < 3
    ? points
    : points.map((point, index) => {
        if (index === 0 || index === points.length - 1) return point
        const previous = points[index - 1]
        const next = points[index + 1]
        return {
          ...point,
          x: previous.x * 0.18 + point.x * 0.64 + next.x * 0.18,
          y: previous.y * 0.18 + point.y * 0.64 + next.y * 0.18,
        }
      })

  const first = filteredPoints[0]
  context.moveTo(first.x, first.y)

  for (let index = 0; index < filteredPoints.length - 1; index += 1) {
    const previous = filteredPoints[Math.max(0, index - 1)]
    const start = filteredPoints[index]
    const end = filteredPoints[index + 1]
    const next = filteredPoints[Math.min(filteredPoints.length - 1, index + 2)]

    // Catmull-Rom control points keep the curve flowing through the real
    // stylus samples without sharp direction changes between samples.
    context.bezierCurveTo(
      start.x + (end.x - previous.x) / 6,
      start.y + (end.y - previous.y) / 6,
      end.x - (next.x - start.x) / 6,
      end.y - (next.y - start.y) / 6,
      end.x,
      end.y,
    )
  }
}

function wrapTextLines(
  context: CanvasRenderingContext2D,
  textElement: TextElement,
): string[] {
  const maxWidth = Math.max(1, textElement.width)

  const wrapLine = (line: string): string[] => {
    if (!line) {
      return ['']
    }

    const wrapped: string[] = []
    let current = ''

    const pushCurrent = () => {
      if (current) {
        wrapped.push(current.trimEnd())
        current = ''
      }
    }

    const addLongWord = (word: string) => {
      let remaining = word

      while (remaining.length > 0) {
        let fitLength = 0

        for (
          let index = 1;
          index <= remaining.length;
          index += 1
        ) {
          const piece = remaining.slice(0, index)
          const test = current + piece

          if (context.measureText(test).width > maxWidth) {
            break
          }

          fitLength = index
        }

        if (fitLength === 0) {
          if (current) {
            pushCurrent()
            continue
          }

          fitLength = 1
        }

        current += remaining.slice(0, fitLength)
        remaining = remaining.slice(fitLength)

        if (remaining.length > 0) {
          pushCurrent()
        }
      }
    }

    const tokens = line.split(/(\s+)/)

    for (const token of tokens) {
      if (/^\s+$/.test(token)) {
        if (!current) {
          continue
        }

        const candidate = current + token

        if (context.measureText(candidate).width <= maxWidth) {
          current = candidate
        } else {
          pushCurrent()
        }

        continue
      }

      if (!token) {
        continue
      }

      const candidate = current + token

      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate
        continue
      }

      if (current) {
        pushCurrent()
      }

      if (context.measureText(token).width <= maxWidth) {
        current = token
      } else {
        addLongWord(token)
      }
    }

    pushCurrent()

    return wrapped.length > 0 ? wrapped : ['']
  }

  return textElement.text
    .split('\n')
    .flatMap((line) => wrapLine(line))
}

function getTextRequiredHeight(
  context: CanvasRenderingContext2D,
  textElement: TextElement,
): number {
  context.save()

  context.font = `${textElement.italic ? 'italic ' : ''}${
    textElement.bold ? 'bold ' : ''
  }${textElement.fontSize}px ${textElement.fontFamily}`

  const lines = wrapTextLines(context, textElement)
  const lineHeight = textElement.fontSize * 1.25
  const verticalPadding = Math.max(
    8,
    textElement.fontSize * 0.2,
  )

  context.restore()

  return Math.max(
    40,
    lines.length * lineHeight + verticalPadding,
  )
}

function drawShape(
  context: CanvasRenderingContext2D,
  shape: StyledShapeElement,
) {
  context.save()

  context.strokeStyle = shape.strokeColor
  context.fillStyle = shape.fillColor
  context.lineWidth = shape.strokeWidth
  context.lineJoin = 'round'
  context.lineCap = 'round'

  const lineStyle = shape.lineStyle ?? 'solid'

  if (lineStyle === 'dashed') {
    context.setLineDash([12, 8])
  } else if (lineStyle === 'dotted') {
    context.setLineDash([2, 7])
  } else {
    context.setLineDash([])
  }

  const x = shape.x
  const y = shape.y
  const width = shape.width
  const height = shape.height
  const centerX = x + width / 2
  const centerY = y + height / 2
  const rotation = shape.rotation ?? 0

  context.translate(centerX, centerY)
  context.rotate((rotation * Math.PI) / 180)

  const localX = -width / 2
  const localY = -height / 2

  if (shape.shape === 'rectangle') {
    if (shape.fillColor !== 'transparent') {
      context.fillRect(localX, localY, width, height)
    }

    if (shape.strokeWidth > 0) {
      context.strokeRect(localX, localY, width, height)
    }
  }

  if (shape.shape === 'circle') {
    const radiusX = width / 2
    const radiusY = height / 2

    context.beginPath()
    context.ellipse(
      0,
      0,
      radiusX,
      radiusY,
      0,
      0,
      Math.PI * 2,
    )

    if (shape.fillColor !== 'transparent') {
      context.fill()
    }

    if (shape.strokeWidth > 0) {
      context.stroke()
    }
  }

  if (shape.shape === 'triangle') {
    context.beginPath()
    context.moveTo(0, localY)
    context.lineTo(width / 2, height / 2)
    context.lineTo(-width / 2, height / 2)
    context.closePath()

    if (shape.fillColor !== 'transparent') {
      context.fill()
    }

    if (shape.strokeWidth > 0) {
      context.stroke()
    }
  }

  context.restore()
}

function drawText(
  context: CanvasRenderingContext2D,
  textElement: TextElement,
) {
  context.save()

  if (textElement.rotation) {
    const centerX = textElement.x + textElement.width / 2
    const centerY = textElement.y + textElement.height / 2
    context.translate(centerX, centerY)
    context.rotate((textElement.rotation * Math.PI) / 180)
    context.translate(-centerX, -centerY)
  }

  context.fillStyle = textElement.color

  context.font = `${textElement.italic ? 'italic ' : ''}${
    textElement.bold ? 'bold ' : ''
  }${textElement.fontSize}px ${textElement.fontFamily}`

  context.textAlign = textElement.alignment
  context.textBaseline = 'top'

  const lineHeight = textElement.fontSize * 1.25
  const lines = wrapTextLines(context, textElement)

  const x =
    textElement.alignment === 'center'
      ? textElement.x + textElement.width / 2
      : textElement.alignment === 'right'
        ? textElement.x + textElement.width
        : textElement.x

  lines.forEach((line, index) => {
    const lineY = textElement.y + index * lineHeight

    context.fillText(line, x, lineY)

    if (textElement.underline) {
      const measuredWidth = context.measureText(line).width

      let startX = x

      if (textElement.alignment === 'center') {
        startX = x - measuredWidth / 2
      }

      if (textElement.alignment === 'right') {
        startX = x - measuredWidth
      }

      context.beginPath()

      context.moveTo(
        startX,
        lineY + textElement.fontSize + 2,
      )

      context.lineTo(
        startX + measuredWidth,
        lineY + textElement.fontSize + 2,
      )

      context.strokeStyle = textElement.color
      context.lineWidth = 1
      context.stroke()
    }
  })

  context.restore()
}

function drawStickyNote(context: CanvasRenderingContext2D, sticky: StickyNoteElement, hideText = false) {
  const isEmpty = !sticky.text || sticky.text === 'Double-click to edit'
  context.save()
  const centerX = sticky.x + sticky.width / 2
  const centerY = sticky.y + sticky.height / 2
  context.translate(centerX, centerY)
  context.rotate(((sticky.rotation ?? 0) * Math.PI) / 180)
  context.translate(-centerX, -centerY)
  context.shadowColor = 'rgba(0, 0, 0, 0.14)'
  context.shadowBlur = 9
  context.shadowOffsetY = 3
  context.fillStyle = sticky.color
  context.fillRect(sticky.x, sticky.y, sticky.width, sticky.height)
  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  context.shadowOffsetY = 0
  if (!hideText) drawText(context, {
    id: `${sticky.id}-text`, type: 'text', x: sticky.x + 12, y: sticky.y + 12,
    width: sticky.width - 24, height: sticky.height - 24,
    text: isEmpty ? 'Double-click to type' : sticky.text,
    fontFamily: 'Inter, sans-serif', fontSize: 17,
    color: isEmpty ? '#716747' : '#24221b', bold: !isEmpty,
    italic: isEmpty, underline: false, alignment: 'left',
  })
  context.restore()
}

function drawLiveStrokeSlice(
  context: CanvasRenderingContext2D,
  points: Point[],
  startIndex: number,
  color: string,
  width: number,
  opacity: number,
) {
  if (points.length === 0) return
  context.save()
  context.strokeStyle = color
  context.globalAlpha = opacity
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (startIndex === 0) {
    const first = points[0]
    context.beginPath()
    context.arc(first.x, first.y, width * (0.35 + (first.pressure ?? 0.5) * 1.3) / 2, 0, Math.PI * 2)
    context.fillStyle = color
    context.fill()
  }
  for (let index = Math.max(1, startIndex); index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    const pressure = Math.max(0.08, Math.min(1, ((previous.pressure ?? 0.5) + (point.pressure ?? 0.5)) / 2))
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(point.x, point.y)
    context.lineWidth = width * (0.35 + pressure * 1.3)
    context.stroke()
  }
  context.restore()
}

function getDistance(
  pointA: Point,
  pointB: Point,
): number {
  const dx = pointA.x - pointB.x
  const dy = pointA.y - pointB.y

  return Math.sqrt(dx * dx + dy * dy)
}

function distanceToSegment(
  point: Point,
  segmentStart: Point,
  segmentEnd: Point,
): number {
  const dx = segmentEnd.x - segmentStart.x
  const dy = segmentEnd.y - segmentStart.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return getDistance(point, segmentStart)

  const projection = Math.max(0, Math.min(1,
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
      lengthSquared,
  ))
  return Math.hypot(
    point.x - (segmentStart.x + projection * dx),
    point.y - (segmentStart.y + projection * dy),
  )
}

function isPointNearPath(
  point: Point,
  path: Point[],
  radius: number,
): boolean {
  if (path.length === 0) return false
  if (path.length === 1) return getDistance(point, path[0]) <= radius

  for (let index = 1; index < path.length; index += 1) {
    if (distanceToSegment(point, path[index - 1], path[index]) <= radius) {
      return true
    }
  }

  return false
}

function isPointNearStroke(
  point: Point,
  stroke: StrokeElement,
  radius: number,
): boolean {
  const hitRadius = radius + stroke.width / 2
  if (stroke.points.length === 1) {
    return getDistance(point, stroke.points[0]) <= hitRadius
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    if (distanceToSegment(point, stroke.points[index - 1], stroke.points[index]) <= hitRadius) {
      return true
    }
  }

  return false
}

function eraseFromStroke(
  stroke: StrokeElement,
  eraserPath: Point[],
  radius: number,
): StrokeElement[] {
  if (stroke.points.length === 0 || eraserPath.length === 0) return [stroke]

  const spacing = Math.max(1.5, Math.min(4, radius / 4))
  const sampledPoints: Point[] = [stroke.points[0]]
  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1]
    const end = stroke.points[index]
    const distance = getDistance(start, end)
    const steps = Math.max(1, Math.ceil(distance / spacing))

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps
      sampledPoints.push({
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        pressure: start.pressure === undefined || end.pressure === undefined
          ? undefined
          : start.pressure + (end.pressure - start.pressure) * ratio,
        timestamp: start.timestamp === undefined || end.timestamp === undefined
          ? undefined
          : start.timestamp + (end.timestamp - start.timestamp) * ratio,
      })
    }
  }

  const remainingSegments: Point[][] = []
  let currentSegment: Point[] = []
  let erasedAnyPoint = false

  for (const strokePoint of sampledPoints) {
    const isErased = isPointNearPath(
      strokePoint,
      eraserPath,
      radius + stroke.width / 2,
    )

    if (!isErased) {
      const lastPoint = currentSegment.at(-1)
      if (!lastPoint || getDistance(lastPoint, strokePoint) > 0.1) {
        currentSegment.push(strokePoint)
      }
    } else {
      erasedAnyPoint = true
      if (currentSegment.length > 1) {
        remainingSegments.push(currentSegment)
      }

      currentSegment = []
    }
  }

  if (currentSegment.length > 1) {
    remainingSegments.push(currentSegment)
  }

  if (!erasedAnyPoint) return [stroke]

  return remainingSegments.map((segment) => ({
    ...stroke,
    id: crypto.randomUUID(),
    points: segment,
  }))
}

function isPointInsideText(
  point: Point,
  text: TextElement,
): boolean {
  return (
    point.x >= text.x &&
    point.x <= text.x + text.width &&
    point.y >= text.y &&
    point.y <= text.y + text.height
  )
}

function isPointInsideShape(
  point: Point,
  shape: ShapeElement,
): boolean {
  const rotation = ((shape.rotation ?? 0) * Math.PI) / 180
  const centerX = shape.x + shape.width / 2
  const centerY = shape.y + shape.height / 2

  const dx = point.x - centerX
  const dy = point.y - centerY
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const localX = dx * cos + dy * sin + centerX
  const localY = -dx * sin + dy * cos + centerY

  return (
    localX >= shape.x &&
    localX <= shape.x + shape.width &&
    localY >= shape.y &&
    localY <= shape.y + shape.height
  )
}

type RecognizedStroke =
  | { kind: 'line'; points: Point[] }
  | { kind: 'circle' | 'square'; x: number; y: number; width: number; height: number }

function simplifyStroke(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points
  const start = points[0]
  const end = points[points.length - 1]
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  let maxDistance = 0
  let farthestIndex = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    const distance = Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
    if (distance > maxDistance) { maxDistance = distance; farthestIndex = index }
  }
  if (maxDistance <= tolerance) return [start, end]
  return [...simplifyStroke(points.slice(0, farthestIndex + 1), tolerance).slice(0, -1), ...simplifyStroke(points.slice(farthestIndex), tolerance)]
}

function removeStraightContourPoints(points: Point[]): Point[] {
  const contour = [...points]
  let changed = true

  // A closed stroke can begin in the middle of a side. That start point is
  // not a corner, but a contour simplifier may keep it as a fifth vertex.
  while (changed && contour.length > 4) {
    changed = false

    for (let index = 0; index < contour.length; index += 1) {
      const previous = contour[(index - 1 + contour.length) % contour.length]
      const current = contour[index]
      const next = contour[(index + 1) % contour.length]
      const incomingX = current.x - previous.x
      const incomingY = current.y - previous.y
      const outgoingX = next.x - current.x
      const outgoingY = next.y - current.y
      const incomingLength = Math.hypot(incomingX, incomingY)
      const outgoingLength = Math.hypot(outgoingX, outgoingY)

      if (incomingLength < 1 || outgoingLength < 1) {
        contour.splice(index, 1)
        changed = true
        break
      }

      const dot = incomingX * outgoingX + incomingY * outgoingY
      const normalizedCross = Math.abs(incomingX * outgoingY - incomingY * outgoingX) /
        (incomingLength * outgoingLength)

      // Remove points that continue almost straight along the same side.
      if (dot > 0 && normalizedCross < 0.28) {
        contour.splice(index, 1)
        changed = true
        break
      }
    }
  }

  return contour
}

function recognizeStroke(points: Point[]): RecognizedStroke | null {
  if (points.length < 5) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const boxWidth = maxX - minX, boxHeight = maxY - minY
  const diagonal = Math.hypot(boxWidth, boxHeight)
  if (diagonal < 14) return null

  const endDistance = Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y)
  const closed = endDistance < Math.max(24, diagonal * 0.3)
  if (closed && boxWidth > 12 && boxHeight > 12 && boxWidth / boxHeight > 0.62 && boxWidth / boxHeight < 1.6) {
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2

    // A square should pass near all four bounding-box corners. This remains
    // reliable when hand jitter prevents the contour simplifier from finding
    // exactly four vertices, and circles stay well away from those corners.
    const nearSquare = boxWidth / boxHeight > 0.68 && boxWidth / boxHeight < 1.42
    const boundingCorners = [
      { x: minX, y: minY }, { x: maxX, y: minY },
      { x: maxX, y: maxY }, { x: minX, y: maxY },
    ]
    const reachesEveryCorner = boundingCorners.every((corner) =>
      points.some((point) => Math.hypot(point.x - corner.x, point.y - corner.y) < Math.min(boxWidth, boxHeight) * 0.18),
    )
    if (nearSquare && reachesEveryCorner) {
      const size = Math.max(boxWidth, boxHeight)
      return { kind: 'square', x: centerX - size / 2, y: centerY - size / 2, width: size, height: size }
    }

    // Simplify the closed contour first. Checking for four corners before
    // roundness keeps a square from being mistaken for a rough circle.
    const contour = [...points]
    if (endDistance < Math.max(24, diagonal * 0.3)) contour.pop()
    contour.push(contour[0])
    const simplifiedContour = simplifyStroke(contour, Math.max(4, diagonal * 0.075))
    const corners = removeStraightContourPoints(simplifiedContour.slice(0, -1))
    if (corners.length === 4) {
      const sides = corners.map((point, index) => {
        const next = corners[(index + 1) % corners.length]
        return { x: next.x - point.x, y: next.y - point.y }
      })
      const rightAngles = sides.every((side, index) => {
        const next = sides[(index + 1) % sides.length]
        const denominator = Math.hypot(side.x, side.y) * Math.hypot(next.x, next.y)
        return denominator > 0 && Math.abs(side.x * next.x + side.y * next.y) / denominator < 0.48
      })
      const sideLengths = sides.map((side) => Math.hypot(side.x, side.y))
      const sideRatio = Math.max(...sideLengths) / Math.max(1, Math.min(...sideLengths))
      if (rightAngles && sideRatio < 1.55) {
        const size = Math.max(boxWidth, boxHeight)
        return { kind: 'square', x: centerX - size / 2, y: centerY - size / 2, width: size, height: size }
      }
    }

    const radii = points.map((point) => Math.hypot(point.x - centerX, point.y - centerY))
    const meanRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length
    const deviation = Math.sqrt(radii.reduce((sum, radius) => sum + (radius - meanRadius) ** 2, 0) / radii.length)
    if (meanRadius > 0 && deviation / meanRadius < 0.2 && boxWidth / boxHeight > 0.72 && boxWidth / boxHeight < 1.38) {
      const diameter = (boxWidth + boxHeight) / 2
      return { kind: 'circle', x: centerX - diameter / 2, y: centerY - diameter / 2, width: diameter, height: diameter }
    }
  }

  const start = points[0], end = points.at(-1)!
  const lineLength = Math.hypot(end.x - start.x, end.y - start.y)
  const pathLength = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0)
  const maximumDeviation = points.reduce((maximum, point) => {
    const dx = end.x - start.x, dy = end.y - start.y
    const distance = lineLength === 0 ? 0 : Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / lineLength
    return Math.max(maximum, distance)
  }, 0)
  if (lineLength > 14 && pathLength / lineLength < 1.25 && maximumDeviation < Math.max(5, diagonal * 0.035)) return { kind: 'line', points: [start, end] }
  return null
}

function getElementBounds(element: NoteElement) {
  if (element.type === 'stroke') {
    const xs = element.points.map((point) => point.x)
    const ys = element.points.map((point) => point.y)
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

function scaleElement(element: NoteElement, bounds: { x: number; y: number; width: number; height: number }, scaleX: number, scaleY: number): NoteElement {
  const scalePoint = (point: Point): Point => ({ ...point, x: bounds.x + (point.x - bounds.x) * scaleX, y: bounds.y + (point.y - bounds.y) * scaleY })
  if (element.type === 'stroke') return { ...element, points: element.points.map(scalePoint), width: element.width * (Math.abs(scaleX) + Math.abs(scaleY)) / 2 }
  return {
    ...element,
    x: bounds.x + (element.x - bounds.x) * scaleX,
    y: bounds.y + (element.y - bounds.y) * scaleY,
    width: element.width * scaleX,
    height: element.height * scaleY,
    ...(element.type === 'text' ? { fontSize: element.fontSize * (Math.abs(scaleX) + Math.abs(scaleY)) / 2 } : {}),
    ...(element.type === 'shape' ? { strokeWidth: element.strokeWidth * (Math.abs(scaleX) + Math.abs(scaleY)) / 2 } : {}),
  } as NoteElement
}

function NoteCanvas({
  pageId,
  width,
  height,
}: NoteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const liveInkCanvasRef = useRef<HTMLCanvasElement>(null)
  const liveInkFrameRef = useRef<number | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const currentPointsRef = useRef<Point[]>([])
  const liveRenderedPointCountRef = useRef(0)
  const penInUseRef = useRef(false)
  const lastPenActivityRef = useRef(0)

  const textDragRef = useRef<TextDragState | null>(null)
  const stickyDragRef = useRef<StickyDragState | null>(null)
  const stickyDragFrameRef = useRef<number | null>(null)
  const shapeDrawRef = useRef<ShapeDrawState | null>(null)
  const shapeDragRef = useRef<ShapeDragState | null>(null)
  const multiShapeDragRef = useRef<{
    shapeIds: string[]
    startPointerX: number
    startPointerY: number
    startPositions: Record<string, { x: number; y: number }>
  } | null>(null)
  const shapeRotationRef = useRef<ShapeRotationState | null>(null)
  const shapeResizeRef = useRef<ShapeResizeState | null>(null)
  const textResizeRef = useRef<TextResizeState | null>(null)
  const selectionActionRef = useRef<{ kind: 'move' | 'marquee' | 'lasso'; start: Point; current: Point; points?: Point[] } | null>(null)
  const imageCropDragRef = useRef<{ pointerId: number; edges: ImageCropEdge[]; crop: NonNullable<ImageElement['crop']> } | null>(null)
  const laserFadeTimerRef = useRef<number | null>(null)
  const eraserFrameRef = useRef<number | null>(null)
  const eraserPendingPointsRef = useRef<Point[]>([])
  const eraserLastPointRef = useRef<Point | null>(null)
  const eraserPointerIdRef = useRef<number | null>(null)
  const eraserOriginalNotebookRef = useRef<Notebook | null>(null)
  const eraserChangedRef = useRef(false)
  const rulerDragRef = useRef<{ pointerId: number; startPointer: Point; startRuler: { x: number; y: number } } | null>(null)
  const selectionResizeRef = useRef<SelectionResizeState | null>(null)
  const selectionRotateRef = useRef<SelectionRotateState | null>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [isStickyDragging, setIsStickyDragging] = useState(false)
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
  const [selectionPreview, setSelectionPreview] = useState<{ kind: 'move' | 'marquee'; x: number; y: number; width: number; height: number } | null>(null)
  const [lassoPreview, setLassoPreview] = useState<Point[]>([])
  const [laserTrail, setLaserTrail] = useState<Point[]>([])
  const [ruler, setRuler] = useState(() => ({ x: Math.max(0, (width - 320) / 2), y: Math.max(0, height / 2 - 24), width: 320, height: 48, rotation: 0 }))
  const [selectionScalePreview, setSelectionScalePreview] = useState<{ bounds: SelectionResizeState['bounds']; scaleX: number; scaleY: number } | null>(null)
  const [selectionRotationPreview, setSelectionRotationPreview] = useState<{ centerX: number; centerY: number; degrees: number } | null>(null)

  const [textPosition, setTextPosition] = useState<{
    x: number
    y: number
  } | null>(null)

  const [textValue, setTextValue] = useState('')
  const [textBoxWidth, setTextBoxWidth] = useState(400)
  const [stickyEditing, setStickyEditing] = useState<{ id: string; text: string } | null>(null)

  const clearLiveInkPreview = () => {
    if (liveInkFrameRef.current !== null) {
      cancelAnimationFrame(liveInkFrameRef.current)
      liveInkFrameRef.current = null
    }
    const liveCanvas = liveInkCanvasRef.current
    const context = liveCanvas?.getContext('2d')
    context?.clearRect(0, 0, width, height)
    liveRenderedPointCountRef.current = 0
  }

  const [textFontSize, setTextFontSize] = useState(22)

  const [textBold, setTextBold] = useState(false)
  const [textItalic, setTextItalic] = useState(false)
  const [textUnderline, setTextUnderline] = useState(false)

  const [textAlignment, setTextAlignment] =
    useState<TextElement['alignment']>('left')

  const [editingTextId, setEditingTextId] = useState<
    string | null
  >(null)

  const [selectedTextId, setSelectedTextId] = useState<
    string | null
  >(null)

  const [isDraggingText, setIsDraggingText] =
    useState(false)

  const [dragPreviewPosition, setDragPreviewPosition] =
    useState<{
      x: number
      y: number
    } | null>(null)

  const [resizePreview, setResizePreview] = useState<{
    textId: string
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const [shapePreview, setShapePreview] =
    useState<ShapeDrawState | null>(null)

  const [selectedShapeId, setSelectedShapeId] =
    useState<string | null>(null)

  const [selectedShapeIds, setSelectedShapeIds] =
    useState<string[]>([])

  const [isDraggingShape, setIsDraggingShape] =
    useState(false)

  const [shapeDragPreview, setShapeDragPreview] =
    useState<{
      shapeId: string
      x: number
      y: number
    } | null>(null)

  const [shapeRotationPreview, setShapeRotationPreview] =
    useState<{
      shapeId: string
      rotation: number
    } | null>(null)

  const [shapeResizePreview, setShapeResizePreview] =
    useState<{
      shapeId: string
      x: number
      y: number
      width: number
      height: number
    } | null>(null)
  const shapeResizePreviewRef = useRef<{
    shapeId: string
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const shapeClipboardRef = useRef<StyledShapeElement | null>(null)
  const multiShapeClipboardRef = useRef<StyledShapeElement[]>([])
  const elementClipboardRef = useRef<NoteElement[]>([])

  const [isImportingPdf, setIsImportingPdf] = useState(false)
  const [pdfImportError, setPdfImportError] = useState<string | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>())
  const [imageLoadVersion, setImageLoadVersion] = useState(0)
  const [audioSyncTimestamp, setAudioSyncTimestamp] = useState<number | null>(null)
  const [audioPlaybackActive, setAudioPlaybackActive] = useState(false)
  const [imageCropDraft, setImageCropDraft] = useState<{ imageId: string; crop: NonNullable<ImageElement['crop']> } | null>(null)

  const notebook = useDocumentStore(
    (state) => state.notebook,
  )

  const addStroke = useDocumentStore(
    (state) => state.addStroke,
  )

  const addText = useDocumentStore(
    (state) => state.addText,
  )

  const updateText = useDocumentStore(
    (state) => state.updateText,
  )

  const removeText = useDocumentStore(
    (state) => state.removeText,
  )

  const activePageId = usePageStore(
    (state) => state.activePageId,
  )

  const color = useToolStore((state) => state.color)
  const widthValue = useToolStore((state) => state.width)
  const opacity = useToolStore((state) => state.opacity)

  const shapeType = useToolStore(
    (state) => state.shapeType,
  )

  const activeTool = useToolStore(
    (state) => state.activeTool,
  )

  const rulerVisible = useToolStore((state) => state.rulerVisible)

  const eraserSize = useToolStore(
    (state) => state.eraserSize,
  )

  const page = notebook?.pages.find(
    (item) => item.id === pageId,
  )

  const redrawCanvasEffect = useEffectEvent((context: CanvasRenderingContext2D) => {
    redrawCanvas(context)
  })

  useEffect(() => {
    const handleAudioPlayhead = (event: Event) => {
      const detail = (event as CustomEvent<{ notebookId: string; timestamp: number; playing: boolean }>).detail
      if (detail.notebookId !== notebook?.id) return
      setAudioSyncTimestamp(detail.playing ? detail.timestamp : null)
      setAudioPlaybackActive(detail.playing)
    }
    window.addEventListener('freenotes-audio-playhead', handleAudioPlayhead)
    return () => window.removeEventListener('freenotes-audio-playhead', handleAudioPlayhead)
  }, [notebook?.id])

  const selectedText =
    page?.elements.find(
      (element) =>
        element.type === 'text' &&
        element.id === selectedTextId,
    ) ?? null

  const importPdf = async (file: File) => {
    setPdfImportError(null)

    if (file.type !== 'application/pdf') {
      setPdfImportError('Please choose a PDF file.')
      return
    }

    const currentNotebook = useDocumentStore.getState().notebook

    if (!currentNotebook) {
      setPdfImportError('Create a note before importing a PDF.')
      return
    }

    setIsImportingPdf(true)

    try {
      const pdfjsLib = await import('pdfjs-dist')

      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()

      const fileData = new Uint8Array(await file.arrayBuffer())
      const pdfLoadingTask = pdfjsLib.getDocument({
        data: fileData,
      })
      const pdf = await pdfLoadingTask.promise

      const importedPages: PdfPage[] = []

      const renderPdfPage = async (pageNumber: number): Promise<PdfPage> => {
        const pdfPage = await pdf.getPage(pageNumber)
        // A 1.25 scale stays crisp at the page's display size while cutting
        // raster work and encoded image size compared with 1.5x rendering.
        // Rasterise close to the visible page size. Higher resolutions add a
        // lot of CPU and storage cost without improving the editor view.
        const viewport = pdfPage.getViewport({ scale: pdf.numPages > 24 ? 0.82 : 1.05 })
        const renderCanvas = document.createElement('canvas')
        const context = renderCanvas.getContext('2d')

        if (!context) {
          throw new Error('Unable to create a PDF rendering canvas.')
        }

        renderCanvas.width = Math.ceil(viewport.width)
        renderCanvas.height = Math.ceil(viewport.height)

        const textPromise = (async () => {
          const textReader = pdfPage.streamTextContent().getReader()
          const pdfTextItems: { str?: string }[] = []
          try {
            while (true) {
              const { value, done } = await textReader.read()
              if (done) break
              pdfTextItems.push(...value.items)
            }
          } finally {
            textReader.releaseLock()
          }
          return pdfTextItems
            .map((item) => ('str' in item ? item.str : ''))
            .filter(Boolean)
            .join(' ')
        })()

        const [, pdfText] = await Promise.all([
          pdfPage.render({ canvas: renderCanvas, canvasContext: context, viewport }).promise,
          textPromise,
        ])
        // JPEG keeps imported page data much smaller than PNG, reducing both
        // conversion time and the amount of notebook data written to storage.
        const pdfBackground = renderCanvas.toDataURL('image/jpeg', 0.78)
        renderCanvas.width = 0
        renderCanvas.height = 0

        return {
          id: crypto.randomUUID(),
          title: `${file.name.replace(/\.pdf$/i, '')} - Page ${pageNumber}`,
          elements: [],
          background: 'plain',
          pdfBackground,
          pdfSourceName: file.name,
          pdfText,
        }
      }

      // Render a small batch in parallel to reduce total wait time without
      // allocating a canvas for every page of a large document at once.
      for (let firstPage = 1; firstPage <= pdf.numPages; firstPage += 2) {
        const batch = await Promise.all(
          [firstPage, firstPage + 1]
            .filter((pageNumber) => pageNumber <= pdf.numPages)
            .map(renderPdfPage),
        )
        importedPages.push(...batch)
      }

      await pdfLoadingTask.destroy()

      if (importedPages.length === 0) {
        throw new Error('The PDF contains no pages.')
      }

      useDocumentStore.setState((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook = structuredClone(state.notebook)

        // A freshly created notebook contains one untouched blank page.
        // Replace that starter page with the first imported PDF page so the
        // PDF becomes the actual page instead of appearing after a blank page.
        const starterPage = state.notebook.pages.length === 1
          ? state.notebook.pages[0]
          : null

        const starterPageIsBlank =
          starterPage !== null &&
          starterPage.elements.length === 0 &&
          starterPage.background === 'plain' &&
          !('pdfBackground' in starterPage)

        const pages = starterPageIsBlank
          ? [
              ...importedPages,
            ]
          : [
              ...state.notebook.pages,
              ...importedPages,
            ]

        return {
          notebook: {
            ...state.notebook,
            pages,
            updatedAt: Date.now(),
          },
          history: [...state.history, previousNotebook],
          future: [],
        }
      })

      usePageStore.setState({
        activePageId: importedPages[0].id,
      })
    } catch (error) {
      console.error('PDF import failed:', error)
      setPdfImportError(
        error instanceof Error
          ? error.message
          : 'Unable to import this PDF.',
      )
    } finally {
      setIsImportingPdf(false)

      if (pdfInputRef.current) {
        pdfInputRef.current.value = ''
      }
    }
  }

  const importImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setPdfImportError('Please choose an image file.')
      return
    }
    const currentNotebook = useDocumentStore.getState().notebook
    if (!currentNotebook) {
      setPdfImportError('Create a note before inserting an image.')
      return
    }
    try {
      setPdfImportError(null)
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read this image.'))
        reader.onerror = () => reject(new Error('Unable to read this image.'))
        reader.readAsDataURL(file)
      })
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const loadedImage = new Image()
        loadedImage.onload = () => resolve(loadedImage)
        loadedImage.onerror = () => reject(new Error('This image could not be opened.'))
        loadedImage.src = source
      })
      const scale = Math.min(1, 360 / image.naturalWidth, 360 / image.naturalHeight)
      const imageElement: ImageElement = {
        id: crypto.randomUUID(), type: 'image', src: source,
        x: Math.max(0, (width - image.naturalWidth * scale) / 2),
        y: Math.max(0, (height - image.naturalHeight * scale) / 2),
        width: image.naturalWidth * scale, height: image.naturalHeight * scale, rotation: 0,
      }
      useDocumentStore.setState((state) => {
        if (!state.notebook) return state
        const previousNotebook = structuredClone(state.notebook)
        const notebook = { ...state.notebook, pages: state.notebook.pages.map((item) => item.id === pageId ? { ...item, elements: [...item.elements, imageElement] } : item), updatedAt: Date.now() }
        return { notebook, history: [...state.history, previousNotebook], future: [] }
      })
    } catch (error) {
      setPdfImportError(error instanceof Error ? error.message : 'Unable to insert this image.')
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const getPoint = (
    event: PointerEvent<HTMLCanvasElement>,
  ): Point => {
    const canvas = canvasRef.current

    if (!canvas) {
      return {
        x: 0,
        y: 0,
      }
    }

    const rect = canvas.getBoundingClientRect()

    const point: Point = {
      x:
        ((event.clientX - rect.left) / rect.width) *
        width,
      y:
        ((event.clientY - rect.top) / rect.height) *
        height,
      pressure: event.pressure,
      timestamp: Date.now(),
    }

    if (rulerVisible && (activeTool === 'pen' || activeTool === 'pencil')) {
      const angle = (-ruler.rotation * Math.PI) / 180
      const dx = point.x - (ruler.x + ruler.width / 2)
      const dy = point.y - (ruler.y + ruler.height / 2)
      const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + ruler.width / 2
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + ruler.height / 2
      const edgeY = Math.abs(localY) <= Math.abs(localY - ruler.height) ? 0 : ruler.height
      if (localX >= 0 && localX <= ruler.width && Math.abs(localY - edgeY) <= ruler.height / 2 + 12) {
        const projectedX = localX - ruler.width / 2
        const projectedY = edgeY - ruler.height / 2
        const forwardAngle = (ruler.rotation * Math.PI) / 180
        return {
          ...point,
          x: ruler.x + ruler.width / 2 + projectedX * Math.cos(forwardAngle) - projectedY * Math.sin(forwardAngle),
          y: ruler.y + ruler.height / 2 + projectedX * Math.sin(forwardAngle) + projectedY * Math.cos(forwardAngle),
        }
      }
    }
    return point
  }

  const getPointFromClient = (
    clientX: number,
    clientY: number,
  ): Point => {
    const canvas = canvasRef.current

    if (!canvas) {
      return { x: 0, y: 0 }
    }

    const rect = canvas.getBoundingClientRect()

    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    }
  }

  const applyEraserSweep = () => {
    const pendingPoints = eraserPendingPointsRef.current.splice(0)
    if (pendingPoints.length === 0) return

    const previousPoint = eraserLastPointRef.current
    const eraserPath = previousPoint
      ? [previousPoint, ...pendingPoints]
      : pendingPoints
    eraserLastPointRef.current = pendingPoints[pendingPoints.length - 1]

    const currentNotebook = useDocumentStore.getState().notebook
    const currentPage = currentNotebook?.pages.find((item) => item.id === pageId)
    if (!currentNotebook || !currentPage) return

    let changed = false
    const elements: NoteElement[] = []
    for (const element of currentPage.elements) {
      if (element.type !== 'stroke') {
        elements.push(element)
        continue
      }
      const remainingStrokes = eraseFromStroke(element, eraserPath, eraserSize)
      if (remainingStrokes.length === 1 && remainingStrokes[0] === element) {
        elements.push(element)
        continue
      }

      changed = true
      elements.push(...remainingStrokes)
    }

    if (!changed) return

    eraserChangedRef.current = true
    useDocumentStore.setState((state) => {
      if (!state.notebook || state.notebook.id !== currentNotebook.id) return state
      return {
        notebook: {
          ...state.notebook,
          pages: state.notebook.pages.map((item) =>
            item.id === pageId ? { ...item, elements } : item,
          ),
          updatedAt: Date.now(),
        },
      }
    })
  }

  const finishEraserGesture = (pointerId: number) => {
    if (eraserFrameRef.current !== null) {
      cancelAnimationFrame(eraserFrameRef.current)
      eraserFrameRef.current = null
    }
    applyEraserSweep()

    const originalNotebook = eraserOriginalNotebookRef.current
    if (originalNotebook && eraserChangedRef.current) {
      useDocumentStore.setState((state) => ({
        history: [...state.history, originalNotebook],
        future: [],
      }))
    }

    eraserPendingPointsRef.current = []
    eraserLastPointRef.current = null
    eraserPointerIdRef.current = null
    eraserOriginalNotebookRef.current = null
    eraserChangedRef.current = false

    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId)
    }
  }

  const startRulerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    rulerDragRef.current = {
      pointerId: event.pointerId,
      startPointer: getPointFromClient(event.clientX, event.clientY),
      startRuler: { x: ruler.x, y: ruler.y },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveRulerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = rulerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = getPointFromClient(event.clientX, event.clientY)
    setRuler((current) => ({
      ...current,
      x: Math.max(0, Math.min(width - current.width, drag.startRuler.x + point.x - drag.startPointer.x)),
      y: Math.max(0, Math.min(height - current.height, drag.startRuler.y + point.y - drag.startPointer.y)),
    }))
  }

  const finishRulerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (rulerDragRef.current?.pointerId !== event.pointerId) return
    rulerDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const redrawCanvas = (
    context: CanvasRenderingContext2D,
  ) => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    context.clearRect(
      0,
      0,
      width,
      height,
    )

    if (!page) {
      return
    }

    for (const element of page.elements) {
      if (stickyDragRef.current?.sticky.id === element.id) {
        continue
      }

      const selectionTransformPreview = selectionScalePreview
      const rotationPreview = selectionRotationPreview
      const isSelectionRotationPreview = (activeTool === 'select' || activeTool === 'lasso') && rotationPreview && selectedElementIds.includes(element.id)
      if (isSelectionRotationPreview && rotationPreview) {
        context.save()
        context.translate(rotationPreview.centerX, rotationPreview.centerY)
        context.rotate((rotationPreview.degrees * Math.PI) / 180)
        context.translate(-rotationPreview.centerX, -rotationPreview.centerY)
      }
      const isSelectionResizePreview = (activeTool === 'select' || activeTool === 'lasso') && selectionTransformPreview && selectedElementIds.includes(element.id)
      if (isSelectionResizePreview && selectionTransformPreview) {
        context.save()
        context.translate(selectionTransformPreview.bounds.x, selectionTransformPreview.bounds.y)
        context.scale(selectionTransformPreview.scaleX, selectionTransformPreview.scaleY)
        context.translate(-selectionTransformPreview.bounds.x, -selectionTransformPreview.bounds.y)
      }
      const selectionAction = selectionActionRef.current
      const isSelectionMovePreview = (activeTool === 'select' || activeTool === 'lasso') && selectionAction?.kind === 'move' && selectedElementIds.includes(element.id)
      if (isSelectionMovePreview && selectionAction) {
        context.save()
        context.translate(selectionAction.current.x - selectionAction.start.x, selectionAction.current.y - selectionAction.start.y)
      }

      if (element.type === 'stroke') {
        drawStroke(context, element)
        if (audioSyncTimestamp !== null) {
          const timedPoints = element.points
            .map((point) => point.timestamp)
            .filter((value): value is number => typeof value === 'number')
          if (timedPoints.length > 0) {
            const first = Math.min(...timedPoints)
            const last = Math.max(...timedPoints)
            if (audioSyncTimestamp >= first - 350 && audioSyncTimestamp <= last + 350) {
              drawStroke(context, { ...element, color: '#3980ff', width: element.width + 7, opacity: 0.3, tool: 'pen' })
              drawStroke(context, element)
            }
          }
        }
      }

      if (element.type === 'shape') {
        const isDraggedShape =
          isDraggingShape &&
          shapeDragPreview &&
          element.id === shapeDragPreview.shapeId

        const isRotatingShape =
          shapeRotationPreview &&
          element.id === shapeRotationPreview.shapeId

        const isResizingShape =
          shapeResizePreview &&
          element.id === shapeResizePreview.shapeId

        drawShape(context, {
          ...element,
          ...(isDraggedShape
            ? {
                x: shapeDragPreview.x,
                y: shapeDragPreview.y,
              }
            : {}),
          ...(isResizingShape
            ? {
                x: shapeResizePreview.x,
                y: shapeResizePreview.y,
                width: shapeResizePreview.width,
                height: shapeResizePreview.height,
              }
            : {}),
          ...(isRotatingShape
            ? {
                rotation: shapeRotationPreview.rotation,
              }
            : {}),
        })
      }

      if (element.type === 'text') {
        if (
          resizePreview &&
          element.id === resizePreview.textId
        ) {
          drawText(context, {
            ...element,
            x: resizePreview.x,
            y: resizePreview.y,
            width: resizePreview.width,
            height: resizePreview.height,
          })
        } else if (
          isDraggingText &&
          element.id === textDragRef.current?.textId &&
          dragPreviewPosition
        ) {
          drawText(context, {
            ...element,
            x: dragPreviewPosition.x,
            y: dragPreviewPosition.y,
          })
        } else {
          drawText(context, element)
        }
      }

      if (element.type === 'image') {
        let image = imageCacheRef.current.get(element.id)
        if (!image) {
          image = new Image()
          image.onload = () => setImageLoadVersion((version) => version + 1)
          image.src = element.src
          imageCacheRef.current.set(element.id, image)
        }
        if (image.complete && image.naturalWidth > 0) {
          context.save()
          context.translate(element.x + element.width / 2, element.y + element.height / 2)
          context.rotate((element.rotation * Math.PI) / 180)
          context.scale(element.flipX ? -1 : 1, element.flipY ? -1 : 1)
          const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 }
          context.drawImage(
            image,
            crop.x * image.naturalWidth,
            crop.y * image.naturalHeight,
            crop.width * image.naturalWidth,
            crop.height * image.naturalHeight,
            -element.width / 2,
            -element.height / 2,
            element.width,
            element.height,
          )
          context.restore()
        }
      }

      if (element.type === 'sticky-note') drawStickyNote(context, element, stickyEditing?.id === element.id)

      if (isSelectionMovePreview) context.restore()
      if (isSelectionResizePreview) context.restore()
      if (isSelectionRotationPreview) context.restore()
    }

    if (shapePreview) {
      const deltaX =
        shapePreview.currentX - shapePreview.startX

      const deltaY =
        shapePreview.currentY - shapePreview.startY

      let previewX = Math.min(
        shapePreview.startX,
        shapePreview.currentX,
      )

      let previewY = Math.min(
        shapePreview.startY,
        shapePreview.currentY,
      )

      let previewWidth = Math.abs(deltaX)
      let previewHeight = Math.abs(deltaY)

      if (shapeType === 'circle') {
        const size = Math.min(
          Math.abs(deltaX),
          Math.abs(deltaY),
        )

        previewWidth = size
        previewHeight = size

        previewX =
          deltaX < 0
            ? shapePreview.startX - size
            : shapePreview.startX

        previewY =
          deltaY < 0
            ? shapePreview.startY - size
            : shapePreview.startY
      }

      drawShape(context, {
        id: 'shape-preview',
        type: 'shape',
        shape: shapeType,
        x: previewX,
        y: previewY,
        width: previewWidth,
        height: previewHeight,
        rotation: 0,
        strokeColor: color,
        fillColor: 'transparent',
        strokeWidth: Math.max(1, widthValue),
        lineStyle: 'solid',
      })
    }
  }

  const drawStickyDragPreview = () => {
    const drag = stickyDragRef.current
    const context = liveInkCanvasRef.current?.getContext('2d')
    if (!drag || !context) return

    context.clearRect(0, 0, width, height)
    const deltaX = drag.currentPointer.x - drag.startPointer.x
    const deltaY = drag.currentPointer.y - drag.startPointer.y
    const x = Math.max(0, Math.min(width - drag.sticky.width, drag.sticky.x + deltaX))
    const y = Math.max(0, Math.min(height - drag.sticky.height, drag.sticky.y + deltaY))
    drawStickyNote(context, { ...drag.sticky, x, y })
  }

  const scheduleStickyDragPreview = () => {
    if (stickyDragFrameRef.current !== null) return
    stickyDragFrameRef.current = requestAnimationFrame(() => {
      stickyDragFrameRef.current = null
      drawStickyDragPreview()
    })
  }

  const finishStickyDrag = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    const drag = stickyDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return false

    if (stickyDragFrameRef.current !== null) {
      cancelAnimationFrame(stickyDragFrameRef.current)
      stickyDragFrameRef.current = null
    }

    drag.currentPointer = getPointFromClient(event.clientX, event.clientY)
    const deltaX = drag.currentPointer.x - drag.startPointer.x
    const deltaY = drag.currentPointer.y - drag.startPointer.y
    if (Math.hypot(deltaX, deltaY) > 1) {
      useDocumentStore.setState((state) => {
        if (!state.notebook) return state
        const previousNotebook = state.notebook
        const x = Math.max(0, Math.min(width - drag.sticky.width, drag.sticky.x + deltaX))
        const y = Math.max(0, Math.min(height - drag.sticky.height, drag.sticky.y + deltaY))
        const pages = previousNotebook.pages.map((pageItem) =>
          pageItem.id !== pageId
            ? pageItem
            : {
                ...pageItem,
                elements: pageItem.elements.map((element) =>
                  element.type === 'sticky-note' && element.id === drag.sticky.id
                    ? { ...element, x, y }
                    : element,
                ),
              },
        )
        return {
          notebook: { ...previousNotebook, pages, updatedAt: Date.now() },
          history: [...state.history, previousNotebook],
          future: [],
        }
      })
    }

    stickyDragRef.current = null
    selectionActionRef.current = null
    setSelectionPreview(null)
    setIsStickyDragging(false)
    const context = liveInkCanvasRef.current?.getContext('2d')
    context?.clearRect(0, 0, width, height)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    return true
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const liveCanvas = liveInkCanvasRef.current
    if (!canvas || !liveCanvas) return

    const resizeForDisplay = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      // Keep page coordinates logical while rendering into a high-density
      // backing store. This prevents typed text and ink from looking soft on
      // Retina and other high-DPI tablet screens.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.round(rect.width * pixelRatio)
      const pixelHeight = Math.round(rect.height * pixelRatio)
      const mainCanvasChanged = canvas.width !== pixelWidth || canvas.height !== pixelHeight
      if (mainCanvasChanged) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
        const context = canvas.getContext('2d')
        if (context) {
          context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0)
          redrawCanvasEffect(context)
        }
      }

      if (liveCanvas.width !== pixelWidth || liveCanvas.height !== pixelHeight) {
        liveCanvas.width = pixelWidth
        liveCanvas.height = pixelHeight
        liveCanvas.getContext('2d')?.setTransform(
          pixelWidth / width,
          0,
          0,
          pixelHeight / height,
          0,
          0,
        )
      }
    }

    const observer = new ResizeObserver(resizeForDisplay)
    observer.observe(canvas)
    resizeForDisplay()
    return () => {
      observer.disconnect()
      if (liveInkFrameRef.current !== null) {
        cancelAnimationFrame(liveInkFrameRef.current)
        liveInkFrameRef.current = null
      }
    }
  }, [width, height])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas || !page) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    redrawCanvasEffect(context)
  }, [
    page,
    width,
    height,
    isDraggingText,
    dragPreviewPosition,
    resizePreview,
    shapePreview,
    selectedShapeId,
    isDraggingShape,
    shapeDragPreview,
    shapeRotationPreview,
    shapeResizePreview,
    color,
    widthValue,
    shapeType,
    imageLoadVersion,
    selectionPreview,
    selectedElementIds,
    activeTool,
    selectionScalePreview,
    selectionRotationPreview,
    audioSyncTimestamp,
    imageCropDraft,
    isStickyDragging,
  ])

  useEffect(() => {
    if (textPosition) {
      textInputRef.current?.focus()
    }
  }, [textPosition])

  useEffect(() => {
    const textarea = textInputRef.current

    if (!textarea || !textPosition) {
      return
    }

    const availableWidth = Math.max(120, Math.min(560, width - textPosition.x - 16))
    const context = canvasRef.current?.getContext('2d')
    if (context) {
      context.font = `${textItalic ? 'italic ' : ''}${textBold ? 'bold ' : ''}${textFontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      const widestLine = Math.max(0, ...textValue.split('\n').map((line) => context.measureText(line).width))
      const measuredWidth = Math.max(120, Math.min(availableWidth, widestLine + 24))
      setTextBoxWidth((current) => Math.abs(current - measuredWidth) > 2 ? measuredWidth : current)
      textarea.style.width = `${measuredWidth}px`
    }
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.max(
      40,
      textarea.scrollHeight,
    )}px`
  }, [
    textValue,
    textFontSize,
    textBold,
    textItalic,
    textUnderline,
    width,
    textPosition,
  ])

  useEffect(() => {
    setTextPosition(null)
    setTextValue('')
    setTextBoxWidth(400)
    setTextFontSize(22)
    setTextBold(false)
    setTextItalic(false)
    setTextUnderline(false)
    setTextAlignment('left')
    setEditingTextId(null)
    setSelectedTextId(null)
    setSelectedShapeId(null)
    setSelectedShapeIds([])
    currentPointsRef.current = []
    textDragRef.current = null
    textResizeRef.current = null
    shapeDrawRef.current = null
    shapeDragRef.current = null
    shapeRotationRef.current = null
    shapeResizeRef.current = null
    setDragPreviewPosition(null)
    setResizePreview(null)
    setShapePreview(null)
    setShapeDragPreview(null)
    setShapeRotationPreview(null)
    setShapeResizePreview(null)
    setIsDraggingShape(false)
    setIsDraggingText(false)
    setIsDrawing(false)
  }, [pageId])

  // A shape selection belongs to Shape mode. When the user switches
  // to another tool, remove the shape selection and its resize/rotation
  // controls so they never remain visually attached to the canvas.
  useEffect(() => {
    if (activeTool !== 'shape') {
      setSelectedShapeId(null)
      setSelectedShapeIds([])
      setShapeDragPreview(null)
      setShapeRotationPreview(null)
      setShapeResizePreview(null)
      shapeDragRef.current = null
      shapeRotationRef.current = null
      shapeResizeRef.current = null
      shapeResizePreviewRef.current = null
      setIsDraggingShape(false)
    }
  }, [activeTool])

  useEffect(() => {
    if (activeTool !== 'laser') {
      setLaserTrail([])
      if (laserFadeTimerRef.current !== null) {
        window.clearTimeout(laserFadeTimerRef.current)
        laserFadeTimerRef.current = null
      }
    }
    return () => {
      if (laserFadeTimerRef.current !== null) window.clearTimeout(laserFadeTimerRef.current)
    }
  }, [activeTool])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null

      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (!isTypingTarget && (activeTool === 'select' || activeTool === 'lasso') && selectedElementIds.length > 0 && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        useDocumentStore.setState((state) => {
          if (!state.notebook) return state
          const previousNotebook = structuredClone(state.notebook)
          const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? { ...pageItem, elements: pageItem.elements.filter((element) => !selectedElementIds.includes(element.id)) } : pageItem)
          return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
        })
        setSelectedElementIds([])
        return
      }

      if (!isTypingTarget && (activeTool === 'select' || activeTool === 'lasso') && selectedElementIds.length > 1 && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        const groupId = event.shiftKey ? null : crypto.randomUUID()
        useDocumentStore.setState((state) => {
          if (!state.notebook) return state
          const previousNotebook = structuredClone(state.notebook)
          const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? {
            ...pageItem,
            elements: pageItem.elements.map((element) => {
              if (!selectedElementIds.includes(element.id)) return element
              const next = { ...element }
              if (groupId) next.groupId = groupId
              else delete next.groupId
              return next
            }),
          } : pageItem)
          return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
        })
        return
      }

      if (!isTypingTarget && (activeTool === 'select' || activeTool === 'lasso') && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selectedElementIds.length > 0) {
        event.preventDefault()
        const currentPage = useDocumentStore.getState().notebook?.pages.find((item) => item.id === pageId)
        elementClipboardRef.current = structuredClone(currentPage?.elements.filter((item) => selectedElementIds.includes(item.id)) ?? [])
        return
      }

      if (!isTypingTarget && (activeTool === 'select' || activeTool === 'lasso') && (event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'v' || event.key.toLowerCase() === 'd')) {
        if (event.key.toLowerCase() === 'd' && selectedElementIds.length > 0) {
          const currentPage = useDocumentStore.getState().notebook?.pages.find((item) => item.id === pageId)
          elementClipboardRef.current = structuredClone(currentPage?.elements.filter((item) => selectedElementIds.includes(item.id)) ?? [])
        }
        if (elementClipboardRef.current.length > 0) {
          event.preventDefault()
          const pastedGroupIds = new Map<string, string>()
          const pastedElements = elementClipboardRef.current.map((element) => {
            const groupId = element.groupId ? (pastedGroupIds.get(element.groupId) ?? crypto.randomUUID()) : undefined
            if (element.groupId && groupId) pastedGroupIds.set(element.groupId, groupId)
            if (element.type === 'stroke') return { ...structuredClone(element), id: crypto.randomUUID(), ...(groupId ? { groupId } : {}), points: element.points.map((point) => ({ ...point, x: point.x + 20, y: point.y + 20 })) }
            return { ...structuredClone(element), id: crypto.randomUUID(), ...(groupId ? { groupId } : {}), x: element.x + 20, y: element.y + 20 }
          })
          useDocumentStore.setState((state) => {
            if (!state.notebook) return state
            const previousNotebook = structuredClone(state.notebook)
            const pages = state.notebook.pages.map((item) => item.id === pageId ? { ...item, elements: [...item.elements, ...pastedElements] } : item)
            return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
          })
          setSelectedElementIds(pastedElements.map((item) => item.id))
          return
        }
      }

      if (
        !isTypingTarget &&
        event.key.toLowerCase() === 'r'
      ) {
        event.preventDefault()
        useToolStore.getState().setActiveTool('shape')
        setSelectedTextId(null)
        return
      }

      if (!selectedTextId || editingTextId) {
        if (
          selectedShapeId &&
          !editingTextId &&
          !isTypingTarget &&
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'c'
        ) {
          event.preventDefault()

          const currentPage = useDocumentStore
            .getState()
            .notebook?.pages
            .find((pageItem) => pageItem.id === pageId)

          const ids =
            selectedShapeIds.length > 0
              ? selectedShapeIds
              : selectedShapeId
                ? [selectedShapeId]
                : []

          const copiedShapes =
            currentPage?.elements
              .filter(
                (element): element is StyledShapeElement =>
                  element.type === 'shape' &&
                  ids.includes(element.id),
              )
              .map((shape) => ({
                ...structuredClone(shape),
                lineStyle: shape.lineStyle ?? 'solid',
              })) ?? []

          if (copiedShapes.length > 0) {
            multiShapeClipboardRef.current = copiedShapes
            shapeClipboardRef.current = copiedShapes[0]
          }

          return
        }

        if (
          !selectedTextId &&
          !editingTextId &&
          !isTypingTarget &&
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'v'
        ) {
          event.preventDefault()

          const clipboardShapes =
            multiShapeClipboardRef.current.length > 0
              ? multiShapeClipboardRef.current
              : shapeClipboardRef.current
                ? [shapeClipboardRef.current]
                : []

          if (clipboardShapes.length === 0) {
            return
          }

          const pastedShapes = clipboardShapes.map((shape) => ({
            ...structuredClone(shape),
            id: crypto.randomUUID(),
            x: shape.x + 20,
            y: shape.y + 20,
            lineStyle: shape.lineStyle ?? 'solid',
          }))

          useDocumentStore.setState((state) => {
            if (!state.notebook) {
              return state
            }

            const previousNotebook = structuredClone(state.notebook)

            const pages = state.notebook.pages.map((pageItem) => {
              if (pageItem.id !== pageId) {
                return pageItem
              }

              return {
                ...pageItem,
                elements: [...pageItem.elements, ...pastedShapes],
              }
            })

            return {
              notebook: {
                ...state.notebook,
                pages,
                updatedAt: Date.now(),
              },
              history: [...state.history, previousNotebook],
              future: [],
            }
          })

          setSelectedShapeIds(pastedShapes.map((shape) => shape.id))
          setSelectedShapeId(
            pastedShapes[pastedShapes.length - 1]?.id ?? null,
          )
          setSelectedTextId(null)
          return
        }

        if (
          selectedShapeId &&
          !editingTextId &&
          !isTypingTarget &&
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'd'
        ) {
          event.preventDefault()
          duplicateSelectedShape(pageId, selectedShapeId)
          return
        }


        if (
          selectedShapeId &&
          !editingTextId &&
          !isTypingTarget &&
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          (event.key === '[' || event.key === ']')
        ) {
          event.preventDefault()

          if (event.key === ']') {
            changeShapeLayer(
              pageId,
              selectedShapeId,
              event.shiftKey ? 'front' : 'forward',
            )
          } else {
            changeShapeLayer(
              pageId,
              selectedShapeId,
              event.shiftKey ? 'back' : 'backward',
            )
          }

          return
        }

        if (
          selectedShapeIds.length > 1 &&
          !editingTextId &&
          !isTypingTarget &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
            event.key,
          )
        ) {
          event.preventDefault()

          const moveAmount = event.shiftKey ? 10 : 1
          const deltaX =
            event.key === 'ArrowLeft'
              ? -moveAmount
              : event.key === 'ArrowRight'
                ? moveAmount
                : 0
          const deltaY =
            event.key === 'ArrowUp'
              ? -moveAmount
              : event.key === 'ArrowDown'
                ? moveAmount
                : 0

          useDocumentStore.setState((state) => {
            if (!state.notebook) {
              return state
            }

            const previousNotebook = structuredClone(state.notebook)

            const pages = state.notebook.pages.map((pageItem) =>
              pageItem.id === pageId
                ? {
                    ...pageItem,
                    elements: pageItem.elements.map((element) => {
                      if (
                        element.type !== 'shape' ||
                        !selectedShapeIds.includes(element.id)
                      ) {
                        return element
                      }

                      return {
                        ...element,
                        x: Math.max(
                          0,
                          Math.min(
                            width - element.width,
                            element.x + deltaX,
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            height - element.height,
                            element.y + deltaY,
                          ),
                        ),
                      }
                    }),
                  }
                : pageItem,
            )

            return {
              notebook: {
                ...state.notebook,
                pages,
                updatedAt: Date.now(),
              },
              history: [...state.history, previousNotebook],
              future: [],
            }
          })

          return
        }

        if (
          selectedShapeId &&
          !editingTextId &&
          !isTypingTarget &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
            event.key,
          )
        ) {
          event.preventDefault()

          const moveAmount = event.shiftKey ? 10 : 1

          const deltaX =
            event.key === 'ArrowLeft'
              ? -moveAmount
              : event.key === 'ArrowRight'
                ? moveAmount
                : 0

          const deltaY =
            event.key === 'ArrowUp'
              ? -moveAmount
              : event.key === 'ArrowDown'
                ? moveAmount
                : 0

          useDocumentStore.setState((state) => {
            if (!state.notebook) {
              return state
            }

            const currentPage = state.notebook.pages.find(
              (pageItem) => pageItem.id === pageId,
            )

            const currentShape = currentPage?.elements.find(
              (element): element is ShapeElement =>
                element.type === 'shape' &&
                element.id === selectedShapeId,
            )

            if (!currentShape) {
              return state
            }

            const previousNotebook = structuredClone(state.notebook)

            const pages = state.notebook.pages.map((pageItem) =>
              pageItem.id === pageId
                ? {
                    ...pageItem,
                    elements: pageItem.elements.map((element) =>
                      element.type === 'shape' &&
                      element.id === selectedShapeId
                        ? {
                            ...element,
                            x: element.x + deltaX,
                            y: element.y + deltaY,
                          }
                        : element,
                    ),
                  }
                : pageItem,
            )

            return {
              notebook: {
                ...state.notebook,
                pages,
                updatedAt: Date.now(),
              },
              history: [...state.history, previousNotebook],
              future: [],
            }
          })

          return
        }

        if (
          selectedShapeId &&
          !editingTextId &&
          !isTypingTarget &&
          (
            event.key === 'Delete' ||
            event.key === 'Backspace'
          )
        ) {
          event.preventDefault()

          const ids =
            selectedShapeIds.length > 0
              ? selectedShapeIds
              : [selectedShapeId]

          useDocumentStore.setState((state) => {
            if (!state.notebook) {
              return state
            }

            const previousNotebook = structuredClone(
              state.notebook,
            )

            const pages = state.notebook.pages.map(
              (pageItem) =>
                pageItem.id === pageId
                  ? {
                      ...pageItem,
                      elements: pageItem.elements.filter(
                        (element) =>
                          element.type !== 'shape' ||
                          !ids.includes(element.id),
                      ),
                    }
                  : pageItem,
            )

            return {
              notebook: {
                ...state.notebook,
                pages,
                updatedAt: Date.now(),
              },
              history: [
                ...state.history,
                previousNotebook,
              ],
              future: [],
            }
          })

          setSelectedShapeId(null)
          setSelectedShapeIds([])
          return
        }

        if (
          !isTypingTarget &&
          event.key === 'Escape' &&
          useToolStore.getState().activeTool === 'shape'
        ) {
          event.preventDefault()
          useToolStore.getState().setActiveTool('pen')
          shapeDrawRef.current = null
          shapeDragRef.current = null
          setShapePreview(null)
          setShapeDragPreview(null)
          setSelectedShapeId(null)
          setSelectedShapeIds([])
          setIsDraggingShape(false)
        }

        return
      }

      if (
        event.key === 'Delete' ||
        event.key === 'Backspace'
      ) {
        event.preventDefault()

        removeText(pageId, selectedTextId)
        setSelectedTextId(null)
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setSelectedTextId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    selectedTextId,
    selectedShapeId,
    editingTextId,
    pageId,
    removeText,
    activeTool,
    selectedElementIds,
    selectedShapeIds,
    width,
    height,
  ])

  const startEditingText = (text: TextElement) => {
    setSelectedTextId(text.id)
    setEditingTextId(text.id)

    setTextPosition({
      x: text.x,
      y: text.y,
    })

    setTextValue(text.text)
    setTextBoxWidth(text.width)
    setTextFontSize(text.fontSize)
    setTextBold(text.bold)
    setTextItalic(text.italic)
    setTextUnderline(text.underline)
    setTextAlignment(text.alignment)
  }

  const saveText = () => {
    if (!textPosition || !textValue.trim()) {
      setTextPosition(null)
      setTextValue('')
      setTextBoxWidth(400)
      setEditingTextId(null)
      return
    }

    if (editingTextId) {
      const canvas = canvasRef.current
      let requiredHeight = editingText?.height ?? 100

      if (canvas) {
        const context = canvas.getContext('2d')

        if (context && editingText) {
          requiredHeight = getTextRequiredHeight(
            context,
            {
              ...editingText,
              text: textValue,
              width: textBoxWidth,
              fontSize: textFontSize,
              bold: textBold,
              italic: textItalic,
              underline: textUnderline,
              alignment: textAlignment,
            },
          )
        }
      }

      updateText(
        pageId,
        editingTextId,
        textValue,
      )

      useDocumentStore.setState((state) => {
        if (!state.notebook) {
          return state
        }

        const previousNotebook = structuredClone(
          state.notebook,
        )

        const pages = state.notebook.pages.map(
          (pageItem) =>
            pageItem.id === pageId
              ? {
                  ...pageItem,
                  elements: pageItem.elements.map(
                    (element) =>
                      element.type === 'text' &&
                      element.id === editingTextId
                        ? {
                            ...element,
                            fontSize: textFontSize,
                            bold: textBold,
                            italic: textItalic,
                            underline: textUnderline,
                            alignment: textAlignment,
                            height: Math.max(
                              element.height,
                              requiredHeight,
                            ),
                            width: textBoxWidth,
                          }
                        : element,
                  ),
                }
              : pageItem,
        )

        return {
          notebook: {
            ...state.notebook,
            pages,
            updatedAt: Date.now(),
          },
          history: [
            ...state.history,
            previousNotebook,
          ],
          future: [],
        }
      })
    } else {
      const canvas = canvasRef.current
      let initialHeight = 100

      if (canvas) {
        const context = canvas.getContext('2d')

        if (context) {
          initialHeight = getTextRequiredHeight(
            context,
            {
              id: 'preview',
              type: 'text',
              x: textPosition.x,
              y: textPosition.y,
              width: textBoxWidth,
              height: 100,
              text: textValue,
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: textFontSize,
              color,
              bold: textBold,
              italic: textItalic,
              underline: textUnderline,
              alignment: textAlignment,
            },
          )
        }
      }

      addText(pageId, {
        id: crypto.randomUUID(),
        type: 'text',
        x: textPosition.x,
        y: textPosition.y,
        width: textBoxWidth,
        height: initialHeight,
        text: textValue,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: textFontSize,
        color,
        bold: textBold,
        italic: textItalic,
        underline: textUnderline,
        alignment: textAlignment,
      })
    }

    setTextPosition(null)
    setTextValue('')
    setEditingTextId(null)
    setTextBold(false)
    setTextItalic(false)
    setTextUnderline(false)
    setTextAlignment('left')
  }

  const cancelTextEditing = () => {
    setTextPosition(null)
    setTextValue('')
    setEditingTextId(null)
    setTextBold(false)
    setTextItalic(false)
    setTextUnderline(false)
    setTextAlignment('left')
  }

  const handlePointerDown = (
    event: PointerEvent<HTMLCanvasElement>,
  ) => {
    if (event.pointerType === 'pen') {
      penInUseRef.current = true
      lastPenActivityRef.current = performance.now()
    } else if (event.pointerType === 'touch' && (penInUseRef.current || performance.now() - lastPenActivityRef.current < 900)) {
      return
    }

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    if (activePageId !== pageId) {
      return
    }

    const point = getPoint(event)

    if (activeTool === 'laser') {
      event.preventDefault()
      if (laserFadeTimerRef.current !== null) window.clearTimeout(laserFadeTimerRef.current)
      setLaserTrail([point])
      setIsDrawing(true)
      canvas.setPointerCapture(event.pointerId)
      return
    }

    if (activeTool === 'sticky-note') {
      event.preventDefault()
      const sticky: StickyNoteElement = {
        id: crypto.randomUUID(), type: 'sticky-note',
        x: Math.max(0, Math.min(width - 190, point.x - 95)),
        y: Math.max(0, Math.min(height - 150, point.y - 75)),
        width: 190, height: 150, text: '', color: '#fff1a8', rotation: 0,
      }
      useDocumentStore.setState((state) => {
        if (!state.notebook) return state
        const previousNotebook = structuredClone(state.notebook)
        const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? { ...pageItem, elements: [...pageItem.elements, sticky] } : pageItem)
        return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
      })
      setSelectedElementIds([sticky.id])
      useToolStore.getState().setActiveTool('select')
      return
    }

    if (activeTool === 'select' || activeTool === 'lasso') {
      event.preventDefault()
      setSelectedTextId(null)
      const pageElements = page?.elements ?? []
      const stickyHit = [...pageElements].reverse().find((element): element is StickyNoteElement => element.type === 'sticky-note' && point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height)
      const hit = stickyHit ?? [...pageElements].reverse().find((element) => {
        if (element.type === 'stroke') return isPointNearStroke(point, element, 8)
        if (element.type === 'shape') return isPointInsideShape(point, element)
        const bounds = getElementBounds(element)
        return point.x >= bounds.x - 5 && point.x <= bounds.x + bounds.width + 5 && point.y >= bounds.y - 5 && point.y <= bounds.y + bounds.height + 5
      })
      if (hit) {
        if (audioPlaybackActive && hit.type === 'stroke' && notebook?.id) {
          const timedPoints = hit.points.filter((candidate) => typeof candidate.timestamp === 'number')
          const nearestPoint = timedPoints.reduce<Point | null>((nearest, candidate) => {
            if (!nearest || Math.hypot(candidate.x - point.x, candidate.y - point.y) < Math.hypot(nearest.x - point.x, nearest.y - point.y)) return candidate
            return nearest
          }, null)
          if (nearestPoint?.timestamp !== undefined) {
            window.dispatchEvent(new CustomEvent('freenotes-audio-seek', {
              detail: { notebookId: notebook.id, timestamp: nearestPoint.timestamp },
            }))
          }
        }
        const hitGroupIds = hit.type === 'sticky-note'
          ? pageElements.filter((element) => {
              if (element.id === hit.id) return true
              const bounds = getElementBounds(element)
              const centerX = bounds.x + bounds.width / 2
              const centerY = bounds.y + bounds.height / 2
              return centerX >= hit.x && centerX <= hit.x + hit.width && centerY >= hit.y && centerY <= hit.y + hit.height
            }).map((element) => element.id)
          : hit.groupId
          ? (page?.elements ?? []).filter((element) => element.groupId === hit.groupId).map((element) => element.id)
          : [hit.id]
        if (event.shiftKey && hitGroupIds.some((id) => selectedElementIds.includes(id))) {
          setSelectedElementIds((current) => current.filter((id) => !hitGroupIds.includes(id)))
          selectionActionRef.current = null
          setSelectionPreview(null)
          return
        }
        const nextSelection = event.shiftKey
          ? [...new Set([...selectedElementIds, ...hitGroupIds])]
          : hitGroupIds.some((id) => selectedElementIds.includes(id)) ? selectedElementIds : hitGroupIds
        setSelectedElementIds(nextSelection)
        selectionActionRef.current = { kind: 'move', start: point, current: point }
        setSelectionPreview(null)
        if (
          activeTool === 'select' &&
          hit.type === 'sticky-note' &&
          nextSelection.length === 1 &&
          nextSelection[0] === hit.id
        ) {
          stickyDragRef.current = {
            pointerId: event.pointerId,
            startPointer: point,
            currentPointer: point,
            sticky: hit,
          }
          setIsStickyDragging(true)
          drawStickyDragPreview()
        }
      } else {
        if (!event.shiftKey) setSelectedElementIds([])
        const kind = activeTool === 'lasso' ? 'lasso' : 'marquee'
        selectionActionRef.current = { kind, start: point, current: point, ...(kind === 'lasso' ? { points: [point] } : {}) }
        setSelectionPreview(kind === 'marquee' ? { kind, x: point.x, y: point.y, width: 0, height: 0 } : null)
        setLassoPreview(kind === 'lasso' ? [point] : [])
      }
      canvas.setPointerCapture(event.pointerId)
      return
    }

    if (activeTool === 'text') {
      event.preventDefault()
      setSelectedShapeId(null)

      if (textPosition) {
        saveText()
        return
      }

      const texts =
        page?.elements.filter(
          (element): element is TextElement =>
            element.type === 'text',
        ) ?? []

      const clickedText = [...texts]
        .reverse()
        .find((text) =>
          isPointInsideText(point, text),
        )

      if (clickedText) {
        setSelectedTextId(clickedText.id)

        textDragRef.current = {
          textId: clickedText.id,
          offsetX: point.x - clickedText.x,
          offsetY: point.y - clickedText.y,
        }

        setIsDraggingText(false)

        canvas.setPointerCapture(event.pointerId)

        return
      }

      setSelectedTextId(null)

      setTextPosition({
        x: point.x,
        y: point.y,
      })

      setTextValue('')
      setTextFontSize(22)
      setTextBold(false)
      setTextItalic(false)
      setTextUnderline(false)
      setTextAlignment('left')
      setEditingTextId(null)

      return
    }

    if (activeTool === 'shape') {
      event.preventDefault()
      setSelectedTextId(null)

      const shapes =
        page?.elements.filter(
          (element): element is ShapeElement =>
            element.type === 'shape',
        ) ?? []

      const clickedShape = [...shapes]
        .reverse()
        .find((shape) =>
          isPointInsideShape(point, shape),
        )

      if (clickedShape) {
        const isMultiSelect = event.shiftKey

        if (isMultiSelect) {
          setSelectedShapeIds((current) => {
            const exists = current.includes(clickedShape.id)

            if (exists) {
              const next = current.filter(
                (id) => id !== clickedShape.id,
              )

              setSelectedShapeId(
                next.length > 0 ? next[next.length - 1] : null,
              )

              return next
            }

            const next = [...current, clickedShape.id]
            setSelectedShapeId(clickedShape.id)
            return next
          })

          setIsDraggingShape(false)
          setShapeDragPreview(null)
          return
        }

        const activeSelection = selectedShapeIds.includes(clickedShape.id)
          ? selectedShapeIds
          : [clickedShape.id]

        setSelectedShapeId(clickedShape.id)
        setSelectedShapeIds(activeSelection)

        if (activeSelection.length > 1) {
          const startPositions: Record<string, { x: number; y: number }> = {}

          for (const id of activeSelection) {
            const shape = shapes.find((item) => item.id === id)

            if (shape) {
              startPositions[id] = {
                x: shape.x,
                y: shape.y,
              }
            }
          }

          multiShapeDragRef.current = {
            shapeIds: activeSelection,
            startPointerX: point.x,
            startPointerY: point.y,
            startPositions,
          }

          setIsDraggingShape(false)
          setShapeDragPreview(null)
        } else {
          shapeDragRef.current = {
            shapeId: clickedShape.id,
            startPointerX: point.x,
            startPointerY: point.y,
            startX: clickedShape.x,
            startY: clickedShape.y,
          }

          setIsDraggingShape(false)
          setShapeDragPreview({
            shapeId: clickedShape.id,
            x: clickedShape.x,
            y: clickedShape.y,
          })
        }

        canvas.setPointerCapture(event.pointerId)
        return
      }

      setSelectedShapeId(null)
      setSelectedShapeIds([])

      shapeDrawRef.current = {
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      }

      setShapePreview(shapeDrawRef.current)
      canvas.setPointerCapture(event.pointerId)
      return
    }

    if (activeTool === 'eraser') {
      event.preventDefault()
      setSelectedShapeId(null)
      const currentNotebook = useDocumentStore.getState().notebook
      if (!currentNotebook) {
        return
      }
      eraserPointerIdRef.current = event.pointerId
      // Notebook updates are immutable, so keeping this reference gives us a
      // single-step undo snapshot without cloning large imported PDFs here.
      eraserOriginalNotebookRef.current = currentNotebook
      eraserChangedRef.current = false
      eraserLastPointRef.current = null
      eraserPendingPointsRef.current = [point]
      applyEraserSweep()
      canvas.setPointerCapture(event.pointerId)
      return
    }

    setSelectedShapeId(null)

    if (page) {
      const texts =
        page.elements.filter(
          (element): element is TextElement =>
            element.type === 'text',
        )

      const clickedText = [...texts]
        .reverse()
        .find((text) =>
          isPointInsideText(point, text),
        )

      if (clickedText) {
        setSelectedTextId(clickedText.id)
        return
      }
    }

    setSelectedTextId(null)

    clearLiveInkPreview()
    currentPointsRef.current = [point]
    setIsDrawing(true)

    canvas.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (
    event: PointerEvent<HTMLCanvasElement>,
  ) => {
    if (event.pointerType === 'pen') {
      lastPenActivityRef.current = performance.now()
    } else if (event.pointerType === 'touch' && (penInUseRef.current || performance.now() - lastPenActivityRef.current < 900)) {
      return
    }

    if (activePageId !== pageId) {
      return
    }

    if (stickyDragRef.current?.pointerId === event.pointerId) {
      stickyDragRef.current.currentPointer = getPointFromClient(event.clientX, event.clientY)
      scheduleStickyDragPreview()
      return
    }

    if (activeTool === 'laser') {
      const point = getPoint(event)
      setLaserTrail((current) => [...current.slice(-34), point])
      if (laserFadeTimerRef.current !== null) window.clearTimeout(laserFadeTimerRef.current)
      laserFadeTimerRef.current = window.setTimeout(() => setLaserTrail([]), 900)
      return
    }

    if ((activeTool === 'select' || activeTool === 'lasso') && selectionActionRef.current) {
      const point = getPoint(event)
      const action = selectionActionRef.current
      const points = action.kind === 'lasso' && (action.points?.length ?? 0) > 0 && Math.hypot(point.x - action.points![action.points!.length - 1].x, point.y - action.points![action.points!.length - 1].y) >= 3
        ? [...(action.points ?? []), point]
        : action.points
      selectionActionRef.current = { ...action, current: point, points }
      if (action.kind === 'lasso' && points) setLassoPreview(points)
      if (action.kind === 'marquee') setSelectionPreview({
        kind: 'marquee',
        x: Math.min(action.start.x, point.x),
        y: Math.min(action.start.y, point.y),
        width: Math.abs(point.x - action.start.x),
        height: Math.abs(point.y - action.start.y),
      })
      return
    }

    if (
      activeTool === 'shape' &&
      multiShapeDragRef.current
    ) {
      const point = getPoint(event)
      const dragState = multiShapeDragRef.current
      const deltaX = point.x - dragState.startPointerX
      const deltaY = point.y - dragState.startPointerY

      setIsDraggingShape(
        Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1,
      )

      return
    }

    if (
      activeTool === 'shape' &&
      shapeDragRef.current
    ) {
      const point = getPoint(event)
      const dragState = shapeDragRef.current

      const draggedShape = page?.elements.find(
        (element): element is ShapeElement =>
          element.type === 'shape' &&
          element.id === dragState.shapeId,
      )

      if (!draggedShape) {
        return
      }

      const newX =
        dragState.startX +
        (point.x - dragState.startPointerX)
      const newY =
        dragState.startY +
        (point.y - dragState.startPointerY)

      const clampedX = Math.max(
        0,
        Math.min(
          newX,
          width - draggedShape.width,
        ),
      )

      const clampedY = Math.max(
        0,
        Math.min(
          newY,
          height - draggedShape.height,
        ),
      )

      setIsDraggingShape(true)
      setShapeDragPreview({
        shapeId: dragState.shapeId,
        x: clampedX,
        y: clampedY,
      })

      return
    }

    if (
      activeTool === 'shape' &&
      shapeDrawRef.current
    ) {
      const point = getPoint(event)

      shapeDrawRef.current = {
        ...shapeDrawRef.current,
        currentX: point.x,
        currentY: point.y,
      }

      setShapePreview(shapeDrawRef.current)
      return
    }

    if (
      activeTool === 'eraser'
    ) {
      const coalescedEvents = event.nativeEvent.getCoalescedEvents?.() ?? []
      if (coalescedEvents.length > 0) {
        eraserPendingPointsRef.current.push(...coalescedEvents.map((sample) => ({
          ...getPointFromClient(sample.clientX, sample.clientY),
          pressure: sample.pressure,
          timestamp: Date.now(),
        })))
      } else {
        eraserPendingPointsRef.current.push(getPoint(event))
      }

      if (eraserFrameRef.current === null) {
        eraserFrameRef.current = requestAnimationFrame(() => {
          eraserFrameRef.current = null
          applyEraserSweep()
        })
      }

      return
    }

    if (
      activeTool !== 'text' &&
      isDrawing
    ) {
      const coalescedEvents = event.nativeEvent.getCoalescedEvents?.() ?? []
      if (coalescedEvents.length > 0 && !rulerVisible) {
        currentPointsRef.current.push(...coalescedEvents.map((sample) => ({
          ...getPointFromClient(sample.clientX, sample.clientY),
          pressure: sample.pressure,
          timestamp: Date.now(),
        })))
      } else {
        currentPointsRef.current.push(getPoint(event))
      }

      if (liveInkFrameRef.current === null) {
        liveInkFrameRef.current = requestAnimationFrame(() => {
          liveInkFrameRef.current = null
          const previewCanvas = liveInkCanvasRef.current
          const context = previewCanvas?.getContext('2d')
          if (!previewCanvas || !context) return

          const startIndex = liveRenderedPointCountRef.current
          let strokeWidth = widthValue
          let strokeOpacity = opacity

          if (activeTool === 'pencil') {
            strokeWidth = Math.max(1, widthValue * 0.7)
            strokeOpacity = Math.min(opacity, 0.55)
          } else if (activeTool === 'highlighter') {
            strokeWidth = Math.max(10, widthValue * 3)
            strokeOpacity = Math.min(opacity, 0.3)
          }

          drawLiveStrokeSlice(context, currentPointsRef.current, startIndex, color, strokeWidth, strokeOpacity)
          liveRenderedPointCountRef.current = currentPointsRef.current.length
        })
      }

      return
    }

    if (
      activeTool !== 'text' ||
      !textDragRef.current
    ) {
      return
    }

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const point = getPoint(event)
    const dragState = textDragRef.current

    const newX = point.x - dragState.offsetX
    const newY = point.y - dragState.offsetY

    const draggedText = page?.elements.find(
      (element) =>
        element.type === 'text' &&
        element.id === dragState.textId,
    )

    if (
      !draggedText ||
      draggedText.type !== 'text'
    ) {
      return
    }

    const clampedX = Math.max(
      0,
      Math.min(
        newX,
        width - draggedText.width,
      ),
    )

    const clampedY = Math.max(
      0,
      Math.min(
        newY,
        height - draggedText.height,
      ),
    )

    setIsDraggingText(true)

    setDragPreviewPosition({
      x: clampedX,
      y: clampedY,
    })
  }

  const updateTextPosition = (
    targetPageId: string,
    textId: string,
    x: number,
    y: number,
  ) => {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(
        state.notebook,
      )

      const pages = state.notebook.pages.map(
        (pageItem) =>
          pageItem.id === targetPageId
            ? {
                ...pageItem,
                elements: pageItem.elements.map(
                  (element) =>
                    element.type === 'text' &&
                    element.id === textId
                      ? {
                          ...element,
                          x,
                          y,
                        }
                      : element,
                ),
              }
            : pageItem,
      )

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [
          ...state.history,
          previousNotebook,
        ],
        future: [],
      }
    })
  }

  const updateShapePosition = (
    targetPageId: string,
    shapeId: string,
    x: number,
    y: number,
  ) => {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(
        state.notebook,
      )

      const pages = state.notebook.pages.map(
        (pageItem) =>
          pageItem.id === targetPageId
            ? {
                ...pageItem,
                elements: pageItem.elements.map(
                  (element) =>
                    element.type === 'shape' &&
                    element.id === shapeId
                      ? {
                          ...element,
                          x,
                          y,
                        }
                      : element,
                ),
              }
            : pageItem,
      )

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [
          ...state.history,
          previousNotebook,
        ],
        future: [],
      }
    })
  }

  const updateShapeStyle = (
    targetPageId: string,
    shapeId: string,
    changes: Partial<Pick<StyledShapeElement, 'strokeColor' | 'fillColor' | 'strokeWidth' | 'lineStyle'>>,
  ) => {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(state.notebook)

      const pages = state.notebook.pages.map((pageItem) =>
        pageItem.id === targetPageId
          ? {
              ...pageItem,
              elements: pageItem.elements.map((element) =>
                element.type === 'shape' && element.id === shapeId
                  ? { ...element, ...changes }
                  : element,
              ),
            }
          : pageItem,
      )

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [...state.history, previousNotebook],
        future: [],
      }
    })
  }

  const updateShapeRotation = (
    targetPageId: string,
    shapeId: string,
    rotation: number,
  ) => {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(state.notebook)

      const pages = state.notebook.pages.map((pageItem) =>
        pageItem.id === targetPageId
          ? {
              ...pageItem,
              elements: pageItem.elements.map((element) =>
                element.type === 'shape' &&
                element.id === shapeId
                  ? { ...element, rotation }
                  : element,
              ),
            }
          : pageItem,
      )

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [...state.history, previousNotebook],
        future: [],
      }
    })
  }

  const updateShapeResize = (
    targetPageId: string,
    shapeId: string,
    x: number,
    y: number,
    shapeWidth: number,
    shapeHeight: number,
  ) => {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(state.notebook)

      const pages = state.notebook.pages.map((pageItem) =>
        pageItem.id === targetPageId
          ? {
              ...pageItem,
              elements: pageItem.elements.map((element) =>
                element.type === 'shape' &&
                element.id === shapeId
                  ? {
                      ...element,
                      x,
                      y,
                      width: shapeWidth,
                      height: shapeHeight,
                    }
                  : element,
              ),
            }
          : pageItem,
      )

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [...state.history, previousNotebook],
        future: [],
      }
    })
  }


  function duplicateSelectedShape(
    targetPageId: string,
    shapeId: string,
  ) {
    const duplicatedShapeId = crypto.randomUUID()

    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(state.notebook)

      const pages = state.notebook.pages.map((pageItem) => {
        if (pageItem.id !== targetPageId) {
          return pageItem
        }

        const sourceIndex = pageItem.elements.findIndex(
          (element) =>
            element.type === 'shape' &&
            element.id === shapeId,
        )

        if (sourceIndex === -1) {
          return pageItem
        }

        const sourceShape = pageItem.elements[sourceIndex] as StyledShapeElement

        const duplicateShape: StyledShapeElement = {
          ...structuredClone(sourceShape),
          id: duplicatedShapeId,
          x: sourceShape.x + 20,
          y: sourceShape.y + 20,
          lineStyle: sourceShape.lineStyle ?? 'solid',
        }

        const elements = [...pageItem.elements]
        elements.splice(sourceIndex + 1, 0, duplicateShape)

        return {
          ...pageItem,
          elements,
        }
      })

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [...state.history, previousNotebook],
        future: [],
      }
    })

    setSelectedShapeId(duplicatedShapeId)
    setSelectedTextId(null)
  }


  function changeShapeLayer(
    targetPageId: string,
    shapeId: string,
    direction: 'forward' | 'backward' | 'front' | 'back',
  ) {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(state.notebook)

      const pages = state.notebook.pages.map((pageItem) => {
        if (pageItem.id !== targetPageId) {
          return pageItem
        }

        const sourceIndex = pageItem.elements.findIndex(
          (element) =>
            element.type === 'shape' &&
            element.id === shapeId,
        )

        if (sourceIndex === -1) {
          return pageItem
        }

        let targetIndex = sourceIndex

        if (direction === 'forward') {
          targetIndex = Math.min(
            sourceIndex + 1,
            pageItem.elements.length - 1,
          )
        } else if (direction === 'backward') {
          targetIndex = Math.max(sourceIndex - 1, 0)
        } else if (direction === 'front') {
          targetIndex = pageItem.elements.length - 1
        } else if (direction === 'back') {
          targetIndex = 0
        }

        if (targetIndex === sourceIndex) {
          return pageItem
        }

        const elements = [...pageItem.elements]
        const [shape] = elements.splice(sourceIndex, 1)
        elements.splice(targetIndex, 0, shape)

        return {
          ...pageItem,
          elements,
        }
      })

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [...state.history, previousNotebook],
        future: [],
      }
    })

    setSelectedShapeId(shapeId)
    setSelectedTextId(null)
  }

  const shapeAlignmentButtonStyle: CSSProperties = {
    width: '30px',
    height: '28px',
    padding: 0,
    border: '1px solid #dedee2',
    borderRadius: '5px',
    background: '#ffffff',
    cursor: 'pointer',
    fontSize: '15px',
    lineHeight: 1,
  }

  const alignSelectedShape = (
    targetPageId: string,
    shapeId: string,
    alignment:
      | 'left'
      | 'center-horizontal'
      | 'right'
      | 'top'
      | 'center-vertical'
      | 'bottom',
  ) => {
    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(state.notebook)

      const pages = state.notebook.pages.map((pageItem) => {
        if (pageItem.id !== targetPageId) {
          return pageItem
        }

        const elements = pageItem.elements.map((element) => {
          if (element.type !== 'shape' || element.id !== shapeId) {
            return element
          }

          const shape = element as StyledShapeElement
          let x = shape.x
          let y = shape.y

          if (alignment === 'left') {
            x = 0
          } else if (alignment === 'center-horizontal') {
            x = (width - shape.width) / 2
          } else if (alignment === 'right') {
            x = width - shape.width
          } else if (alignment === 'top') {
            y = 0
          } else if (alignment === 'center-vertical') {
            y = (height - shape.height) / 2
          } else if (alignment === 'bottom') {
            y = height - shape.height
          }

          return {
            ...shape,
            x: Math.max(0, x),
            y: Math.max(0, y),
          }
        })

        return {
          ...pageItem,
          elements,
        }
      })

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [...state.history, previousNotebook],
        future: [],
      }
    })

    setSelectedShapeId(shapeId)
    setSelectedTextId(null)
  }

  const startShapeResize = (
    event: PointerEvent<HTMLDivElement>,
    shape: ShapeElement,
    handle: ResizeHandle,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    setSelectedShapeId(shape.id)

    shapeResizeRef.current = {
      shapeId: shape.id,
      handle,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: shape.x,
      startY: shape.y,
      startWidth: shape.width,
      startHeight: shape.height,
      startRotation: shape.rotation ?? 0,
    }

    const initialPreview = {
      shapeId: shape.id,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
    }

    shapeResizePreviewRef.current = initialPreview
    setShapeResizePreview(initialPreview)

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleShapeResizeMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const resizeState = shapeResizeRef.current

    if (!resizeState || activePageId !== pageId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()

    const scaleX =
      rect && rect.width > 0
        ? width / rect.width
        : 1

    const scaleY =
      rect && rect.height > 0
        ? height / rect.height
        : 1

    const worldDeltaX =
      (event.clientX - resizeState.startPointerX) * scaleX
    const worldDeltaY =
      (event.clientY - resizeState.startPointerY) * scaleY

    const rotation =
      (resizeState.startRotation * Math.PI) / 180
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)

    // Convert the pointer movement into the shape's local coordinates.
    const deltaX =
      worldDeltaX * cos + worldDeltaY * sin
    const deltaY =
      -worldDeltaX * sin + worldDeltaY * cos

    const minSize = 20
    const isUniform =
      shapeResizeRef.current &&
      page?.elements.some(
        (element) =>
          element.type === 'shape' &&
          element.id === resizeState.shapeId &&
          (element.shape === 'circle' ||
            element.shape === 'triangle'),
      )

    let nextX = resizeState.startX
    let nextY = resizeState.startY
    let nextWidth = resizeState.startWidth
    let nextHeight = resizeState.startHeight

    if (isUniform) {
      let scaleDelta = 0

      if (
        resizeState.handle === 'left' ||
        resizeState.handle === 'right'
      ) {
        scaleDelta =
          deltaX /
          Math.max(1, resizeState.startWidth)
      } else if (
        resizeState.handle === 'top' ||
        resizeState.handle === 'bottom'
      ) {
        scaleDelta =
          deltaY /
          Math.max(1, resizeState.startHeight)
      } else {
        const widthScale =
          deltaX /
          Math.max(1, resizeState.startWidth)
        const heightScale =
          deltaY /
          Math.max(1, resizeState.startHeight)

        scaleDelta =
          Math.abs(widthScale) >= Math.abs(heightScale)
            ? widthScale
            : heightScale
      }

      const minimumScale =
        minSize /
        Math.max(
          1,
          Math.min(
            resizeState.startWidth,
            resizeState.startHeight,
          ),
        )

      const nextScale = Math.max(
        minimumScale,
        1 + scaleDelta,
      )

      nextWidth = Math.max(
        minSize,
        resizeState.startWidth * nextScale,
      )
      nextHeight = Math.max(
        minSize,
        resizeState.startHeight * nextScale,
      )

      if (
        resizeState.handle === 'left' ||
        resizeState.handle === 'top-left' ||
        resizeState.handle === 'bottom-left'
      ) {
        nextX =
          resizeState.startX +
          resizeState.startWidth -
          nextWidth
      }

      if (
        resizeState.handle === 'top' ||
        resizeState.handle === 'top-left' ||
        resizeState.handle === 'top-right'
      ) {
        nextY =
          resizeState.startY +
          resizeState.startHeight -
          nextHeight
      }
    } else {
      if (
        resizeState.handle === 'right' ||
        resizeState.handle === 'top-right' ||
        resizeState.handle === 'bottom-right'
      ) {
        nextWidth = resizeState.startWidth + deltaX
      }

      if (
        resizeState.handle === 'left' ||
        resizeState.handle === 'top-left' ||
        resizeState.handle === 'bottom-left'
      ) {
        nextX = resizeState.startX + deltaX
        nextWidth = resizeState.startWidth - deltaX
      }

      if (
        resizeState.handle === 'bottom' ||
        resizeState.handle === 'bottom-left' ||
        resizeState.handle === 'bottom-right'
      ) {
        nextHeight = resizeState.startHeight + deltaY
      }

      if (
        resizeState.handle === 'top' ||
        resizeState.handle === 'top-left' ||
        resizeState.handle === 'top-right'
      ) {
        nextY = resizeState.startY + deltaY
        nextHeight = resizeState.startHeight - deltaY
      }

      if (nextWidth < minSize) {
        if (
          resizeState.handle === 'left' ||
          resizeState.handle === 'top-left' ||
          resizeState.handle === 'bottom-left'
        ) {
          nextX =
            resizeState.startX +
            resizeState.startWidth -
            minSize
        }

        nextWidth = minSize
      }

      if (nextHeight < minSize) {
        if (
          resizeState.handle === 'top' ||
          resizeState.handle === 'top-left' ||
          resizeState.handle === 'top-right'
        ) {
          nextY =
            resizeState.startY +
            resizeState.startHeight -
            minSize
        }

        nextHeight = minSize
      }
    }

    nextWidth = Math.min(nextWidth, width)
    nextHeight = Math.min(nextHeight, height)

    nextX = Math.max(
      0,
      Math.min(nextX, width - nextWidth),
    )
    nextY = Math.max(
      0,
      Math.min(nextY, height - nextHeight),
    )

    const nextPreview = {
      shapeId: resizeState.shapeId,
      x: nextX,
      y: nextY,
      width: Math.max(minSize, nextWidth),
      height: Math.max(minSize, nextHeight),
    }

    shapeResizePreviewRef.current = nextPreview
    setShapeResizePreview(nextPreview)
  }

  const commitShapeResize = () => {
    const resizeState = shapeResizeRef.current
    const preview = shapeResizePreviewRef.current

    if (!resizeState || !preview) {
      return
    }

    const changed =
      Math.abs(preview.x - resizeState.startX) > 0.001 ||
      Math.abs(preview.y - resizeState.startY) > 0.001 ||
      Math.abs(preview.width - resizeState.startWidth) > 0.001 ||
      Math.abs(preview.height - resizeState.startHeight) > 0.001

    if (changed) {
      updateShapeResize(
        pageId,
        resizeState.shapeId,
        preview.x,
        preview.y,
        preview.width,
        preview.height,
      )
    }

    shapeResizeRef.current = null
    shapeResizePreviewRef.current = null
    setShapeResizePreview(null)
  }

  const cancelShapeResize = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    shapeResizeRef.current = null
    shapeResizePreviewRef.current = null
    setShapeResizePreview(null)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleShapeRotationMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const rotationState = shapeRotationRef.current

    if (!rotationState || activePageId !== pageId) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const point = getPointFromClient(
      event.clientX,
      event.clientY,
    )

    const currentAngle =
      (Math.atan2(
        point.y - rotationState.centerY,
        point.x - rotationState.centerX,
      ) *
        180) /
      Math.PI

    let rotation =
      rotationState.startRotation +
      (currentAngle - rotationState.startPointerAngle)

    rotation = ((rotation % 360) + 360) % 360

    setShapeRotationPreview({
      shapeId: rotationState.shapeId,
      rotation,
    })
  }

  const startShapeRotation = (
    event: PointerEvent<HTMLDivElement>,
    shape: ShapeElement,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const point = getPointFromClient(
      event.clientX,
      event.clientY,
    )

    const centerX = shape.x + shape.width / 2
    const centerY = shape.y + shape.height / 2
    const startPointerAngle =
      (Math.atan2(
        point.y - centerY,
        point.x - centerX,
      ) *
        180) /
      Math.PI

    shapeRotationRef.current = {
      shapeId: shape.id,
      centerX,
      centerY,
      startRotation: shape.rotation ?? 0,
      startPointerAngle,
    }

    setSelectedShapeId(shape.id)
    setShapeRotationPreview({
      shapeId: shape.id,
      rotation: shape.rotation ?? 0,
    })

    event.currentTarget.setPointerCapture(
      event.pointerId,
    )
  }

  const finishShapeRotation = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const rotationState = shapeRotationRef.current
    const preview = shapeRotationPreview

    if (
      rotationState &&
      preview &&
      preview.shapeId === rotationState.shapeId
    ) {
      const normalizedStart =
        ((rotationState.startRotation % 360) + 360) % 360

      if (Math.abs(preview.rotation - normalizedStart) > 0.001) {
        updateShapeRotation(
          pageId,
          rotationState.shapeId,
          preview.rotation,
        )
      }
    }

    shapeRotationRef.current = null
    setShapeRotationPreview(null)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      )
    }
  }

  const cancelShapeRotation = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    shapeRotationRef.current = null
    setShapeRotationPreview(null)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      )
    }
  }

  const handleTextResizeMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const resizeState = textResizeRef.current

    if (
      !resizeState ||
      activePageId !== pageId
    ) {
      return
    }

    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()

    const scaleX =
      rect && rect.width > 0
        ? width / rect.width
        : 1

    const scaleY =
      rect && rect.height > 0
        ? height / rect.height
        : 1

    const deltaX =
      (event.clientX -
        resizeState.startPointerX) *
      scaleX

    const deltaY =
      (event.clientY -
        resizeState.startPointerY) *
      scaleY

    const minWidth = 80
    const minHeight = 40

    let nextX = resizeState.startX
    let nextY = resizeState.startY
    let nextWidth = resizeState.startWidth
    let nextHeight = resizeState.startHeight

    if (
      resizeState.handle === 'right' ||
      resizeState.handle === 'top-right' ||
      resizeState.handle === 'bottom-right'
    ) {
      nextWidth =
        resizeState.startWidth + deltaX
    }

    if (
      resizeState.handle === 'left' ||
      resizeState.handle === 'top-left' ||
      resizeState.handle === 'bottom-left'
    ) {
      nextX =
        resizeState.startX + deltaX

      nextWidth =
        resizeState.startWidth - deltaX
    }

    if (
      resizeState.handle === 'bottom' ||
      resizeState.handle === 'bottom-left' ||
      resizeState.handle === 'bottom-right'
    ) {
      nextHeight =
        resizeState.startHeight + deltaY
    }

    if (
      resizeState.handle === 'top' ||
      resizeState.handle === 'top-left' ||
      resizeState.handle === 'top-right'
    ) {
      nextY =
        resizeState.startY + deltaY

      nextHeight =
        resizeState.startHeight - deltaY
    }

    if (nextWidth < minWidth) {
      if (
        resizeState.handle === 'left' ||
        resizeState.handle === 'top-left' ||
        resizeState.handle === 'bottom-left'
      ) {
        nextX =
          resizeState.startX +
          resizeState.startWidth -
          minWidth
      }

      nextWidth = minWidth
    }

    if (nextHeight < minHeight) {
      if (
        resizeState.handle === 'top' ||
        resizeState.handle === 'top-left' ||
        resizeState.handle === 'top-right'
      ) {
        nextY =
          resizeState.startY +
          resizeState.startHeight -
          minHeight
      }

      nextHeight = minHeight
    }

    nextX = Math.max(
      0,
      Math.min(nextX, width - minWidth),
    )

    nextY = Math.max(
      0,
      Math.min(nextY, height - minHeight),
    )

    nextWidth = Math.min(
      nextWidth,
      width - nextX,
    )

    nextHeight = Math.min(
      nextHeight,
      height - nextY,
    )

    setResizePreview({
      textId: resizeState.textId,
      x: nextX,
      y: nextY,
      width: Math.max(
        minWidth,
        nextWidth,
      ),
      height: Math.max(
        minHeight,
        nextHeight,
      ),
    })
  }

  const commitTextResize = () => {
    const resizeState = textResizeRef.current
    const preview = resizePreview

    if (!resizeState || !preview) {
      return
    }

    const canvas = canvasRef.current
    let committedHeight = preview.height

    if (canvas) {
      const context = canvas.getContext('2d')

      const targetText = page?.elements.find(
        (element): element is TextElement =>
          element.type === 'text' &&
          element.id === resizeState.textId,
      )

      if (context && targetText) {
        committedHeight = Math.max(
          preview.height,
          getTextRequiredHeight(
            context,
            {
              ...targetText,
              x: preview.x,
              y: preview.y,
              width: preview.width,
              height: committedHeight,
            },
          ),
        )
      }
    }

    useDocumentStore.setState((state) => {
      if (!state.notebook) {
        return state
      }

      const previousNotebook = structuredClone(
        state.notebook,
      )

      const pages = state.notebook.pages.map(
        (pageItem) =>
          pageItem.id === pageId
            ? {
                ...pageItem,
                elements: pageItem.elements.map(
                  (element) =>
                    element.type === 'text' &&
                    element.id ===
                      resizeState.textId
                      ? {
                          ...element,
                          x: preview.x,
                          y: preview.y,
                          width: preview.width,
                          height: committedHeight,
                        }
                      : element,
                ),
              }
            : pageItem,
      )

      return {
        notebook: {
          ...state.notebook,
          pages,
          updatedAt: Date.now(),
        },
        history: [
          ...state.history,
          previousNotebook,
        ],
        future: [],
      }
    })

    textResizeRef.current = null
    setResizePreview(null)
  }

  const handlePointerUp = (
    event: PointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    if (
      activeTool === 'text' &&
      textDragRef.current &&
      isDraggingText &&
      dragPreviewPosition
    ) {
      const dragState = textDragRef.current

      updateTextPosition(
        pageId,
        dragState.textId,
        dragPreviewPosition.x,
        dragPreviewPosition.y,
      )
    }

    textDragRef.current = null
    setDragPreviewPosition(null)
    setIsDraggingText(false)

    if (
      canvas.hasPointerCapture(
        event.pointerId,
      )
    ) {
      canvas.releasePointerCapture(
        event.pointerId,
      )
    }
  }

  const handleDoubleClick = (
    event: PointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      activePageId !== pageId ||
      !page
    ) {
      return
    }

    if (isDraggingText) {
      return
    }

    const point = getPoint(event)

    const clickedSticky = [...page.elements].reverse().find((element): element is StickyNoteElement => element.type === 'sticky-note' && isPointInsideShape(point, { ...element, type: 'shape', shape: 'rectangle', strokeColor: 'transparent', fillColor: 'transparent', strokeWidth: 0, rotation: element.rotation ?? 0 }))
    if (clickedSticky) {
      event.preventDefault()
      setStickyEditing({ id: clickedSticky.id, text: clickedSticky.text === 'Double-click to edit' ? '' : clickedSticky.text })
      return
    }

    const texts =
      page.elements.filter(
        (element): element is TextElement =>
          element.type === 'text',
      )

    const clickedText = [...texts]
      .reverse()
      .find((text) =>
        isPointInsideText(point, text),
      )

    if (clickedText) {
      event.preventDefault()
      startEditingText(clickedText)
    }
  }

  const saveStickyText = () => {
    if (!stickyEditing) return
    useDocumentStore.setState((state) => {
      if (!state.notebook) return state
      const previousNotebook = structuredClone(state.notebook)
      const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? {
        ...pageItem,
        elements: pageItem.elements.map((element) => element.type === 'sticky-note' && element.id === stickyEditing.id ? { ...element, text: stickyEditing.text } : element),
      } : pageItem)
      return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
    })
    setStickyEditing(null)
  }

  const stopDrawing = (
    event: PointerEvent<HTMLCanvasElement>,
  ) => {
    if (event.pointerType === 'pen') {
      penInUseRef.current = false
      lastPenActivityRef.current = performance.now()
    }

    if (finishStickyDrag(event)) return

    if (eraserPointerIdRef.current === event.pointerId) {
      eraserPendingPointsRef.current.push(
        getPointFromClient(event.clientX, event.clientY),
      )
      finishEraserGesture(event.pointerId)
      return
    }

    clearLiveInkPreview()

    if (activeTool === 'laser') {
      setIsDrawing(false)
      const laserCanvas = canvasRef.current
      if (laserCanvas?.hasPointerCapture(event.pointerId)) laserCanvas.releasePointerCapture(event.pointerId)
      if (laserFadeTimerRef.current !== null) window.clearTimeout(laserFadeTimerRef.current)
      laserFadeTimerRef.current = window.setTimeout(() => setLaserTrail([]), 900)
      return
    }
    if ((activeTool === 'select' || activeTool === 'lasso') && selectionActionRef.current) {
      const action = selectionActionRef.current
      const end = getPoint(event)
      const deltaX = end.x - action.start.x
      const deltaY = end.y - action.start.y
      if (action.kind === 'move' && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) && selectedElementIds.length > 0) {
        useDocumentStore.setState((state) => {
          if (!state.notebook) return state
          const previousNotebook = structuredClone(state.notebook)
          const pages = state.notebook.pages.map((pageItem) => pageItem.id !== pageId ? pageItem : {
            ...pageItem,
            elements: pageItem.elements.map((element) => {
              if (!selectedElementIds.includes(element.id)) return element
              if (element.type === 'stroke') return { ...element, points: element.points.map((point) => ({ ...point, x: Math.max(0, Math.min(width, point.x + deltaX)), y: Math.max(0, Math.min(height, point.y + deltaY)) })) }
              return { ...element, x: Math.max(0, Math.min(width - element.width, element.x + deltaX)), y: Math.max(0, Math.min(height - element.height, element.y + deltaY)) }
            }),
          })
          return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
        })
      }
      if (action.kind === 'marquee' && Math.hypot(deltaX, deltaY) > 4) {
        const left = Math.min(action.start.x, end.x), top = Math.min(action.start.y, end.y)
        const right = Math.max(action.start.x, end.x), bottom = Math.max(action.start.y, end.y)
        const matches = (page?.elements ?? []).filter((element) => {
          const bounds = getElementBounds(element)
          return bounds.x <= right && bounds.x + bounds.width >= left && bounds.y <= bottom && bounds.y + bounds.height >= top
        }).map((element) => element.id)
        setSelectedElementIds((current) => event.shiftKey ? [...new Set([...current, ...matches])] : matches)
      }
      if (action.kind === 'lasso' && (action.points?.length ?? 0) >= 3) {
        const polygon = action.points!
        const matches = (page?.elements ?? []).filter((element) => {
          const bounds = getElementBounds(element)
          const x = bounds.x + bounds.width / 2
          const y = bounds.y + bounds.height / 2
          let inside = false
          for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const a = polygon[i], b = polygon[j]
            if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
          }
          return inside
        }).map((element) => element.id)
        setSelectedElementIds((current) => event.shiftKey ? [...new Set([...current, ...matches])] : matches)
      }
      selectionActionRef.current = null
      setSelectionPreview(null)
      setLassoPreview([])
      const selectionCanvas = canvasRef.current
      if (selectionCanvas?.hasPointerCapture(event.pointerId)) selectionCanvas.releasePointerCapture(event.pointerId)
      return
    }

    if (
      activeTool === 'shape' &&
      multiShapeDragRef.current
    ) {
      const dragState = multiShapeDragRef.current

      if (isDraggingShape) {
        const point = getPoint(event)
        const deltaX = point.x - dragState.startPointerX
        const deltaY = point.y - dragState.startPointerY

        useDocumentStore.setState((state) => {
          if (!state.notebook) {
            return state
          }

          const previousNotebook = structuredClone(state.notebook)

          const pages = state.notebook.pages.map((pageItem) => {
            if (pageItem.id !== pageId) {
              return pageItem
            }

            return {
              ...pageItem,
              elements: pageItem.elements.map((element) => {
                if (
                  element.type !== 'shape' ||
                  !dragState.shapeIds.includes(element.id)
                ) {
                  return element
                }

                const start = dragState.startPositions[element.id]

                if (!start) {
                  return element
                }

                const nextX = Math.max(
                  0,
                  Math.min(
                    width - element.width,
                    start.x + deltaX,
                  ),
                )

                const nextY = Math.max(
                  0,
                  Math.min(
                    height - element.height,
                    start.y + deltaY,
                  ),
                )

                return {
                  ...element,
                  x: nextX,
                  y: nextY,
                }
              }),
            }
          })

          return {
            notebook: {
              ...state.notebook,
              pages,
              updatedAt: Date.now(),
            },
            history: [...state.history, previousNotebook],
            future: [],
          }
        })
      }

      multiShapeDragRef.current = null
      setIsDraggingShape(false)

      const canvas = canvasRef.current

      if (
        canvas?.hasPointerCapture(
          event.pointerId,
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId,
        )
      }

      return
    }

    if (
      activeTool === 'shape' &&
      shapeDragRef.current
    ) {
      if (
        isDraggingShape &&
        shapeDragPreview
      ) {
        const dragState = shapeDragRef.current

        updateShapePosition(
          pageId,
          dragState.shapeId,
          shapeDragPreview.x,
          shapeDragPreview.y,
        )
      }

      shapeDragRef.current = null
      setShapeDragPreview(null)
      setIsDraggingShape(false)

      const canvas = canvasRef.current

      if (
        canvas?.hasPointerCapture(
          event.pointerId,
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId,
        )
      }

      return
    }

    if (
      activeTool === 'shape' &&
      shapeDrawRef.current
    ) {
      const shapeState =
        shapeDrawRef.current

      const minSize = 4

      const deltaX =
        shapeState.currentX -
        shapeState.startX

      const deltaY =
        shapeState.currentY -
        shapeState.startY

      let shapeX = Math.min(
        shapeState.startX,
        shapeState.currentX,
      )

      let shapeY = Math.min(
        shapeState.startY,
        shapeState.currentY,
      )

      let shapeWidth = Math.abs(deltaX)
      let shapeHeight = Math.abs(deltaY)

      if (shapeType === 'circle') {
        const size = Math.min(
          Math.abs(deltaX),
          Math.abs(deltaY),
        )

        shapeWidth = size
        shapeHeight = size

        shapeX =
          deltaX < 0
            ? shapeState.startX - size
            : shapeState.startX

        shapeY =
          deltaY < 0
            ? shapeState.startY - size
            : shapeState.startY
      }

      if (
        shapeWidth >= minSize &&
        shapeHeight >= minSize
      ) {
        useDocumentStore.setState(
          (state) => {
            if (!state.notebook) {
              return state
            }

            const previousNotebook =
              structuredClone(
                state.notebook,
              )

            const newShape: StyledShapeElement = {
              id: crypto.randomUUID(),
              type: 'shape',
              shape: shapeType,
              x: shapeX,
              y: shapeY,
              width: shapeWidth,
              height: shapeHeight,
              rotation: 0,
              strokeColor: color,
              fillColor: 'transparent',
              strokeWidth: Math.max(
                1,
                widthValue,
              ),
              lineStyle: 'solid',
            }

            const pages =
              state.notebook.pages.map(
                (pageItem) =>
                  pageItem.id === pageId
                    ? {
                        ...pageItem,
                        elements: [
                          ...pageItem.elements,
                          newShape,
                        ],
                      }
                    : pageItem,
              )

            return {
              notebook: {
                ...state.notebook,
                pages,
                updatedAt: Date.now(),
              },
              history: [
                ...state.history,
                previousNotebook,
              ],
              future: [],
            }
          },
        )
      }

      shapeDrawRef.current = null
      setShapePreview(null)

      const canvas = canvasRef.current

      if (
        canvas?.hasPointerCapture(
          event.pointerId,
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId,
        )
      }

      return
    }

    if (
      activeTool === 'text' &&
      textDragRef.current
    ) {
      handlePointerUp(event)
      return
    }

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    if (
      currentPointsRef.current.length > 0 &&
      activeTool !== 'eraser' &&
      activeTool !== 'text' &&
      activePageId === pageId
    ) {
      const pointerUpPoint = getPoint(event)
      const lastPoint = currentPointsRef.current.at(-1)
      if (lastPoint && Math.hypot(pointerUpPoint.x - lastPoint.x, pointerUpPoint.y - lastPoint.y) > 1) {
        currentPointsRef.current.push(pointerUpPoint)
      }
      let strokeWidth = widthValue
      let strokeOpacity = opacity

      if (activeTool === 'pencil') {
        strokeWidth = Math.max(
          1,
          widthValue * 0.7,
        )

        strokeOpacity = Math.min(
          opacity,
          0.55,
        )
      }

      if (activeTool === 'highlighter') {
        strokeWidth = Math.max(
          10,
          widthValue * 3,
        )

        strokeOpacity = Math.min(
          opacity,
          0.3,
        )
      }

      const autoShapeRecognition = useToolStore.getState().autoShapeRecognition
      const recognized = autoShapeRecognition && (activeTool === 'pen' || activeTool === 'pencil')
        ? recognizeStroke(currentPointsRef.current)
        : null

      if (recognized && recognized.kind !== 'line') {
        useDocumentStore.setState((state) => {
          if (!state.notebook) return state
          const previousNotebook = structuredClone(state.notebook)
          const recognizedShape: ShapeElement = {
            id: crypto.randomUUID(), type: 'shape',
            shape: recognized.kind === 'circle' ? 'circle' : 'rectangle',
            x: recognized.x, y: recognized.y, width: recognized.width, height: recognized.height,
            rotation: 0, strokeColor: color, fillColor: 'transparent', strokeWidth,
          }
          const notebook = { ...state.notebook, pages: state.notebook.pages.map((pageItem) => pageItem.id === pageId ? { ...pageItem, elements: [...pageItem.elements, recognizedShape] } : pageItem), updatedAt: Date.now() }
          return { notebook, history: [...state.history, previousNotebook], future: [] }
        })
      } else {
        addStroke(pageId, {
        id: crypto.randomUUID(),
        type: 'stroke',
        points: recognized?.kind === 'line' ? recognized.points : currentPointsRef.current,
        color,
        width: strokeWidth,
        opacity: strokeOpacity,
        tool:
          activeTool === 'pencil'
            ? 'pencil'
            : activeTool === 'highlighter'
              ? 'highlighter'
              : 'pen',
        })
      }
    }

    currentPointsRef.current = []
    setIsDrawing(false)

    if (
      canvas.hasPointerCapture(
        event.pointerId,
      )
    ) {
      canvas.releasePointerCapture(
        event.pointerId,
      )
    }
  }

  const startTextResize = (
    event: PointerEvent<HTMLDivElement>,
    text: TextElement,
    handle: ResizeHandle,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    setSelectedTextId(text.id)

    textResizeRef.current = {
      textId: text.id,
      handle,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: text.x,
      startY: text.y,
      startWidth: text.width,
      startHeight: text.height,
    }

    setResizePreview({
      textId: text.id,
      x: text.x,
      y: text.y,
      width: text.width,
      height: text.height,
    })

    event.currentTarget.setPointerCapture(
      event.pointerId,
    )
  }

  const resizeHandleStyles: Record<
    ResizeHandle,
    CSSProperties
  > = {
    'top-left': {
      left: '-12px',
      top: '-12px',
      cursor: 'nwse-resize',
    },
    top: {
      left: '50%',
      top: '-12px',
      transform: 'translateX(-50%)',
      cursor: 'ns-resize',
    },
    'top-right': {
      right: '-12px',
      top: '-12px',
      cursor: 'nesw-resize',
    },
    right: {
      right: '-12px',
      top: '50%',
      transform: 'translateY(-50%)',
      cursor: 'ew-resize',
    },
    'bottom-right': {
      right: '-12px',
      bottom: '-12px',
      cursor: 'nwse-resize',
    },
    bottom: {
      left: '50%',
      bottom: '-12px',
      transform: 'translateX(-50%)',
      cursor: 'ns-resize',
    },
    'bottom-left': {
      left: '-12px',
      bottom: '-12px',
      cursor: 'nesw-resize',
    },
    left: {
      left: '-12px',
      top: '50%',
      transform: 'translateY(-50%)',
      cursor: 'ew-resize',
    },
  }

  const resizeHandles: ResizeHandle[] = [
    'top-left',
    'top',
    'top-right',
    'right',
    'bottom-right',
    'bottom',
    'bottom-left',
    'left',
  ]

  const editingText = editingTextId
    ? page?.elements.find(
        (
          element,
        ): element is TextElement =>
          element.type === 'text' &&
          element.id === editingTextId,
      ) ?? null
    : null

  const selectedElements = (page?.elements ?? []).filter((element) => selectedElementIds.includes(element.id))
  const selectedImage = selectedElements.length === 1 && selectedElements[0].type === 'image'
    ? selectedElements[0]
    : null
  const selectedBounds = selectedElements.length > 0 ? (() => {
    const bounds = selectedElements.map(getElementBounds)
    const left = Math.min(...bounds.map((item) => item.x))
    const top = Math.min(...bounds.map((item) => item.y))
    const right = Math.max(...bounds.map((item) => item.x + item.width))
    const bottom = Math.max(...bounds.map((item) => item.y + item.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
  })() : null
  const selectionMoveDelta = selectionActionRef.current?.kind === 'move'
    ? { x: selectionActionRef.current.current.x - selectionActionRef.current.start.x, y: selectionActionRef.current.current.y - selectionActionRef.current.start.y }
    : { x: 0, y: 0 }

  const deleteSelectedElements = () => {
    if (selectedElementIds.length === 0) return
    useDocumentStore.setState((state) => {
      if (!state.notebook) return state
      const previousNotebook = structuredClone(state.notebook)
      const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId
        ? { ...pageItem, elements: pageItem.elements.filter((element) => !selectedElementIds.includes(element.id)) }
        : pageItem)
      return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
    })
    setSelectedElementIds([])
  }

  const beginImageCrop = () => {
    if (!selectedImage) return
    setImageCropDraft({
      imageId: selectedImage.id,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })
  }

  const startImageCropDrag = (event: PointerEvent<HTMLButtonElement>, edges: ImageCropEdge[]) => {
    if (!imageCropDraft) return
    event.preventDefault()
    event.stopPropagation()
    imageCropDragRef.current = { pointerId: event.pointerId, edges, crop: imageCropDraft.crop }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveImageCropDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = imageCropDragRef.current
    const image = page?.elements.find((element): element is ImageElement => element.type === 'image' && element.id === imageCropDraft?.imageId)
    if (!drag || !image || drag.pointerId !== event.pointerId) return
    const point = getPointFromClient(event.clientX, event.clientY)
    const angle = (-image.rotation * Math.PI) / 180
    const dx = point.x - (image.x + image.width / 2)
    const dy = point.y - (image.y + image.height / 2)
    let sourceX = (image.x + image.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - image.x) / image.width
    let sourceY = (image.y + image.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - image.y) / image.height
    sourceX = Math.max(0, Math.min(1, sourceX))
    sourceY = Math.max(0, Math.min(1, sourceY))
    const crop = { ...drag.crop }
    const minSize = 0.08
    if (drag.edges.includes('left')) {
      const right = drag.crop.x + drag.crop.width
      crop.x = Math.min(sourceX, right - minSize)
      crop.width = right - crop.x
    }
    if (drag.edges.includes('right')) crop.width = Math.max(minSize, sourceX - drag.crop.x)
    if (drag.edges.includes('top')) {
      const bottom = drag.crop.y + drag.crop.height
      crop.y = Math.min(sourceY, bottom - minSize)
      crop.height = bottom - crop.y
    }
    if (drag.edges.includes('bottom')) crop.height = Math.max(minSize, sourceY - drag.crop.y)
    setImageCropDraft({ imageId: image.id, crop })
  }

  const finishImageCropDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (imageCropDragRef.current?.pointerId !== event.pointerId) return
    imageCropDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const saveImageCrop = () => {
    if (!imageCropDraft) return
    useDocumentStore.setState((state) => {
      if (!state.notebook) return state
      const previousNotebook = structuredClone(state.notebook)
      const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? {
        ...pageItem,
        elements: pageItem.elements.map((element) => {
          if (element.type !== 'image' || element.id !== imageCropDraft.imageId) return element
          const previousCrop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 }
          const draft = imageCropDraft.crop
          const sourceX = element.flipX ? 1 - draft.x - draft.width : draft.x
          const sourceY = element.flipY ? 1 - draft.y - draft.height : draft.y
          const crop = {
            x: previousCrop.x + sourceX * previousCrop.width,
            y: previousCrop.y + sourceY * previousCrop.height,
            width: draft.width * previousCrop.width,
            height: draft.height * previousCrop.height,
          }
          const nextWidth = element.width * draft.width
          const nextHeight = element.height * draft.height
          const offsetX = (draft.x + draft.width / 2 - 0.5) * element.width
          const offsetY = (draft.y + draft.height / 2 - 0.5) * element.height
          const angle = (element.rotation * Math.PI) / 180
          const centerX = element.x + element.width / 2 + offsetX * Math.cos(angle) - offsetY * Math.sin(angle)
          const centerY = element.y + element.height / 2 + offsetX * Math.sin(angle) + offsetY * Math.cos(angle)
          return { ...element, x: centerX - nextWidth / 2, y: centerY - nextHeight / 2, width: nextWidth, height: nextHeight, crop }
        }),
      } : pageItem)
      return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
    })
    setImageCropDraft(null)
  }

  const flipSelectedImage = (axis: 'horizontal' | 'vertical') => {
    if (!selectedImage) return
    useDocumentStore.setState((state) => {
      if (!state.notebook) return state
      const previousNotebook = structuredClone(state.notebook)
      const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? {
        ...pageItem,
        elements: pageItem.elements.map((element) => element.type === 'image' && element.id === selectedImage.id
          ? axis === 'horizontal' ? { ...element, flipX: !element.flipX } : { ...element, flipY: !element.flipY }
          : element),
      } : pageItem)
      return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
    })
  }

  const startSelectionResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!selectedBounds || selectedBounds.width < 1 || selectedBounds.height < 1) return
    event.preventDefault()
    event.stopPropagation()
    const point = getPointFromClient(event.clientX, event.clientY)
    selectionResizeRef.current = { pointerId: event.pointerId, startPointer: point, bounds: selectedBounds }
    setSelectionScalePreview({ bounds: selectedBounds, scaleX: 1, scaleY: 1 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveSelectionResize = (event: PointerEvent<HTMLButtonElement>) => {
    const resize = selectionResizeRef.current
    if (!resize) return
    const point = getPointFromClient(event.clientX, event.clientY)
    const scaleX = Math.max(0.15, Math.min(6, (resize.bounds.width + point.x - resize.startPointer.x) / resize.bounds.width))
    const scaleY = Math.max(0.15, Math.min(6, (resize.bounds.height + point.y - resize.startPointer.y) / resize.bounds.height))
    setSelectionScalePreview({ bounds: resize.bounds, scaleX, scaleY })
  }

  const finishSelectionResize = (event: PointerEvent<HTMLButtonElement>) => {
    const resize = selectionResizeRef.current
    const preview = selectionScalePreview
    if (!resize || !preview) return
    useDocumentStore.setState((state) => {
      if (!state.notebook) return state
      const previousNotebook = structuredClone(state.notebook)
      const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? {
        ...pageItem,
        elements: pageItem.elements.map((element) => selectedElementIds.includes(element.id) ? scaleElement(element, resize.bounds, preview.scaleX, preview.scaleY) : element),
      } : pageItem)
      return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
    })
    selectionResizeRef.current = null
    setSelectionScalePreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const startSelectionRotate = (event: PointerEvent<HTMLButtonElement>) => {
    if (!selectedBounds) return
    event.preventDefault()
    event.stopPropagation()
    const centerX = selectedBounds.x + selectedBounds.width / 2
    const centerY = selectedBounds.y + selectedBounds.height / 2
    const point = getPointFromClient(event.clientX, event.clientY)
    selectionRotateRef.current = { pointerId: event.pointerId, centerX, centerY, startAngle: Math.atan2(point.y - centerY, point.x - centerX), startRotation: 0 }
    setSelectionRotationPreview({ centerX, centerY, degrees: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveSelectionRotate = (event: PointerEvent<HTMLButtonElement>) => {
    const rotation = selectionRotateRef.current
    if (!rotation) return
    const point = getPointFromClient(event.clientX, event.clientY)
    const currentAngle = Math.atan2(point.y - rotation.centerY, point.x - rotation.centerX)
    const degrees = (currentAngle - rotation.startAngle) * 180 / Math.PI
    setSelectionRotationPreview({ centerX: rotation.centerX, centerY: rotation.centerY, degrees })
  }

  const finishSelectionRotate = (event: PointerEvent<HTMLButtonElement>) => {
    const rotation = selectionRotateRef.current
    const preview = selectionRotationPreview
    if (!rotation || !preview) return
    const radians = preview.degrees * Math.PI / 180
    const cos = Math.cos(radians), sin = Math.sin(radians)
    useDocumentStore.setState((state) => {
      if (!state.notebook) return state
      const previousNotebook = structuredClone(state.notebook)
      const pages = state.notebook.pages.map((pageItem) => pageItem.id === pageId ? {
        ...pageItem,
        elements: pageItem.elements.map((element) => {
          if (!selectedElementIds.includes(element.id)) return element
          if (element.type === 'stroke') return { ...element, points: element.points.map((point) => ({ ...point, x: rotation.centerX + (point.x - rotation.centerX) * cos - (point.y - rotation.centerY) * sin, y: rotation.centerY + (point.x - rotation.centerX) * sin + (point.y - rotation.centerY) * cos })) }
          const bounds = getElementBounds(element)
          const elementCenterX = bounds.x + bounds.width / 2, elementCenterY = bounds.y + bounds.height / 2
          const nextCenterX = rotation.centerX + (elementCenterX - rotation.centerX) * cos - (elementCenterY - rotation.centerY) * sin
          const nextCenterY = rotation.centerY + (elementCenterX - rotation.centerX) * sin + (elementCenterY - rotation.centerY) * cos
          return { ...element, x: nextCenterX - bounds.width / 2, y: nextCenterY - bounds.height / 2, rotation: (element.rotation ?? 0) + preview.degrees }
        }),
      } : pageItem)
      return { notebook: { ...state.notebook, pages, updatedAt: Date.now() }, history: [...state.history, previousNotebook], future: [] }
    })
    selectionRotateRef.current = null
    setSelectionRotationPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }


  const exportNotebookAsPdf = async () => {
    const currentNotebook =
      useDocumentStore.getState().notebook

    if (!currentNotebook) {
      setPdfImportError('Create a note before exporting a PDF.')
      return
    }

    try {
      setPdfImportError(null)

      const { jsPDF } = await import('jspdf')

      const exportWidth = 1588
      const exportHeight = 2246
      const logicalWidth = Math.max(width, 1)
      const logicalHeight = Math.max(height, 1)

      const canvasToDataUrl = async (
        pageItem: Page,
      ): Promise<string> => {
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = exportWidth
        exportCanvas.height = exportHeight

        const exportContext = exportCanvas.getContext('2d')

        if (!exportContext) {
          throw new Error(
            'Unable to create the PDF export canvas.',
          )
        }

        exportContext.imageSmoothingEnabled = true
        exportContext.imageSmoothingQuality = 'high'
        exportContext.fillStyle = '#ffffff'
        exportContext.fillRect(
          0,
          0,
          exportWidth,
          exportHeight,
        )

        const scale = Math.min(
          exportWidth / logicalWidth,
          exportHeight / logicalHeight,
        )

        const contentWidth = logicalWidth * scale
        const contentHeight = logicalHeight * scale
        const offsetX = (exportWidth - contentWidth) / 2
        const offsetY = (exportHeight - contentHeight) / 2

        exportContext.save()
        exportContext.translate(offsetX, offsetY)
        exportContext.scale(scale, scale)

        const pdfPage = pageItem as PdfPage

        if (pdfPage.pdfBackground) {
          const pdfImage = new Image()
          pdfImage.src = pdfPage.pdfBackground

          await new Promise<void>((resolve, reject) => {
            pdfImage.onload = () => resolve()
            pdfImage.onerror = () =>
              reject(
                new Error(
                  'Unable to load a PDF page during export.',
                ),
              )
          })

          const imageScale = Math.min(
            logicalWidth / pdfImage.naturalWidth,
            logicalHeight / pdfImage.naturalHeight,
          )

          const imageWidth = pdfImage.naturalWidth * imageScale
          const imageHeight = pdfImage.naturalHeight * imageScale
          const imageX = (logicalWidth - imageWidth) / 2
          const imageY = (logicalHeight - imageHeight) / 2

          exportContext.drawImage(
            pdfImage,
            imageX,
            imageY,
            imageWidth,
            imageHeight,
          )
        } else if (pageItem.background === 'ruled') {
          exportContext.strokeStyle = '#dfe3e8'
          exportContext.lineWidth = 1

          for (let y = 14; y < logicalHeight; y += 14) {
            exportContext.beginPath()
            exportContext.moveTo(0, y)
            exportContext.lineTo(logicalWidth, y)
            exportContext.stroke()
          }
        } else if (pageItem.background === 'grid') {
          exportContext.strokeStyle = '#e4e7eb'
          exportContext.lineWidth = 1

          for (let x = 14; x < logicalWidth; x += 14) {
            exportContext.beginPath()
            exportContext.moveTo(x, 0)
            exportContext.lineTo(x, logicalHeight)
            exportContext.stroke()
          }

          for (let y = 14; y < logicalHeight; y += 14) {
            exportContext.beginPath()
            exportContext.moveTo(0, y)
            exportContext.lineTo(logicalWidth, y)
            exportContext.stroke()
          }
        } else if (pageItem.background === 'dotted') {
          exportContext.fillStyle = '#d8dce1'

          for (let y = 5; y < logicalHeight; y += 10) {
            for (let x = 5; x < logicalWidth; x += 10) {
              exportContext.beginPath()
              exportContext.arc(x, y, 1, 0, Math.PI * 2)
              exportContext.fill()
            }
          }
        }

        for (const element of pageItem.elements) {
          if (element.type === 'stroke') {
            drawStroke(exportContext, element)
          }

          if (element.type === 'shape') {
            drawShape(
              exportContext,
              element as StyledShapeElement,
            )
          }

          if (element.type === 'text') {
            drawText(exportContext, element)
          }

          if (element.type === 'sticky-note') drawStickyNote(exportContext, element)

          if (element.type === 'image') {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
              const loadedImage = new Image()
              loadedImage.onload = () => resolve(loadedImage)
              loadedImage.onerror = () => reject(new Error('Unable to load an image during PDF export.'))
              loadedImage.src = element.src
            })
            exportContext.save()
            exportContext.translate(element.x + element.width / 2, element.y + element.height / 2)
            exportContext.rotate((element.rotation * Math.PI) / 180)
            exportContext.scale(element.flipX ? -1 : 1, element.flipY ? -1 : 1)
            const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 }
            exportContext.drawImage(
              image,
              crop.x * image.naturalWidth,
              crop.y * image.naturalHeight,
              crop.width * image.naturalWidth,
              crop.height * image.naturalHeight,
              -element.width / 2,
              -element.height / 2,
              element.width,
              element.height,
            )
            exportContext.restore()
          }
        }

        exportContext.restore()

        return exportCanvas.toDataURL('image/png')
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      })

      const pageImages: string[] = []

      for (const pageItem of currentNotebook.pages) {
        pageImages.push(await canvasToDataUrl(pageItem))
      }

      pageImages.forEach((image, index) => {
        if (index > 0) {
          pdf.addPage('a4', 'portrait')
        }

        pdf.addImage(
          image,
          'PNG',
          0,
          0,
          210,
          297,
          undefined,
          'FAST',
        )
      })

      const safeTitle =
        currentNotebook.title
          .replace(/[\/:*?"<>|]+/g, '-')
          .trim() || 'Medico Notes'

      pdf.save(`${safeTitle}.pdf`)
    } catch (error) {
      console.error('PDF export failed:', error)

      setPdfImportError(
        error instanceof Error
          ? error.message
          : 'Unable to export the notebook as a PDF.',
      )
    }
  }

  return (
    <div
      className={`note-canvas-container ${
        activeTool === 'text'
          ? 'note-canvas-text-mode'
          : activeTool === 'laser' ? 'note-canvas-laser-mode' : ''
      }`}
    >
      <div
        className="page-action-buttons"
      >
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void importPdf(file)
            }
          }}
          style={{ display: 'none' }}
        />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importImage(file)
          }}
          style={{ display: 'none' }}
        />

        <button
          type="button"
          className="page-action-button"
          onClick={() => imageInputRef.current?.click()}
          title="Insert image"
          aria-label="Insert image"
        >
          <ImagePlus size={16} />
        </button>

        <button
          type="button"
          className="page-action-button"
          onClick={() => pdfInputRef.current?.click()}
          disabled={isImportingPdf}
          title="Import PDF"
          aria-label="Import PDF"
        >
          {isImportingPdf ? (
            <Loader2 size={16} className="freenotes-spin" />
          ) : (
            <FileUp size={16} />
          )}
        </button>

        <button
          type="button"
          className="page-action-button"
          onClick={() => {
            void exportNotebookAsPdf()
          }}
          title="Export notebook as PDF"
          aria-label="Export notebook as PDF"
        >
          <FileDown size={16} />
        </button>

        {pdfImportError && (
          <div
            role="alert"
            style={{
              maxWidth: '280px',
              padding: '8px 10px',
              border: '1px solid #e2caca',
              borderRadius: '7px',
              background: '#fff7f7',
              color: '#8a3030',
              fontSize: '12px',
              lineHeight: 1.35,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {pdfImportError}
          </div>
        )}
      </div>

      {(page as PdfPage | undefined)?.pdfBackground && (
        <img
          src={(page as PdfPage).pdfBackground}
          alt=""
          draggable={false}
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

      <canvas
        ref={canvasRef}
        className="note-canvas"
        style={{ position: 'relative', zIndex: 1 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onDoubleClick={handleDoubleClick}
      />
      <canvas
        ref={liveInkCanvasRef}
        className="note-canvas live-ink-canvas"
        aria-hidden="true"
      />

      {rulerVisible && <div
        className="ruler-overlay"
        style={{
          left: `${ruler.x / width * 100}%`,
          top: `${ruler.y / height * 100}%`,
          width: `${ruler.width / width * 100}%`,
          height: `${ruler.height / height * 100}%`,
          transform: `rotate(${ruler.rotation}deg)`,
        }}
      >
        <div className="ruler-body"><span>Medico Notes</span></div>
        <button
          type="button"
          className="ruler-grip"
          aria-label="Move ruler"
          title="Drag to move ruler"
          onPointerDown={startRulerDrag}
          onPointerMove={moveRulerDrag}
          onPointerUp={finishRulerDrag}
          onPointerCancel={finishRulerDrag}
        />
        <div className="ruler-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className="ruler-control" aria-label="Rotate ruler counterclockwise" title="Rotate counterclockwise" onClick={() => setRuler((current) => ({ ...current, rotation: current.rotation - 15 }))}>−15°</button>
          <button type="button" className="ruler-control" aria-label="Rotate ruler clockwise" title="Rotate clockwise" onClick={() => setRuler((current) => ({ ...current, rotation: current.rotation + 15 }))}>+15°</button>
          <button type="button" className="ruler-control" aria-label="Hide ruler" title="Hide ruler" onClick={() => useToolStore.getState().setRulerVisible(false)}>×</button>
        </div>
      </div>}

      {activeTool === 'laser' && laserTrail.length > 0 && <svg
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="laser-pointer-trail"
      >
        {laserTrail.length > 1 && <polyline
          points={laserTrail.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="#f04444"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.45"
          filter="url(#laser-glow)"
        />}
        <defs><filter id="laser-glow"><feGaussianBlur stdDeviation="4" /></filter></defs>
        <circle cx={laserTrail[laserTrail.length - 1].x} cy={laserTrail[laserTrail.length - 1].y} r="8" fill="#f04444" stroke="#fff" strokeWidth="2" />
      </svg>}

      {stickyEditing && (() => {
        const sticky = page?.elements.find((element): element is StickyNoteElement => element.type === 'sticky-note' && element.id === stickyEditing.id)
        if (!sticky) return null
        return <>
          <textarea
            autoFocus
            aria-label="Sticky note text"
            value={stickyEditing.text}
            onChange={(event) => setStickyEditing({ ...stickyEditing, text: event.target.value })}
            onBlur={saveStickyText}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.currentTarget.blur()
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                saveStickyText()
              }
            }}
            style={{ position: 'absolute', zIndex: 25, left: `${(sticky.x + 12) / width * 100}%`, top: `${(sticky.y + 34) / height * 100}%`, width: `${Math.max(20, sticky.width - 24) / width * 100}%`, height: `${Math.max(20, sticky.height - 46) / height * 100}%`, padding: 0, border: 'none', outline: 'none', resize: 'none', overflow: 'auto', background: 'transparent', color: '#24221b', font: '600 17px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', lineHeight: 1.35, transform: `rotate(${sticky.rotation ?? 0}deg)`, transformOrigin: 'center center' }}
          />
          <button
            type="button"
            className="sticky-edit-done"
            aria-label="Finish editing sticky note"
            title="Done editing"
            onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }}
            onClick={saveStickyText}
            style={{ position: 'absolute', zIndex: 26, left: `${(sticky.x + sticky.width - 54) / width * 100}%`, top: `${(sticky.y + 6) / height * 100}%` }}
          >Done</button>
        </>
      })()}

      {(activeTool === 'select' || activeTool === 'lasso') && selectedBounds && !imageCropDraft && !isStickyDragging && <div
        className="element-selection-outline"
        style={{ left: `${(selectedBounds.x + selectionMoveDelta.x) / width * 100}%`, top: `${(selectedBounds.y + selectionMoveDelta.y) / height * 100}%`, width: `${selectedBounds.width * (selectionScalePreview?.scaleX ?? 1) / width * 100}%`, height: `${selectedBounds.height * (selectionScalePreview?.scaleY ?? 1) / height * 100}%`, transform: `rotate(${selectionRotationPreview?.degrees ?? 0}deg)` }}
      >
        <button className="selection-rotate-handle" aria-label="Rotate selection" title="Rotate selection" onPointerDown={startSelectionRotate} onPointerMove={moveSelectionRotate} onPointerUp={finishSelectionRotate} onPointerCancel={finishSelectionRotate} />
        <button className="selection-resize-handle" aria-label="Resize selection" title="Resize selection" onPointerDown={startSelectionResize} onPointerMove={moveSelectionResize} onPointerUp={finishSelectionResize} onPointerCancel={finishSelectionResize} />
      </div>}
      {(activeTool === 'select' || activeTool === 'lasso') && selectedBounds && !imageCropDraft && !isStickyDragging && <button
        type="button"
        className="selection-delete-button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={deleteSelectedElements}
        aria-label={`Delete ${selectedElementIds.length} selected ${selectedElementIds.length === 1 ? 'item' : 'items'}`}
        title={`Delete ${selectedElementIds.length === 1 ? 'selection' : `${selectedElementIds.length} selected items`}`}
        style={{ left: `${Math.max(4, Math.min(width - 96, selectedBounds.x + selectedBounds.width - 84)) / width * 100}%`, top: `${Math.max(4, selectedBounds.y - 48) / height * 100}%` }}
      ><Trash2 size={16} /><span>Delete</span></button>}
      {(activeTool === 'select' || activeTool === 'lasso') && selectedImage && selectedBounds && !imageCropDraft && <div
        className="image-edit-toolbar"
        onPointerDown={(event) => event.stopPropagation()}
        style={{ left: `${Math.max(0, Math.min(width - 250, selectedBounds.x)) / width * 100}%`, top: `${Math.max(4, selectedBounds.y - 42) / height * 100}%` }}
      >
        <button type="button" onClick={beginImageCrop}>Crop</button>
        <button type="button" onClick={() => flipSelectedImage('horizontal')}>Flip H</button>
        <button type="button" onClick={() => flipSelectedImage('vertical')}>Flip V</button>
      </div>}
      {(activeTool === 'select' || activeTool === 'lasso') && selectedImage && imageCropDraft?.imageId === selectedImage.id && (() => {
        const crop = imageCropDraft.crop
        const imageStyle: CSSProperties = {
          position: 'absolute', zIndex: 22, left: `${selectedImage.x / width * 100}%`, top: `${selectedImage.y / height * 100}%`,
          width: `${selectedImage.width / width * 100}%`, height: `${selectedImage.height / height * 100}%`,
          transform: `rotate(${selectedImage.rotation}deg)`, transformOrigin: 'center center', pointerEvents: 'none',
        }
        const handleProps = (edges: ImageCropEdge[]) => ({
          onPointerDown: (event: PointerEvent<HTMLButtonElement>) => startImageCropDrag(event, edges),
          onPointerMove: moveImageCropDrag,
          onPointerUp: finishImageCropDrag,
          onPointerCancel: finishImageCropDrag,
        })
        return <div className="image-crop-overlay" style={imageStyle}>
          <div className="image-crop-dim" style={{ left: 0, top: 0, width: '100%', height: `${crop.y * 100}%` }} />
          <div className="image-crop-dim" style={{ left: 0, top: `${(crop.y + crop.height) * 100}%`, width: '100%', height: `${(1 - crop.y - crop.height) * 100}%` }} />
          <div className="image-crop-dim" style={{ left: 0, top: `${crop.y * 100}%`, width: `${crop.x * 100}%`, height: `${crop.height * 100}%` }} />
          <div className="image-crop-dim" style={{ left: `${(crop.x + crop.width) * 100}%`, top: `${crop.y * 100}%`, width: `${(1 - crop.x - crop.width) * 100}%`, height: `${crop.height * 100}%` }} />
          <div className="image-crop-frame" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}>
            <button type="button" aria-label="Resize crop from top left" className="image-crop-handle crop-handle-top-left" {...handleProps(['left', 'top'])} />
            <button type="button" aria-label="Resize crop from top" className="image-crop-handle crop-handle-top" {...handleProps(['top'])} />
            <button type="button" aria-label="Resize crop from top right" className="image-crop-handle crop-handle-top-right" {...handleProps(['right', 'top'])} />
            <button type="button" aria-label="Resize crop from right" className="image-crop-handle crop-handle-right" {...handleProps(['right'])} />
            <button type="button" aria-label="Resize crop from bottom right" className="image-crop-handle crop-handle-bottom-right" {...handleProps(['right', 'bottom'])} />
            <button type="button" aria-label="Resize crop from bottom" className="image-crop-handle crop-handle-bottom" {...handleProps(['bottom'])} />
            <button type="button" aria-label="Resize crop from bottom left" className="image-crop-handle crop-handle-bottom-left" {...handleProps(['left', 'bottom'])} />
            <button type="button" aria-label="Resize crop from left" className="image-crop-handle crop-handle-left" {...handleProps(['left'])} />
          </div>
          <div className="image-crop-actions" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setImageCropDraft(null)}>Cancel</button>
            <button type="button" onClick={saveImageCrop}>Apply</button>
          </div>
        </div>
      })()}
      {(activeTool === 'select' || activeTool === 'lasso') && selectedElements.some((element) => element.type === 'sticky-note') && !stickyEditing && !isStickyDragging && <div className="sticky-note-hint">
        Double-click the sticky note to edit · Enter adds a line · Done saves
      </div>}
      {activeTool === 'select' && selectionPreview?.kind === 'marquee' && <div
        className="selection-marquee"
        style={{ left: `${selectionPreview.x / width * 100}%`, top: `${selectionPreview.y / height * 100}%`, width: `${selectionPreview.width / width * 100}%`, height: `${selectionPreview.height / height * 100}%` }}
      />}
      {activeTool === 'lasso' && lassoPreview.length > 1 && <svg
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 20 }}
      >
        <polyline
          points={lassoPreview.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="rgba(75, 115, 220, 0.08)"
          stroke="#4b73dc"
          strokeWidth="2"
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>}

      {selectedShapeIds.length > 1 &&
        !isDraggingShape &&
        !shapePreview &&
        selectedShapeIds.map((shapeId) => {
          const selectedShape = page?.elements.find(
            (element): element is ShapeElement =>
              element.type === 'shape' &&
              element.id === shapeId,
          )

          if (!selectedShape) {
            return null
          }

          return (
            <div
              key={`multi-selection-${shapeId}`}
              style={{
                position: 'absolute',
                left: `${(selectedShape.x / width) * 100}%`,
                top: `${(selectedShape.y / height) * 100}%`,
                width: `${(selectedShape.width / width) * 100}%`,
                height: `${(selectedShape.height / height) * 100}%`,
                border: '1px dashed #55555c',
                pointerEvents: 'none',
                boxSizing: 'border-box',
                transform: `rotate(${selectedShape.rotation ?? 0}deg)`,
                transformOrigin: 'center center',
              }}
            />
          )
        })}

      {selectedShapeId &&
        selectedShapeIds.length <= 1 &&
        !isDraggingShape &&
        !shapePreview &&
        (() => {
          const selectedShape = page?.elements.find(
            (element): element is ShapeElement =>
              element.type === 'shape' &&
              element.id === selectedShapeId,
          ) as StyledShapeElement | undefined

          if (!selectedShape) {
            return null
          }

          return (
            <div
              className="shape-selection-box"
              style={{
                position: 'absolute',
                left: `${
                  ((shapeResizePreview?.shapeId === selectedShape.id
                    ? shapeResizePreview.x
                    : selectedShape.x) / width) * 100
                }%`,
                top: `${
                  ((shapeResizePreview?.shapeId === selectedShape.id
                    ? shapeResizePreview.y
                    : selectedShape.y) / height) * 100
                }%`,
                width: `${
                  ((shapeResizePreview?.shapeId === selectedShape.id
                    ? shapeResizePreview.width
                    : selectedShape.width) / width) * 100
                }%`,
                height: `${
                  ((shapeResizePreview?.shapeId === selectedShape.id
                    ? shapeResizePreview.height
                    : selectedShape.height) / height) * 100
                }%`,
                border: '1px dashed #55555c',
                pointerEvents: 'none',
                boxSizing: 'border-box',
                transform: `rotate(${
                  shapeRotationPreview?.shapeId === selectedShape.id
                    ? shapeRotationPreview.rotation
                    : selectedShape.rotation ?? 0
                }deg)`,
                transformOrigin: 'center center',
              }}
            >
              <div
                className="shape-style-toolbar"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 'calc(100% + 14px)',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  border: '1px solid #d8d8de',
                  borderRadius: '10px',
                  background: '#ffffff',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  pointerEvents: 'auto',
                  whiteSpace: 'nowrap',
                  zIndex: 20,
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  title="Stroke color"
                >
                  <span>Stroke</span>
                  <input
                    type="color"
                    value={selectedShape.strokeColor}
                    onChange={(event) =>
                      updateShapeStyle(pageId, selectedShape.id, {
                        strokeColor: event.target.value,
                      })
                    }
                    style={{ width: '28px', height: '24px', padding: 0, border: 0 }}
                  />
                </label>

                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  title="Fill color"
                >
                  <span>Fill</span>
                  <input
                    type="color"
                    value={selectedShape.fillColor === 'transparent' ? '#ffffff' : selectedShape.fillColor}
                    onChange={(event) =>
                      updateShapeStyle(pageId, selectedShape.id, {
                        fillColor: event.target.value,
                      })
                    }
                    style={{ width: '28px', height: '24px', padding: 0, border: 0 }}
                  />
                </label>

                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  title="Transparent fill"
                >
                  <input
                    type="checkbox"
                    checked={selectedShape.fillColor === 'transparent'}
                    onChange={(event) =>
                      updateShapeStyle(pageId, selectedShape.id, {
                        fillColor: event.target.checked ? 'transparent' : '#ffffff',
                      })
                    }
                  />
                  None
                </label>

                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  title="Stroke width"
                >
                  <span>Width</span>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={selectedShape.strokeWidth}
                    onChange={(event) =>
                      updateShapeStyle(pageId, selectedShape.id, {
                        strokeWidth: Number(event.target.value),
                      })
                    }
                  />
                  <span style={{ minWidth: '18px', textAlign: 'right' }}>
                    {selectedShape.strokeWidth}
                  </span>
                </label>

                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                  title="Line style"
                >
                  <span>Line</span>
                  <select
                    value={selectedShape.lineStyle ?? 'solid'}
                    onChange={(event) =>
                      updateShapeStyle(pageId, selectedShape.id, {
                        lineStyle: event.target.value as ShapeLineStyle,
                      })
                    }
                    aria-label="Shape line style"
                    style={{
                      height: '28px',
                      padding: '2px 6px',
                      border: '1px solid #dedee2',
                      borderRadius: '5px',
                      background: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    duplicateSelectedShape(pageId, selectedShape.id)
                  }
                  style={{
                    height: '28px',
                    padding: '0 9px',
                    border: '1px solid #dedee2',
                    borderRadius: '5px',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                  title="Duplicate shape"
                >
                  Duplicate
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeShapeLayer(pageId, selectedShape.id, 'back')
                  }
                  style={{
                    height: '28px',
                    padding: '0 9px',
                    border: '1px solid #dedee2',
                    borderRadius: '5px',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                  title="Send to back"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeShapeLayer(pageId, selectedShape.id, 'backward')
                  }
                  style={{
                    height: '28px',
                    padding: '0 9px',
                    border: '1px solid #dedee2',
                    borderRadius: '5px',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                  title="Send backward"
                >
                  Backward
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeShapeLayer(pageId, selectedShape.id, 'forward')
                  }
                  style={{
                    height: '28px',
                    padding: '0 9px',
                    border: '1px solid #dedee2',
                    borderRadius: '5px',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                  title="Bring forward"
                >
                  Forward
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeShapeLayer(pageId, selectedShape.id, 'front')
                  }
                  style={{
                    height: '28px',
                    padding: '0 9px',
                    border: '1px solid #dedee2',
                    borderRadius: '5px',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                  title="Bring to front"
                >
                  Front
                </button>


                <div
                  style={{
                    width: '1px',
                    height: '24px',
                    background: '#e2e2e6',
                    margin: '0 2px',
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    alignSelectedShape(pageId, selectedShape.id, 'left')
                  }
                  title="Align left"
                  style={shapeAlignmentButtonStyle}
                >
                  ←|
                </button>

                <button
                  type="button"
                  onClick={() =>
                    alignSelectedShape(pageId, selectedShape.id, 'center-horizontal')
                  }
                  title="Align horizontal center"
                  style={shapeAlignmentButtonStyle}
                >
                  ↔|
                </button>

                <button
                  type="button"
                  onClick={() =>
                    alignSelectedShape(pageId, selectedShape.id, 'right')
                  }
                  title="Align right"
                  style={shapeAlignmentButtonStyle}
                >
                  |→
                </button>

                <button
                  type="button"
                  onClick={() =>
                    alignSelectedShape(pageId, selectedShape.id, 'top')
                  }
                  title="Align top"
                  style={shapeAlignmentButtonStyle}
                >
                  ↑—
                </button>

                <button
                  type="button"
                  onClick={() =>
                    alignSelectedShape(pageId, selectedShape.id, 'center-vertical')
                  }
                  title="Align vertical center"
                  style={shapeAlignmentButtonStyle}
                >
                  ↕—
                </button>

                <button
                  type="button"
                  onClick={() =>
                    alignSelectedShape(pageId, selectedShape.id, 'bottom')
                  }
                  title="Align bottom"
                  style={shapeAlignmentButtonStyle}
                >
                  —↓
                </button>
              </div>

              <>
                {resizeHandles.map((handle) => (
                  <div
                    key={handle}
                    className="canvas-resize-handle"
                    onPointerDown={(event) =>
                      startShapeResize(event, selectedShape, handle)
                    }
                    onPointerMove={(event) => {
                      if (
                        shapeResizeRef.current &&
                        shapeResizeRef.current.shapeId === selectedShape.id
                      ) {
                        handleShapeResizeMove(event)
                      }
                    }}
                    onPointerUp={(event) => {
                      if (
                        shapeResizeRef.current &&
                        shapeResizeRef.current.shapeId === selectedShape.id
                      ) {
                        commitShapeResize()
                      }

                      if (
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      ) {
                        event.currentTarget.releasePointerCapture(event.pointerId)
                      }
                    }}
                    onPointerCancel={cancelShapeResize}
                    style={{
                      position: 'absolute',
                      pointerEvents: 'auto',
                      boxSizing: 'border-box',
                      ...resizeHandleStyles[handle],
                    }}
                  />
                ))}
              </>

              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '-32px',
                  width: '12px',
                  height: '12px',
                  transform: 'translateX(-50%)',
                  border: '1px solid #55555c',
                  borderRadius: '50%',
                  background: '#ffffff',
                  pointerEvents: 'auto',
                  cursor: 'grab',
                  boxSizing: 'border-box',
                }}
                onPointerDown={(event) =>
                  startShapeRotation(event, selectedShape)
                }
                onPointerMove={handleShapeRotationMove}
                onPointerUp={finishShapeRotation}
                onPointerCancel={cancelShapeRotation}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '-21px',
                    width: '1px',
                    height: '20px',
                    transform: 'translateX(-50%)',
                    background: '#55555c',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          )
        })()}

      {selectedText &&
        selectedText.type === 'text' &&
        !editingTextId &&
        !isDraggingText && (
          <div
            className="text-selection-box"
            style={{
              left: `${
                ((resizePreview?.textId ===
                  selectedText.id
                  ? resizePreview.x
                  : selectedText.x) /
                  width) *
                100
              }%`,
              top: `${
                ((resizePreview?.textId ===
                  selectedText.id
                  ? resizePreview.y
                  : selectedText.y) /
                  height) *
                100
              }%`,
              width: `${
                ((resizePreview?.textId ===
                  selectedText.id
                  ? resizePreview.width
                  : selectedText.width) /
                  width) *
                100
              }%`,
              height: `${
                ((resizePreview?.textId ===
                  selectedText.id
                  ? resizePreview.height
                  : selectedText.height) /
                  height) *
                100
              }%`,
              pointerEvents: 'none',
            }}
          >
            {resizeHandles.map((handle) => (
              <div
                key={handle}
                className="canvas-resize-handle"
                onPointerDown={(event) =>
                  startTextResize(
                    event,
                    selectedText,
                    handle,
                  )
                }
                onPointerMove={(event) => {
                  if (
                    textResizeRef.current &&
                    textResizeRef.current
                      .textId === selectedText.id
                  ) {
                    handleTextResizeMove(event)
                  }
                }}
                onPointerUp={(event) => {
                  if (
                    textResizeRef.current &&
                    textResizeRef.current
                      .textId === selectedText.id
                  ) {
                    commitTextResize()

                    if (
                      event.currentTarget.hasPointerCapture(
                        event.pointerId,
                      )
                    ) {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      )
                    }
                  }
                }}
                onPointerCancel={() => {
                  textResizeRef.current = null
                  setResizePreview(null)
                }}
                style={{
                  position: 'absolute',
                  pointerEvents: 'auto',
                  boxSizing: 'border-box',
                  ...resizeHandleStyles[handle],
                }}
              />
            ))}
          </div>
        )}

      {textPosition && (
        <>
          <div
            className="text-format-toolbar"
            role="toolbar"
            aria-label="Text formatting"
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              left: `${Math.max(8, Math.min(width - 8, textPosition.x)) / width * 100}%`,
              top: `${Math.max(8, textPosition.y > 64 ? textPosition.y - 8 : textPosition.y + 54) / height * 100}%`,
              transform: `translate(${textPosition.x > width / 2 ? '-100%' : '0'}, ${textPosition.y > 64 ? '-100%' : '0'})`,
            }}
          >
            <div className="text-format-group">
              <select
                className="text-format-size"
                value={textFontSize}
                onChange={(event) => setTextFontSize(Number(event.target.value))}
                aria-label="Text font size"
                title="Font size"
              >
                {TEXT_FONT_SIZES.map((fontSize) => (
                  <option key={fontSize} value={fontSize}>{fontSize} pt</option>
                ))}
              </select>
            </div>

            <span className="text-format-divider" aria-hidden="true" />

            <div className="text-format-group" aria-label="Text style">
              <button type="button" className={`text-format-button${textBold ? ' is-active' : ''}`} onClick={() => setTextBold((value) => !value)} aria-label="Bold" aria-pressed={textBold} title="Bold">
                <Bold size={16} />
              </button>
              <button type="button" className={`text-format-button${textItalic ? ' is-active' : ''}`} onClick={() => setTextItalic((value) => !value)} aria-label="Italic" aria-pressed={textItalic} title="Italic">
                <Italic size={16} />
              </button>
              <button type="button" className={`text-format-button${textUnderline ? ' is-active' : ''}`} onClick={() => setTextUnderline((value) => !value)} aria-label="Underline" aria-pressed={textUnderline} title="Underline">
                <Underline size={16} />
              </button>
            </div>

            <span className="text-format-divider" aria-hidden="true" />

            <div className="text-format-group" aria-label="Text alignment">
              <button type="button" className={`text-format-button${textAlignment === 'left' ? ' is-active' : ''}`} onClick={() => setTextAlignment('left')} aria-label="Align left" aria-pressed={textAlignment === 'left'} title="Align left">
                <AlignLeft size={16} />
              </button>
              <button type="button" className={`text-format-button${textAlignment === 'center' ? ' is-active' : ''}`} onClick={() => setTextAlignment('center')} aria-label="Align center" aria-pressed={textAlignment === 'center'} title="Align center">
                <AlignCenter size={16} />
              </button>
              <button type="button" className={`text-format-button${textAlignment === 'right' ? ' is-active' : ''}`} onClick={() => setTextAlignment('right')} aria-label="Align right" aria-pressed={textAlignment === 'right'} title="Align right">
                <AlignRight size={16} />
              </button>
            </div>

            <span className="text-format-divider" aria-hidden="true" />

            <input
              className="text-format-color"
              type="color"
              value={color}
              onChange={(event) =>
                useToolStore
                  .getState()
                  .setColor(event.target.value)
              }
              aria-label="Text color"
              title="Text color"
            />

            <span className="text-format-divider" aria-hidden="true" />

            <div className="text-format-actions">
              <button type="button" className="text-format-cancel" onClick={cancelTextEditing} aria-label="Cancel text" title="Cancel">
                <X size={16} />
              </button>
              <button type="button" className="text-format-done" onClick={saveText} title="Finish editing">
                <Check size={15} />
                <span>Done</span>
              </button>
            </div>
          </div>

          <textarea
            ref={textInputRef}
            value={textValue}
            onChange={(event) =>
              setTextValue(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Escape'
              ) {
                event.preventDefault()
                cancelTextEditing()
              }

              if (
                (event.metaKey ||
                  event.ctrlKey) &&
                event.key === 'Enter'
              ) {
                event.preventDefault()
                saveText()
              }
            }}
            placeholder="Type here..."
            style={{
              position: 'absolute',
              zIndex: 100,
              left: `${
                (textPosition.x / width) * 100
              }%`,
              top: `${
                (textPosition.y / height) * 100
              }%`,
              width: `${textBoxWidth}px`,
              minHeight: '40px',
              maxWidth: `calc(100% - ${
                (textPosition.x / width) * 100
              }%)`,
              padding: '4px',
              border: '1px solid #55555c',
              borderRadius: '4px',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              background: '#ffffff',
              color,
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: `${textFontSize}px`,
              fontWeight: textBold
                ? 700
                : 400,
              fontStyle: textItalic
                ? 'italic'
                : 'normal',
              textDecoration: textUnderline
                ? 'underline'
                : 'none',
              textAlign: textAlignment,
              lineHeight: 1.25,
            }}
          />
        </>
      )}
    </div>
  )
}

export default NoteCanvas
