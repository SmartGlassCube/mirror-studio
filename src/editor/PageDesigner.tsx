import { ArrowLeft, ArrowRight, Code2, Plus, Zap } from 'lucide-react'
import { useEffect } from 'react'
import MirrorScreen from '../mirror/MirrorScreen'
import { BUILTIN_WIDGETS } from '../model/catalog'
import { gestureInfo } from '../model/gestures'
import { useStudio } from '../store'
import { DRAG_WIDGET } from './FlowCanvas'
import { WidgetIcon } from './icons'

// The widgets you can add, as a column: click to add, or drag onto the screen.
function WidgetShelf({ pageId }: { pageId: string }) {
  const project = useStudio((s) => s.project)
  const { addWidget, openWidgetEditor } = useStudio.getState()
  const count = project.pages.find((p) => p.id === pageId)?.widgets.length ?? 0
  const add = (type: string) => addWidget(pageId, type, { x: 0.5, y: Math.min(0.85, 0.2 + count * 0.15) })
  const item = (type: string, name: string, description: string, custom = false) => (
    <button
      key={type}
      className="shelf-item"
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_WIDGET, type)}
      onClick={() => add(type)}
      title={`${description}\nClick to add, or drag onto the screen`}
    >
      <WidgetIcon type={type} custom={custom ? project.widgetTypes.find((t) => t.type === type) : undefined} size={15} />
      <span>{name}</span>
      <Plus size={14} className="shelf-plus" />
    </button>
  )
  return (
    <aside className="shelf">
      <div className="shelf-title">Widgets</div>
      {BUILTIN_WIDGETS.map((w) => item(w.type, w.name, w.description))}
      <div className="shelf-title">
        My widgets
        <button className="link-btn" onClick={() => openWidgetEditor('new')}>
          <Plus size={13} /> New
        </button>
      </div>
      {project.widgetTypes.map((t) => (
        <div key={t.type} className="shelf-row">
          {item(t.type, t.name, t.description || t.type, true)}
          <button className="icon-btn icon-btn--small" title={`Edit the code of ${t.name}`} onClick={() => openWidgetEditor(t.type)}>
            <Code2 size={14} />
          </button>
        </div>
      ))}
      {project.widgetTypes.length === 0 ? <p className="hint">Write your own, start from a template, or ask the AI.</p> : null}
    </aside>
  )
}

export default function PageDesigner({ pageId }: { pageId: string }) {
  const project = useStudio((s) => s.project)
  const selection = useStudio((s) => s.selection)
  const { updateWidget, addWidget, select, openDesigner, removeWidget, duplicateWidget } = useStudio.getState()
  const page = project.pages.find((p) => p.id === pageId)
  const selectedId = selection?.kind === 'widget' && selection.pageId === pageId ? selection.id : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, .cm-editor, .modal')) return
      if (e.key === 'Escape') openDesigner(null)
      if (!selectedId || !page) return
      const widget = page.widgets.find((w) => w.id === selectedId)
      if (!widget) return
      if (e.key === 'Delete' || e.key === 'Backspace') removeWidget(pageId, selectedId)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        duplicateWidget(pageId, selectedId)
      }
      const step = e.shiftKey ? 0.05 : 0.01
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      const move = moves[e.key]
      if (move) {
        e.preventDefault()
        const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000
        updateWidget(pageId, selectedId, { position: { x: clamp(widget.position.x + move[0]), y: clamp(widget.position.y + move[1]) } }, `pos:${selectedId}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, pageId, selectedId, openDesigner, removeWidget, duplicateWidget, updateWidget])

  if (!page) return null
  const name = (id: string) => project.pages.find((p) => p.id === id)?.name ?? id
  const incoming = project.edges.filter((e) => e.to === pageId)
  const outgoing = project.edges.filter((e) => e.from === pageId)
  const isStart = project.settings.initialPage === pageId

  return (
    <div className="designer">
      <div className="designer-bar">
        <button className="btn btn--ghost" onClick={() => openDesigner(null)} title="Back to the canvas (Esc)">
          <ArrowLeft size={16} /> Canvas
        </button>
        <span className="designer-title">
          {isStart ? <Zap size={15} className="tone-accent" /> : null}
          <strong>{page.name}</strong>
          <small>
            {project.settings.screen.width}×{project.settings.screen.height}
          </small>
        </span>
        <span className="designer-links">
          {incoming.map((e) => (
            <button key={e.id} className="chip" onClick={() => select({ kind: 'edge', id: e.id })} title={`From ${name(e.from)}`}>
              {name(e.from)} <span className="chip-gesture">{gestureInfo(e.gesture).icon}</span> <ArrowRight size={12} />
            </button>
          ))}
          <span className="chip chip--here">this page</span>
          {outgoing.map((e) => (
            <button key={e.id} className="chip" onClick={() => select({ kind: 'edge', id: e.id })} title={`${gestureInfo(e.gesture).label} goes to ${name(e.to)}`}>
              <ArrowRight size={12} /> <span className="chip-gesture">{gestureInfo(e.gesture).icon}</span> {name(e.to)}
            </button>
          ))}
          {outgoing.length === 0 ? <span className="hint">No gesture leaves this page yet</span> : null}
        </span>
      </div>
      <div className="designer-body">
        <WidgetShelf pageId={pageId} />
        <div className="designer-stage">
          <MirrorScreen
            widgets={page.widgets}
            widgetTypes={project.widgetTypes}
            screen={project.settings.screen}
            selectedId={selectedId}
            onSelect={(id) => select(id ? { kind: 'widget', id, pageId } : { kind: 'page', id: pageId })}
            onMove={(id, position) => updateWidget(pageId, id, { position }, `pos:${id}`)}
            onDropWidget={(type, position) => addWidget(pageId, type, position)}
          />
          <div className="designer-hint">
            Drag to move · <span className="kbd">←↑→↓</span> nudge · <span className="kbd">Del</span> remove · <span className="kbd">Ctrl D</span> duplicate · <span className="kbd">Esc</span> back
          </div>
        </div>
      </div>
    </div>
  )
}
