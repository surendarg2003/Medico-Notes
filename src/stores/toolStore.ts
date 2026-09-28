import { create } from 'zustand'

export type DrawingTool =
  | 'pen'
  | 'pencil'
  | 'highlighter'
  | 'eraser'
  | 'text'
  | 'shape'
  | 'select'
  | 'lasso'
  | 'laser'
  | 'sticky-note'

export type ShapeType =
  | 'rectangle'
  | 'circle'
  | 'triangle'

interface ToolState {
  activeTool: DrawingTool
  shapeType: ShapeType
  color: string
  width: number
  opacity: number
  eraserSize: number
  autoShapeRecognition: boolean
  rulerVisible: boolean
  setActiveTool: (tool: DrawingTool) => void
  setShapeType: (shape: ShapeType) => void
  setColor: (color: string) => void
  setWidth: (width: number) => void
  setOpacity: (opacity: number) => void
  setEraserSize: (size: number) => void
  setAutoShapeRecognition: (enabled: boolean) => void
  setRulerVisible: (visible: boolean) => void
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: 'pen',
  shapeType: 'rectangle',
  color: '#222225',
  width: 2,
  opacity: 1,
  eraserSize: 18,
  autoShapeRecognition: true,
  rulerVisible: false,

  setActiveTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      // The laser pointer and ruler are separate overlays. They must not
      // remain active together when switching between these controls.
      rulerVisible: tool === 'laser' ? false : state.rulerVisible,
    })),

  setShapeType: (shape) =>
    set({
      shapeType: shape,
    }),

  setColor: (color) =>
    set({
      color,
    }),

  setWidth: (width) =>
    set({
      width,
    }),

  setOpacity: (opacity) =>
    set({
      opacity,
    }),

  setEraserSize: (size) =>
    set({
      eraserSize: size,
    }),

  setAutoShapeRecognition: (enabled) => set({ autoShapeRecognition: enabled }),
  setRulerVisible: (visible) =>
    set((state) => ({
      rulerVisible: visible,
      activeTool:
        visible && state.activeTool === 'laser'
          ? 'pen'
          : state.activeTool,
    })),
}))
