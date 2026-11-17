import { lazy, Suspense, useMemo, useState } from 'react'
import AssistantPanel from './ai/AssistantPanel'
import Modal from './components/Modal'
import FlowCanvas from './editor/FlowCanvas'
import Inspector from './editor/Inspector'
import PageDesigner from './editor/PageDesigner'
import Palette from './editor/Palette'
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
  const [open, setOpen] = useState(true)
  const errors = problems.filter((p) => p.level === 'error').length
  const warnings = problems.filter((p) => p.level === 'warning').length
  if (!problems.length) return null
  return (
    <div className="problems">
      <button className="problem" onClick={() => setOpen(!open)} style={{ fontWeight: 600 }}>
        {open ? '▾' : '▸'} Problems
        {errors ? <span className="badge badge--err">{errors} error{errors > 1 ? 's' : ''}</span> : null}
        {warnings ? <span className="badge badge--warn">{warnings} warning{warnings > 1 ? 's' : ''}</span> : null}
        <span className="badge">{problems.length - errors - warnings} tips</span>
      </button>
      {open
        ? problems.map((p, i) => (
            <button key={i} className="problem" onClick={() => (p.edgeId ? select({ kind: 'edge', id: p.edgeId }) : p.pageId ? select({ kind: 'page', id: p.pageId }) : select({ kind: 'settings' }))}>
              <span style={{ color: p.level === 'error' ? 'var(--err)' : p.level === 'warning' ? 'var(--warn)' : 'var(--faint)' }}>{p.level === 'error' ? '●' : p.level === 'warning' ? '▲' : 'i'}</span>
              {p.message}
            </button>
          ))
        : null}
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
  const trusted = useStudio((s) => s.trusted)

  if (!trusted) {
    return (
      <div className="app">
        <TopBar />
        <TrustPrompt />
      </div>
    )
  }

  return (
    <div className="app">
      <TopBar />
      {view === 'test' ? (
        <div style={{ display: 'grid', gridTemplateColumns: assistantOpen ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)', minHeight: 0 }}>
          <Suspense fallback={<Loading />}>
            <TestRunner />
          </Suspense>
          {assistantOpen ? <AssistantPanel /> : null}
        </div>
      ) : (
        <div className={`workspace${assistantOpen ? ' workspace--assistant' : ''}`}>
          <Palette />
          <main className="center">
            <FlowCanvas />
            {designerPageId ? <PageDesigner pageId={designerPageId} /> : null}
            <Problems />
          </main>
          <Inspector />
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
