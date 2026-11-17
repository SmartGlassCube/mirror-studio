import { useEffect } from 'react'
import MirrorScreen from '../mirror/MirrorScreen'
import { gestureInfo } from '../model/gestures'
import { useStudio } from '../store'

export default function PageDesigner({ pageId }: { pageId: string }) {
  const project = useStudio((s) => s.project)
  const selection = useStudio((s) => s.selection)
  const { updateWidget, addWidget, select, openDesigner, removeWidget, duplicateWidget } = useStudio.getState()
  const page = project.pages.find((p) => p.id === pageId)
  const selectedId = selection?.kind === 'widget' && selection.pageId === pageId ? selection.id : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, .cm-editor')) return
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
  const outgoing = project.edges.filter((e) => e.from === pageId)

  return (
    <div className="designer">
      <div className="designer-bar">
        <button className="btn" onClick={() => openDesigner(null)}>
          ← Graph
        </button>
        <h2>{page.name}</h2>
        <span className="hint">
          {project.settings.screen.width}×{project.settings.screen.height}
        </span>
        <span style={{ flex: 1 }} />
        <span className="hint">
          {outgoing.length
            ? outgoing.map((e) => `${gestureInfo(e.gesture).icon} → ${project.pages.find((p) => p.id === e.to)?.name}`).join('   ')
            : 'No gesture leaves this page yet'}
        </span>
        <span className="hint" style={{ marginLeft: 12 }}>
          <span className="kbd">←↑→↓</span> nudge · <span className="kbd">Del</span> remove · <span className="kbd">Esc</span> back
        </span>
      </div>
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
      </div>
    </div>
  )
}
