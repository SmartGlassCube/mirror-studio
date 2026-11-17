import { Component, useEffect, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'
import { BUILTIN_TYPES } from '../model/catalog'
import type { CustomWidgetType, WidgetInstance, XY } from '../model/project'
import { dataFor, useLiveData } from '../runtime/dataSources'
import { textView, type TextNav } from '../runtime/textWidget'
import { componentFor } from './customWidgets'
import DragHandle from './DragHandle'
import type { MirrorWidget } from './types/mirror'
import type { WidgetComponent } from './widgets/defineWidget'
import { widgetRegistry } from './widgets/registry'
import './mirror-screen.css'

// What the running mirror changed about a widget (test mode): position, drag state, text item, data.
export type WidgetRuntime = { position?: XY; dragging?: boolean; nav?: TextNav; data?: unknown }

type Props = {
  widgets: WidgetInstance[]
  widgetTypes: CustomWidgetType[]
  screen: { width: number; height: number }
  runtime?: Record<string, WidgetRuntime>
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onMove?: (id: string, position: XY) => void // design mode: drag widgets around
  onDropWidget?: (type: string, position: XY) => void
  children?: ReactNode // overlays: hand cursor, gesture toasts
  className?: string
}

export function toMirrorWidget(widget: WidgetInstance, runtime?: WidgetRuntime): MirrorWidget {
  const base = {
    id: widget.id,
    type: widget.type,
    position: runtime?.position ?? widget.position,
    content: widget.content as string | null,
    data: runtime?.data !== undefined ? runtime.data : dataFor(widget.data).value,
    metadata: widget.props,
    draggable: widget.draggable,
    dragging: Boolean(runtime?.dragging),
  }
  if (widget.type === 'text') {
    const view = textView(widget.content, runtime?.nav)
    return { ...base, content: view.content, metadata: { ...widget.props, ...view.metadata } }
  }
  return base
}

export function resolveComponent(type: string, widgetTypes: CustomWidgetType[]): { component: WidgetComponent | null; error: string | null } {
  if (BUILTIN_TYPES.includes(type)) return { component: widgetRegistry[type] ?? null, error: null }
  const custom = widgetTypes.find((t) => t.type === type)
  if (!custom) return { component: null, error: `Unknown widget type "${type}"` }
  return componentFor(custom.source)
}

class WidgetBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[widget]', error, info.componentStack)
  }
  render() {
    return this.state.error ? <WidgetError message={this.state.error} /> : this.props.children
  }
}

const WidgetError = ({ message }: { message: string }) => (
  <div className="widget widget-error">
    <h2>Widget error</h2>
    <div>{message}</div>
  </div>
)

// The largest box of the screen's aspect ratio that fits in the element.
function useFit(screen: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => {
      const { width, height } = element.getBoundingClientRect()
      const scale = Math.min(width / screen.width, height / screen.height)
      setSize({ width: Math.floor(screen.width * scale), height: Math.floor(screen.height * scale) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [screen.width, screen.height])
  return { ref, size }
}

export default function MirrorScreen({ widgets, widgetTypes, screen, runtime, selectedId, onSelect, onMove, onDropWidget, children, className }: Props) {
  useLiveData(widgets)
  const pageRef = useRef<HTMLDivElement>(null)
  const fit = useFit(screen)

  const toScreen = (clientX: number, clientY: number): XY => {
    const rect = pageRef.current!.getBoundingClientRect()
    const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000
    return { x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) }
  }

  const startDrag = (event: React.PointerEvent, widget: WidgetInstance) => {
    onSelect?.(widget.id)
    if (!onMove) return
    event.preventDefault()
    const start = toScreen(event.clientX, event.clientY)
    const origin = widget.position
    const move = (e: PointerEvent) => {
      const now = toScreen(e.clientX, e.clientY)
      const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000
      onMove(widget.id, { x: clamp(origin.x + now.x - start.x), y: clamp(origin.y + now.y - start.y) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className={`mirror-fit ${className ?? ''}`} ref={fit.ref}>
    <div className="mirror-frame" style={{ width: fit.size.width, height: fit.size.height }}>
      <div className="mirror-screen">
        <div
          className="mirror-page"
          ref={pageRef}
          onPointerDown={(e) => e.target === e.currentTarget && onSelect?.(null)}
          onDragOver={(e) => onDropWidget && e.dataTransfer.types.includes('application/x-mirror-widget') && e.preventDefault()}
          onDrop={(e) => {
            const type = e.dataTransfer.getData('application/x-mirror-widget')
            if (type && onDropWidget) {
              e.preventDefault()
              onDropWidget(type, toScreen(e.clientX, e.clientY))
            }
          }}
        >
          {widgets.map((widget) => {
            const mirrorWidget = toMirrorWidget(widget, runtime?.[widget.id])
            const { component: Widget, error } = resolveComponent(widget.type, widgetTypes)
            const source = widgetTypes.find((t) => t.type === widget.type)?.source ?? ''
            const style = { '--x': mirrorWidget.position?.x ?? 0.5, '--y': mirrorWidget.position?.y ?? 0.5 } as CSSProperties
            return (
              <div
                key={widget.id}
                className={`widget-slot${mirrorWidget.dragging ? ' widget-slot--dragging' : ''}${selectedId === widget.id ? ' widget-slot--selected' : ''}${onMove ? ' widget-slot--design' : ''}`}
                style={style}
                onPointerDown={onSelect ? (e) => startDrag(e, widget) : undefined}
              >
                {widget.draggable ? <DragHandle lit={Boolean(mirrorWidget.dragging)} /> : null}
                <WidgetBoundary resetKey={source}>
                  {Widget ? <Widget widget={mirrorWidget} /> : <WidgetError message={error ?? 'Not found'} />}
                </WidgetBoundary>
              </div>
            )
          })}
          {children}
        </div>
      </div>
    </div>
    </div>
  )
}
