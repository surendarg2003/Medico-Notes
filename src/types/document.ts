export type ElementType =
  | 'stroke'
  | 'text'
  | 'shape'
  | 'image'
  | 'sticky-note'

export interface Point {
  x: number
  y: number
  pressure?: number
  timestamp?: number
}

export type ShapeLineStyle =
  | 'solid'
  | 'dashed'
  | 'dotted'

export interface StrokeElement {
  id: string
  groupId?: string
  type: 'stroke'
  points: Point[]
  color: string
  width: number
  opacity: number
  tool: 'pen' | 'pencil' | 'highlighter'
}

export interface TextElement {
  id: string
  groupId?: string
  type: 'text'
  x: number
  y: number
  width: number
  height: number
  text: string
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  alignment: 'left' | 'center' | 'right'
  rotation?: number
}

export interface ShapeElement {
  id: string
  groupId?: string
  type: 'shape'
  shape: 'rectangle' | 'circle' | 'triangle'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  strokeColor: string
  fillColor: string
  strokeWidth: number
  lineStyle?: ShapeLineStyle
}

export interface ImageElement {
  id: string
  groupId?: string
  type: 'image'
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  crop?: { x: number; y: number; width: number; height: number }
  flipX?: boolean
  flipY?: boolean
}

export interface StickyNoteElement {
  id: string
  groupId?: string
  type: 'sticky-note'
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
  rotation?: number
}

export type NoteElement =
  | StrokeElement
  | TextElement
  | ShapeElement
  | ImageElement
  | StickyNoteElement

export interface Page {
  id: string
  title: string
  elements: NoteElement[]
  background: 'plain' | 'ruled' | 'grid' | 'dotted'
}

export interface Notebook {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  pages: Page[]
}
