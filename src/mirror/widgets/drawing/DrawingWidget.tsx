import { useEffect, useRef } from 'react'
import { onPointer } from '../../services/pointer'
import type { PointerPosition } from '../../types/mirror'
import type { WidgetProps } from '../defineWidget'
import './drawing.css'

// Backend DrawingWidget: the brush (`size` in canvas pixels) and a counter bumped on every clear.
type DrawingData = { color?: string; size?: number; clears?: number }
type Point = { x: number; y: number }

// Share of the remaining distance the pen covers per animation frame, like HandCursor's.
const SMOOTHING = 0.35
// Tracking drops a frame now and then: a stroke survives losing the hand for this long.
const LOST_HAND_GRACE_MS = 300
const DEFAULT_COLOR = '#d5d5d5'

// PageView remounts its widgets on every page change; this keeps a drawing for when you come back.
const savedDrawings = new Map<string, { clears: number; image: ImageData }>()

const DrawingWidget = ({ widget }: WidgetProps<DrawingData>) => {
  const color = widget.data?.color ?? DEFAULT_COLOR
  const size = widget.data?.size ?? 1
  const clears = widget.data?.clears ?? 0

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const brush = useRef({ color, size })
  const appliedClears = useRef(clears)

  useEffect(() => {
    brush.current = { color, size }
  }, [color, size])

  useEffect(() => {
    if (clears === appliedClears.current) {
      return
    }
    appliedClears.current = clears
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }, [clears])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      return
    }
    // One canvas pixel per grid pixel of the UI (--px, handed over as the canvas's column-gap in
    // drawing.css), scaled up with crisp edges: strokes look like the rest of the 8-bit UI.
    const gridPixel = parseFloat(getComputedStyle(canvas).columnGap) || 4
    const cols = Math.max(1, Math.round(canvas.clientWidth / gridPixel))
    const rows = Math.max(1, Math.round(canvas.clientHeight / gridPixel))
    canvas.width = cols
    canvas.height = rows
    const saved = savedDrawings.get(widget.id)
    if (saved && saved.clears === appliedClears.current && saved.image.width === cols && saved.image.height === rows) {
      ctx.putImageData(saved.image, 0, 0)
    }

    const pen = { target: null as Point | null, current: null as Point | null, down: false, frame: 0, lostTimer: 0 }

    // Pointer positions are fractions of the whole mirror; the canvas is only part of it.
    const toCanvas = (position: PointerPosition): Point => {
      const mirror = (canvas.closest('.mirror-canvas') ?? document.documentElement).getBoundingClientRect()
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((mirror.left + position.x * mirror.width - rect.left) * cols) / rect.width,
        y: ((mirror.top + position.y * mirror.height - rect.top) * rows) / rect.height,
      }
    }

    const stamp = ({ x, y }: Point) => {
      const { color: fill, size: side } = brush.current
      ctx.fillStyle = fill
      ctx.fillRect(Math.round(x - side / 2), Math.round(y - side / 2), side, side)
    }

    // One stamp per canvas pixel along the way, so fast strokes stay continuous.
    const line = (from: Point, to: Point) => {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))))
      for (let i = 1; i <= steps; i++) {
        stamp({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps })
      }
    }

    const step = () => {
      pen.frame = 0
      const { target, current } = pen
      if (!target || !current) {
        return
      }
      const dx = target.x - current.x
      const dy = target.y - current.y
      const settled = Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05
      const next = settled ? target : { x: current.x + dx * SMOOTHING, y: current.y + dy * SMOOTHING }
      if (pen.down) {
        line(current, next)
      }
      pen.current = next
      if (!settled) {
        pen.frame = requestAnimationFrame(step)
      }
    }

    const unsubscribe = onPointer(({ position, pinching }) => {
      if (position === null) {
        pen.target = null
        if (!pen.lostTimer) {
          pen.lostTimer = window.setTimeout(() => {
            pen.lostTimer = 0
            pen.down = false
            pen.current = null
          }, LOST_HAND_GRACE_MS)
        }
        return
      }
      window.clearTimeout(pen.lostTimer)
      pen.lostTimer = 0

      const point = toCanvas(position)
      if (pinching && !(pen.down && pen.current)) {
        // Pen down: the stroke starts right under the fingers, not where the smoothing lagged.
        pen.current = point
        stamp(point)
      } else if (!pinching && pen.down && pen.current && pen.target) {
        // Pen up: finish the stroke where the pinch was. `point` is the index tip again, off to the side.
        line(pen.current, pen.target)
        pen.current = point
      }
      pen.current ??= point
      pen.down = pinching
      pen.target = point
      if (!pen.frame) {
        pen.frame = requestAnimationFrame(step)
      }
    })

    return () => {
      unsubscribe()
      cancelAnimationFrame(pen.frame)
      window.clearTimeout(pen.lostTimer)
      savedDrawings.set(widget.id, { clears: appliedClears.current, image: ctx.getImageData(0, 0, cols, rows) })
    }
  }, [widget.id])

  return (
    <div className="widget drawing-widget">
      <h2>
        Draw
        <span className="drawing-hint">
          <span className="drawing-swatch" style={{ background: color }}>
            {size}
          </span>
          <span>pinch: draw</span>
          <span>fold index: colour</span>
          <span>open hand right / left: size</span>
          <span>swipe up: clear</span>
        </span>
      </h2>
      <canvas ref={canvasRef} className="drawing-canvas" />
    </div>
  )
}

export default DrawingWidget
