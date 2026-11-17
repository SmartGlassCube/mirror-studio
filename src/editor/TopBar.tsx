import { useEffect, useRef, useState } from 'react'
import Modal from '../components/Modal'
import { downloadText, exportProject, fileName, ImportError, parseProject, type ExportFormat } from '../model/io'
import { useStudio } from '../store'

function useMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return { open, setOpen, ref }
}

export default function TopBar() {
  const project = useStudio((s) => s.project)
  const view = useStudio((s) => s.view)
  const canUndo = useStudio((s) => s.past.length > 0)
  const canRedo = useStudio((s) => s.future.length > 0)
  const savedAt = useStudio((s) => s.savedAt)
  const assistantOpen = useStudio((s) => s.assistantOpen)
  const { setView, undo, redo, renameProject, replaceProject, newProject, toggleAssistant, select } = useStudio.getState()
  const exportMenu = useMenu()
  const newMenu = useMenu()
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [runHelp, setRunHelp] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input, textarea, .cm-editor')) return
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        downloadText(fileName(project, 'json'), exportProject(project, 'json'), 'application/json')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, project])

  const doExport = (format: ExportFormat) => {
    downloadText(fileName(project, format), exportProject(project, format), format === 'json' ? 'application/json' : 'application/yaml')
    exportMenu.setOpen(false)
  }

  const doImport = async (file: File) => {
    try {
      const imported = parseProject(await file.text())
      if (!confirm(`Open "${imported.name}"? It replaces the current project (Ctrl+Z brings it back).`)) return
      // Someone else's code runs with this site's access (incl. your saved AI key): ask first.
      replaceProject(imported, imported.widgetTypes.length === 0)
    } catch (error) {
      setImportError(error instanceof ImportError ? error.message : `Could not read the file: ${(error as Error).message}`)
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/favicon.svg" alt="" />
        Mirror <span>Studio</span>
      </div>
      <input className="project-name" value={project.name} onChange={(e) => renameProject(e.target.value)} aria-label="Project name" />
      <div className="tabs">
        <button className={`tab${view === 'graph' ? ' tab--active' : ''}`} onClick={() => setView('graph')}>
          Build
        </button>
        <button className={`tab${view === 'test' ? ' tab--active' : ''}`} onClick={() => setView('test')}>
          ▶ Test
        </button>
      </div>
      <button className="btn btn--ghost btn--icon" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        ↶
      </button>
      <button className="btn btn--ghost btn--icon" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">
        ↷
      </button>
      <span className="saved" title="Saved in this browser">
        ✓ Saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="topbar-spacer" />
      <button className="btn btn--ghost" onClick={() => select({ kind: 'settings' })}>
        ⚙ Project
      </button>
      <div className="menu" ref={newMenu.ref}>
        <button className="btn" onClick={() => newMenu.setOpen(!newMenu.open)}>
          New ▾
        </button>
        {newMenu.open ? (
          <div className="menu-list">
            <button onClick={() => (confirm('Start a blank project? Export this one first if you want to keep it.') && newProject('blank'), newMenu.setOpen(false))}>
              Blank project
              <small>One empty page</small>
            </button>
            <button onClick={() => (confirm('Open the demo? It replaces the current project.') && newProject('demo'), newMenu.setOpen(false))}>
              Demo mirror
              <small>Three pages, gestures, two custom widgets</small>
            </button>
            <button onClick={() => (fileInput.current?.click(), newMenu.setOpen(false))}>
              Open a file…
              <small>.json or .yaml exported from the studio</small>
            </button>
          </div>
        ) : null}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.yaml,.yml,application/json,application/yaml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) doImport(file)
          e.target.value = ''
        }}
      />
      <div className="menu" ref={exportMenu.ref}>
        <button className="btn" onClick={() => exportMenu.setOpen(!exportMenu.open)}>
          Export ▾
        </button>
        {exportMenu.open ? (
          <div className="menu-list">
            <button onClick={() => doExport('json')}>
              Download JSON
              <small>Everything, including widget code (Ctrl+S)</small>
            </button>
            <button onClick={() => doExport('yaml')}>
              Download YAML
              <small>Same content, easier to read and diff</small>
            </button>
            <button onClick={() => (setRunHelp(true), exportMenu.setOpen(false))}>
              Run it on a mirror…
              <small>With the glasscube Python package</small>
            </button>
          </div>
        ) : null}
      </div>
      <button className={`btn${assistantOpen ? ' btn--primary' : ''}`} onClick={() => toggleAssistant()}>
        ✦ Assistant
      </button>

      {importError ? (
        <Modal small title="Can't open this file" onClose={() => setImportError(null)}>
          <div className="modal-body">
            <p className="error-text">{importError}</p>
          </div>
        </Modal>
      ) : null}
      {runHelp ? (
        <Modal small title="Run it on a mirror" onClose={() => setRunHelp(false)}>
          <div className="modal-body">
            <p>On the mirror's computer (a Raspberry Pi, a laptop…) with a webcam:</p>
            <pre className="textarea" style={{ whiteSpace: 'pre-wrap', minHeight: 0 }}>
              {`pip install glasscube\nglasscube run ${fileName(project, 'json')}`}
            </pre>
            <p className="hint">
              Then open <code>http://localhost:8080</code> full screen. <code>glasscube run</code> arrives in glasscube 0.2.0; with 0.1.0, use the export as the blueprint for your Python graph (pages = nodes, links = edges).
            </p>
          </div>
        </Modal>
      ) : null}
    </header>
  )
}
