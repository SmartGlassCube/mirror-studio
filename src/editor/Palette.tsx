import { BUILTIN_WIDGETS } from '../model/catalog'
import { useStudio } from '../store'
import { DRAG_PAGE, DRAG_WIDGET } from './FlowCanvas'

// Click adds to the page open in the designer (or the selected page); drag drops anywhere.
export default function Palette() {
  const project = useStudio((s) => s.project)
  const designerPageId = useStudio((s) => s.designerPageId)
  const selection = useStudio((s) => s.selection)
  const { addWidget, addPage, openWidgetEditor } = useStudio.getState()
  const targetPage = designerPageId ?? (selection?.kind === 'page' ? selection.id : selection?.kind === 'widget' ? selection.pageId : null)

  const add = (type: string) => {
    const page = targetPage ?? project.settings.initialPage
    const count = project.pages.find((p) => p.id === page)?.widgets.length ?? 0
    addWidget(page, type, { x: 0.5, y: Math.min(0.85, 0.2 + count * 0.15) })
  }

  return (
    <aside className="sidebar">
      <div className="side-section">
        <div className="side-title">Pages</div>
        <div
          className="palette-item"
          draggable
          onDragStart={(e) => e.dataTransfer.setData(DRAG_PAGE, 'page')}
          onClick={() => {
            const last = project.pages[project.pages.length - 1]
            addPage('New page', { x: (last?.canvas.x ?? 0) + 300, y: last?.canvas.y ?? 0 })
          }}
          title="Click or drag onto the canvas"
        >
          <span className="palette-icon">▭</span>
          <span>
            <div className="palette-name">New page</div>
            <div className="palette-desc">A screen of widgets</div>
          </span>
        </div>
      </div>

      <div className="side-section">
        <div className="side-title">
          Widgets
          <span className="hint" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {targetPage ? `→ ${project.pages.find((p) => p.id === targetPage)?.name ?? ''}` : 'drag onto a page'}
          </span>
        </div>
        <div className="palette">
          {BUILTIN_WIDGETS.map((w) => (
            <div key={w.type} className="palette-item" draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_WIDGET, w.type)} onClick={() => add(w.type)} title={w.description}>
              <span className="palette-icon">{w.icon}</span>
              <span>
                <div className="palette-name">{w.name}</div>
                <div className="palette-desc">{w.description.split('.')[0]}</div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="side-section">
        <div className="side-title">
          My widgets
          <button className="btn btn--small" onClick={() => openWidgetEditor('new')}>
            + New
          </button>
        </div>
        <div className="palette">
          {project.widgetTypes.length === 0 ? <div className="hint">Design your own: write the code, start from a template, or ask the assistant.</div> : null}
          {project.widgetTypes.map((t) => (
            <div key={t.type} className="palette-item palette-item--custom" draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_WIDGET, t.type)} onClick={() => add(t.type)} title={t.description}>
              <span className="palette-icon">{t.origin === 'ai' ? '✦' : '⟨⟩'}</span>
              <span style={{ minWidth: 0 }}>
                <div className="palette-name">{t.name}</div>
                <div className="palette-desc">{t.type}</div>
              </span>
              <button
                className="btn btn--small palette-edit"
                onClick={(e) => {
                  e.stopPropagation()
                  openWidgetEditor(t.type)
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
