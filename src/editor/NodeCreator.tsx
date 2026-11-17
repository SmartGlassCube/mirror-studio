import { Code2, Link2, PanelsTopLeft, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BUILTIN_WIDGETS } from '../model/catalog'
import type { Project, XY } from '../model/project'
import { useStudio } from '../store'
import { DRAG_PAGE, DRAG_WIDGET, freeGesture } from './FlowCanvas'
import { WidgetIcon } from './icons'

// Where a new page goes: right of `from` (below its other links), or right of the rightmost page.
export function nextPagePosition(project: Project, from?: string): XY {
  const source = project.pages.find((p) => p.id === from)
  if (source) {
    const siblings = project.edges.filter((e) => e.from === source.id).length
    return { x: source.canvas.x + 340, y: source.canvas.y + siblings * 300 - (siblings ? 150 : 0) }
  }
  const right = project.pages.reduce((best, p) => (p.canvas.x > best.canvas.x ? p : best), project.pages[0])
  return { x: (right?.canvas.x ?? 0) + 340, y: right?.canvas.y ?? 0 }
}

// Adds a page, linked from `from` with a gesture it doesn't use yet. Returns the new page's id.
export function addLinkedPage(from?: string | null) {
  const { project, addPage, addEdge, select } = useStudio.getState()
  const id = addPage('New page', nextPagePosition(project, from ?? undefined))
  if (from && project.pages.some((p) => p.id === from)) addEdge(from, id, freeGesture(project, from))
  select({ kind: 'page', id })
  return id
}

// The page widgets are added to: the one being designed, else the selected one, else the start page.
export function useTargetPage() {
  const project = useStudio((s) => s.project)
  const designerPageId = useStudio((s) => s.designerPageId)
  const selection = useStudio((s) => s.selection)
  const id =
    designerPageId ??
    (selection?.kind === 'page' ? selection.id : selection?.kind === 'widget' ? selection.pageId : null) ??
    project.settings.initialPage
  return project.pages.find((p) => p.id === id) ?? project.pages[0]
}

type Item = {
  key: string
  label: string
  description: string
  icon: React.ReactNode
  drag?: [string, string]
  run: () => void
}

// The "+" panel, like n8n's node creator: search, then click (or drag) to add a page or a widget.
export default function NodeCreator() {
  const project = useStudio((s) => s.project)
  const selection = useStudio((s) => s.selection)
  const designerPageId = useStudio((s) => s.designerPageId)
  const { toggleCreator, addWidget, openDesigner, openWidgetEditor } = useStudio.getState()
  const target = useTargetPage()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const linkFrom = selection?.kind === 'page' ? project.pages.find((p) => p.id === selection.id) : undefined

  useEffect(() => input.current?.focus(), [])

  const addToPage = (type: string) => {
    const count = target.widgets.length
    addWidget(target.id, type, { x: 0.5, y: Math.min(0.85, 0.2 + count * 0.15) })
    if (!designerPageId) openDesigner(target.id)
    toggleCreator(false)
  }

  const sections = useMemo(() => {
    const pages: Item[] = [
      {
        key: 'page',
        label: linkFrom ? `New page after ${linkFrom.name}` : 'New page',
        description: linkFrom ? 'Linked from the selected page with a free gesture' : 'An empty screen; link it by dragging from another page',
        icon: <span className="type-icon" style={{ '--tone': '#ff6d5a' } as React.CSSProperties}>{linkFrom ? <Link2 size={18} /> : <PanelsTopLeft size={18} />}</span>,
        drag: [DRAG_PAGE, 'page'],
        run: () => (addLinkedPage(linkFrom?.id), toggleCreator(false)),
      },
    ]
    const builtins: Item[] = BUILTIN_WIDGETS.map((w) => ({
      key: w.type,
      label: w.name,
      description: w.description,
      icon: <WidgetIcon type={w.type} />,
      drag: [DRAG_WIDGET, w.type],
      run: () => addToPage(w.type),
    }))
    const custom: Item[] = [
      ...project.widgetTypes.map((t) => ({
        key: `custom:${t.type}`,
        label: t.name,
        description: t.description || `Your widget (${t.type})`,
        icon: <WidgetIcon type={t.type} custom={t} />,
        drag: [DRAG_WIDGET, t.type] as [string, string],
        run: () => addToPage(t.type),
      })),
      {
        key: 'new-widget',
        label: 'Create a widget…',
        description: 'Write a React component, start from a template, or describe it to the AI',
        icon: <span className="type-icon" style={{ '--tone': '#64748b' } as React.CSSProperties}><Code2 size={18} /></span>,
        run: () => (openWidgetEditor('new'), toggleCreator(false)),
      },
    ]
    const match = (item: Item) => `${item.label} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())
    return [
      { title: 'Pages', items: pages.filter(match) },
      { title: `Widgets → ${target.name}`, items: builtins.filter(match) },
      { title: 'My widgets', items: custom.filter(match) },
    ].filter((s) => s.items.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, query, linkFrom, target, designerPageId])

  const flat = sections.flatMap((s) => s.items)
  useEffect(() => setActive(0), [query])

  return (
    <div className="creator" role="dialog" aria-label="Add a page or a widget">
      <div className="creator-head">
        <div>
          <h3>What do you want to add?</h3>
          <p>Click to add, or drag onto the canvas or a page.</p>
        </div>
        <button className="icon-btn" onClick={() => toggleCreator(false)} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <label className="creator-search">
        <Search size={16} />
        <input
          ref={input}
          value={query}
          placeholder="Search pages and widgets…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') toggleCreator(false)
            else if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(flat.length - 1, a + 1)))
            else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
            else if (e.key === 'Enter') flat[active]?.run()
          }}
        />
      </label>
      <div className="creator-list">
        {sections.length === 0 ? <div className="empty">Nothing matches “{query}”.</div> : null}
        {sections.map((section) => (
          <div key={section.title}>
            <div className="creator-section">{section.title}</div>
            {section.items.map((item) => {
              const index = flat.indexOf(item)
              return (
                <button
                  key={item.key}
                  className={`creator-item${index === active ? ' creator-item--active' : ''}`}
                  draggable={Boolean(item.drag)}
                  onDragStart={(e) => item.drag && e.dataTransfer.setData(item.drag[0], item.drag[1])}
                  onMouseEnter={() => setActive(index)}
                  onClick={item.run}
                >
                  {item.icon}
                  <span className="creator-text">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <Plus size={16} className="creator-plus" />
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
