import { AlertTriangle, ChevronDown, ChevronUp, CircleAlert, Info } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import AssistantPanel from './ai/AssistantPanel'
import Modal from './components/Modal'
import FlowCanvas from './editor/FlowCanvas'
import Inspector from './editor/Inspector'
import PageDesigner from './editor/PageDesigner'
import NodeCreator from './editor/NodeCreator'
import Rail from './editor/Rail'
import TopBar from './editor/TopBar'
import { lintProject } from './model/lint'
import { useStudio } from './store'

// Loaded on first use: MediaPipe (test) and CodeMirror (widget studio) are most of the bundle.
const TestRunner = lazy(() => import('./test/TestRunner'))
const WidgetStudio = lazy(() => import('./editor/WidgetStudio'))
const Loading = () => <div className="empty">Loading…</div>

function Problems() {
  const project = useStudio((s) => s.project)
  const { select } = useStudio.getState()
  const problems = useMemo(() => lintProject(project), [project])
  const [open, setOpen] = useState(false)
  const errors = problems.filter((p) => p.level === 'error').length
  const warnings = problems.filter((p) => p.level === 'warning').length
  if (!problems.length) return null
  const icon = (level: string) =>
    level === 'error' ? <CircleAlert size={15} className="tone-err" /> : level === 'warning' ? <AlertTriangle size={15} className="tone-warn" /> : <Info size={15} className="tone-faint" />
  return (
    <div className={`problems${open ? ' is-open' : ''}`}>
      <button className="problems-head" onClick={() => setOpen(!open)}>
        {errors ? <CircleAlert size={15} className="tone-err" /> : warnings ? <AlertTriangle size={15} className="tone-warn" /> : <Info size={15} className="tone-faint" />}
        <span>
          {errors ? `${errors} error${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : `${problems.length} tip${problems.length > 1 ? 's' : ''}`}
          {(errors ? warnings + problems.length - errors - warnings : warnings ? problems.length - warnings : 0) > 0
            ? ` · ${problems.length - (errors || warnings)} more`
            : ''}
        </span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {open ? (
        <div className="problems-list">
          {problems.map((p, i) => (
            <button key={i} className="problem" onClick={() => (p.edgeId ? select({ kind: 'edge', id: p.edgeId }) : p.pageId ? select({ kind: 'page', id: p.pageId }) : select({ kind: 'settings' }))}>
              {icon(p.level)}
              <span>{p.message}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TrustPrompt() {
  const project = useStudio((s) => s.project)
  const { trust, newProject } = useStudio.getState()
  return (
    <Modal small title="This project contains code" onClose={() => {}}>
      <div className="modal-body">
        <p>
          "{project.name}" has {project.widgetTypes.length} custom widget{project.widgetTypes.length > 1 ? 's' : ''} ({project.widgetTypes.map((t) => t.name).join(', ')}). Their code runs in this page, with the same access as the studio, including your saved assistant key.
        </p>
        <p className="hint">Only run code from people you trust. You can read it first in the widget editor after opening it.</p>
        <div className="actions">
          <button className="btn btn--primary" onClick={trust}>
            Run it
          </button>
          <button className="btn" onClick={() => newProject('demo')}>
            Don't open it
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function App() {
  const view = useStudio((s) => s.view)
  const designerPageId = useStudio((s) => s.designerPageId)
  const widgetEditor = useStudio((s) => s.widgetEditor)
  const assistantOpen = useStudio((s) => s.assistantOpen)
  const creatorOpen = useStudio((s) => s.creatorOpen)
  const selection = useStudio((s) => s.selection)
  const trusted = useStudio((s) => s.trusted)

  // Tab opens the "+" panel (as in n8n); Esc closes the topmost panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, .cm-editor, .modal')) return
      const { view, creatorOpen, designerPageId, selection, toggleCreator, select } = useStudio.getState()
      if (e.key === 'Tab' && view === 'graph' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleCreator()
      } else if (e.key === 'Escape' && !designerPageId) {
        if (creatorOpen) toggleCreator(false)
        else if (selection) select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!trusted) {
    return (
      <div className="app">
        <Rail />
        <TopBar />
        <TrustPrompt />
      </div>
    )
  }

  return (
    <div className="app">
      <Rail />
      <TopBar />
      {view === 'test' ? (
        <div className={`workspace${assistantOpen ? ' has-assistant' : ''}`}>
          <main className="center">
            <Suspense fallback={<Loading />}>
              <TestRunner />
            </Suspense>
          </main>
          {assistantOpen ? <AssistantPanel /> : null}
        </div>
      ) : (
        <div className={`workspace${selection ? ' has-panel' : ''}${assistantOpen ? ' has-assistant' : ''}`}>
          <main className="center">
            <FlowCanvas />
            {designerPageId ? <PageDesigner pageId={designerPageId} /> : null}
            {creatorOpen ? <NodeCreator /> : null}
            <Problems />
          </main>
          {selection ? <Inspector /> : null}
          {assistantOpen ? <AssistantPanel /> : null}
        </div>
      )}
      {widgetEditor ? (
        <Suspense fallback={null}>
          <WidgetStudio key={widgetEditor} editing={widgetEditor} />
        </Suspense>
      ) : null}
    </div>
  )
}
