import { Code2, Keyboard, Monitor, Moon, Play, Plus, Settings2, Sparkles, Sun, Workflow } from 'lucide-react'
import { useState } from 'react'
import Modal from '../components/Modal'
import { useStudio } from '../store'
import { useTheme } from '../theme'

const SHORTCUTS: [string, string][] = [
  ['Tab', 'Add a page or a widget'],
  ['Double-click a page', 'Design it'],
  ['Del / Backspace', 'Delete the selection'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / redo'],
  ['Ctrl + S', 'Download the project (JSON)'],
  ['Ctrl + D', 'Duplicate the selected widget'],
  ['← ↑ → ↓ (Shift)', 'Nudge the selected widget'],
  ['Esc', 'Close the designer or a panel'],
]

// n8n-style navigation rail: views and panels on the left edge, settings at the bottom.
export default function Rail() {
  const view = useStudio((s) => s.view)
  const creatorOpen = useStudio((s) => s.creatorOpen)
  const assistantOpen = useStudio((s) => s.assistantOpen)
  const selection = useStudio((s) => s.selection)
  const { setView, toggleCreator, toggleAssistant, openWidgetEditor, select, openDesigner } = useStudio.getState()
  const theme = useTheme()
  const [help, setHelp] = useState(false)
  const ThemeIcon = theme.choice === 'system' ? Monitor : theme.choice === 'dark' ? Moon : Sun

  return (
    <nav className="rail" aria-label="Studio">
      <div className="rail-logo" title="Smart Mirror Studio">
        <img src="/favicon.svg" alt="" />
      </div>
      <button className={`rail-btn${view === 'graph' ? ' is-active' : ''}`} data-tip="Editor" onClick={() => setView('graph')}>
        <Workflow size={20} />
      </button>
      <button className={`rail-btn${view === 'test' ? ' is-active' : ''}`} data-tip="Test with your webcam" onClick={() => (openDesigner(null), setView('test'))}>
        <Play size={20} />
      </button>
      <span className="rail-sep" />
      <button
        className={`rail-btn${creatorOpen ? ' is-active' : ''}`}
        data-tip="Add a page or widget (Tab)"
        onClick={() => (setView('graph'), toggleCreator())}
      >
        <Plus size={20} />
      </button>
      <button className="rail-btn" data-tip="New custom widget" onClick={() => openWidgetEditor('new')}>
        <Code2 size={20} />
      </button>
      <button
        className={`rail-btn${selection?.kind === 'settings' ? ' is-active' : ''}`}
        data-tip="Project settings"
        onClick={() => (setView('graph'), select(selection?.kind === 'settings' ? null : { kind: 'settings' }))}
      >
        <Settings2 size={20} />
      </button>
      <span className="rail-spacer" />
      <button className={`rail-btn rail-btn--ai${assistantOpen ? ' is-active' : ''}`} data-tip="AI assistant" onClick={() => toggleAssistant()}>
        <Sparkles size={20} />
      </button>
      <button className="rail-btn" data-tip={`Theme: ${theme.choice}`} onClick={theme.cycle}>
        <ThemeIcon size={20} />
      </button>
      <button className="rail-btn" data-tip="Keyboard shortcuts" onClick={() => setHelp(true)}>
        <Keyboard size={20} />
      </button>

      {help ? (
        <Modal small title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <div className="modal-body">
            <div className="shortcuts">
              {SHORTCUTS.map(([keys, what]) => (
                <div key={keys} className="shortcut">
                  <span>{what}</span>
                  <span className="kbd">{keys}</span>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
    </nav>
  )
}
