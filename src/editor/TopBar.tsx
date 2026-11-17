import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Download, FileJson, FilePlus2, FileText, FolderOpen, LayoutTemplate, MonitorPlay, Redo2, Sparkles, Undo2 } from 'lucide-react'
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
  const { setView, undo, redo, renameProject, replaceProject, newProject, toggleAssistant } = useStudio.getState()
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
      <div className="crumbs">
        <span className="crumbs-root">Mirror Studio</span>
        <ChevronRight size={14} className="crumbs-sep" />
        <input className="project-name" value={project.name} onChange={(e) => renameProject(e.target.value)} aria-label="Project name" size={Math.max(8, project.name.length)} />
        <span className="saved-chip" title="Every change is saved in this browser">
          <Check size={13} /> Saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={view === 'graph'} className={`tab${view === 'graph' ? ' tab--active' : ''}`} onClick={() => setView('graph')}>
          Editor
        </button>
        <button role="tab" aria-selected={view === 'test'} className={`tab${view === 'test' ? ' tab--active' : ''}`} onClick={() => setView('test')}>
          Test
        </button>
      </div>

      <div className="topbar-actions">
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">
          <Redo2 size={17} />
        </button>
        <span className="topbar-divider" />
        <div className="menu" ref={newMenu.ref}>
          <button className="btn" onClick={() => newMenu.setOpen(!newMenu.open)}>
            <FilePlus2 size={15} /> New <ChevronDown size={14} />
          </button>
          {newMenu.open ? (
            <div className="menu-list">
              <button onClick={() => (confirm('Start a blank project? Export this one first if you want to keep it.') && newProject('blank'), newMenu.setOpen(false))}>
                <FilePlus2 size={16} />
                <span>
                  Blank project
                  <small>One empty page</small>
                </span>
              </button>
              <button onClick={() => (confirm('Open the demo? It replaces the current project.') && newProject('demo'), newMenu.setOpen(false))}>
                <LayoutTemplate size={16} />
                <span>
                  Demo mirror
                  <small>Three pages, gestures, two custom widgets</small>
                </span>
              </button>
              <button onClick={() => (fileInput.current?.click(), newMenu.setOpen(false))}>
                <FolderOpen size={16} />
                <span>
                  Open a file…
                  <small>.json or .yaml exported from the studio</small>
                </span>
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
          <button className="btn btn--primary" onClick={() => exportMenu.setOpen(!exportMenu.open)}>
            <Download size={15} /> Export <ChevronDown size={14} />
          </button>
          {exportMenu.open ? (
            <div className="menu-list">
              <button onClick={() => doExport('json')}>
                <FileJson size={16} />
                <span>
                  Download JSON
                  <small>Everything, including widget code (Ctrl+S)</small>
                </span>
              </button>
              <button onClick={() => doExport('yaml')}>
                <FileText size={16} />
                <span>
                  Download YAML
                  <small>Same content, easier to read and diff</small>
                </span>
              </button>
              <button onClick={() => (setRunHelp(true), exportMenu.setOpen(false))}>
                <MonitorPlay size={16} />
                <span>
                  Run it on a mirror…
                  <small>With the glasscube Python package</small>
                </span>
              </button>
            </div>
          ) : null}
        </div>
        <button className={`btn btn--ai${assistantOpen ? ' is-active' : ''}`} onClick={() => toggleAssistant()}>
          <Sparkles size={15} /> Ask AI
        </button>
      </div>

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
              {`pip install -U glasscube\nglasscube run ${fileName(project, 'json')}`}
            </pre>
            <p className="hint">
              Then open <code>http://localhost:8080</code> full screen. Your custom widgets run there too. Needs glasscube 0.2.0 or newer; add <code>--camera 1</code> to pick another webcam, <code>--port</code> to change the port.
            </p>
          </div>
        </Modal>
      ) : null}
    </header>
  )
}
