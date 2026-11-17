import { javascript } from '@codemirror/lang-javascript'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo, useRef, useState } from 'react'
import { extractCode, widgetAgentContext } from '../ai/agentContext'
import { AssistantError, generate } from '../ai/gemini'
import { DataSourceEditor, Field, JsonField } from '../components/fields'
import Modal from '../components/Modal'
import { compileWidgetSource } from '../mirror/customWidgets'
import MirrorScreen from '../mirror/MirrorScreen'
import { BUILTIN_TYPES } from '../model/catalog'
import type { CustomWidgetType, WidgetInstance } from '../model/project'
import { slug, uniqueWidgetType } from '../model/project'
import { BLANK_SOURCE, WIDGET_TEMPLATES } from '../model/templates'
import { useStudio } from '../store'

const extensions = [javascript({ jsx: true, typescript: true })]
const PREVIEW_SCREEN = { width: 1080, height: 760 }

export default function WidgetStudio({ editing }: { editing: string }) {
  const project = useStudio((s) => s.project)
  const { openWidgetEditor, upsertWidgetType, removeWidgetType } = useStudio.getState()
  const existing = project.widgetTypes.find((t) => t.type === editing)
  const [draft, setDraft] = useState<CustomWidgetType>(
    () =>
      existing ?? {
        type: uniqueWidgetType(project, 'my_widget', BUILTIN_TYPES),
        name: 'My widget',
        description: '',
        source: BLANK_SOURCE,
        origin: 'code',
        defaultData: { kind: 'none' },
        defaultProps: { title: 'My widget' },
      },
  )
  const [typeTouched, setTypeTouched] = useState(Boolean(existing))
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [previousSource, setPreviousSource] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const compiled = useMemo(() => compileWidgetSource(draft.source), [draft.source])
  const typeError = !/^[a-z][a-z0-9_]*$/.test(draft.type)
    ? 'Lowercase letters, digits and _ only, starting with a letter.'
    : BUILTIN_TYPES.includes(draft.type)
      ? 'That name belongs to a built-in widget.'
      : draft.type !== editing && project.widgetTypes.some((t) => t.type === draft.type)
        ? 'Another widget already uses this name.'
        : null
  const usedOn = project.pages.filter((p) => p.widgets.some((w) => w.type === existing?.type)).length

  const previewWidget: WidgetInstance = {
    id: 'preview',
    type: draft.type,
    position: { x: 0.5, y: 0.5 },
    content: null,
    props: draft.defaultProps,
    data: draft.defaultData,
    refreshInterval: draft.defaultData.kind === 'clock' ? 1 : 300,
    draggable: false,
  }

  const set = (patch: Partial<CustomWidgetType>) => setDraft((d) => ({ ...d, ...patch }))
  const close = () => {
    abort.current?.abort()
    openWidgetEditor(null)
  }

  const save = () => {
    if (typeError) return
    upsertWidgetType(draft, existing?.type)
    close()
  }

  const brief = () => ({ name: draft.name, description: draft.description, source: draft.source, data: draft.defaultData, props: draft.defaultProps })

  const copyContext = async () => {
    await navigator.clipboard.writeText(widgetAgentContext(brief()))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const askAi = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setAiError(null)
    abort.current = new AbortController()
    try {
      const isBlank = draft.source.trim() === BLANK_SOURCE.trim()
      const reply = await generate({
        system: widgetAgentContext({ ...brief(), source: isBlank ? undefined : draft.source }),
        turns: [{ role: 'user', text: isBlank ? `Write this widget: ${prompt}` : `Change the current code: ${prompt}` }],
        temperature: 0.3,
        signal: abort.current.signal,
      })
      setPreviousSource(draft.source)
      set({ source: extractCode(reply), origin: 'ai', description: draft.description || prompt })
      if (!existing && draft.name === 'My widget') {
        const name = prompt.split(/\s+/).slice(0, 3).join(' ').replace(/[^\w\s-]/g, '') || 'AI widget'
        set({ name: name[0].toUpperCase() + name.slice(1) })
        if (!typeTouched) set({ type: uniqueWidgetType(project, name, BUILTIN_TYPES) })
      }
      setPrompt('')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setAiError(error instanceof AssistantError ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={existing ? `Widget: ${existing.name}` : 'New widget'}
      onClose={close}
      actions={
        <>
          <div className="menu">
            <button className="btn" onClick={() => setShowTemplates((v) => !v)}>
              Templates ▾
            </button>
            {showTemplates ? (
              <div className="menu-list" onMouseLeave={() => setShowTemplates(false)}>
                {WIDGET_TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => {
                      setPreviousSource(draft.source)
                      set({ source: t.source, defaultData: t.defaultData, defaultProps: t.defaultProps, origin: 'template', ...(existing ? {} : { name: t.name, description: t.description, type: typeTouched ? draft.type : uniqueWidgetType(project, t.name, BUILTIN_TYPES) }) })
                      setShowTemplates(false)
                    }}
                  >
                    {t.icon} {t.name}
                    <small>{t.description}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className="btn" onClick={copyContext} title="Copies a brief with the widget contract, the data shape and the current code, for Claude Code, Cursor, ChatGPT…">
            {copied ? '✓ Copied' : '⧉ Copy context for coding agents'}
          </button>
          {existing ? (
            <button className="btn btn--danger" onClick={() => confirm(usedOn ? `Delete "${existing.name}"? It is used on ${usedOn} page(s); those widgets go too.` : `Delete "${existing.name}"?`) && (removeWidgetType(existing.type), close())}>
              Delete
            </button>
          ) : null}
          <button className="btn btn--primary" disabled={Boolean(typeError)} onClick={save}>
            {existing ? 'Save' : 'Create widget'}
          </button>
        </>
      }
    >
      <div className="wstudio">
        <div className="wstudio-code">
          <div className="wstudio-meta">
            <Field label="Name">
              <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value, ...(typeTouched ? {} : { type: uniqueWidgetType(project, slug(e.target.value), BUILTIN_TYPES) }) })} />
            </Field>
            <Field label="Type id" hint={typeError ? <span className="error-text">{typeError}</span> : undefined}>
              <input className={`input${typeError ? ' input--invalid' : ''}`} value={draft.type} onChange={(e) => (setTypeTouched(true), set({ type: e.target.value }))} />
            </Field>
            <Field label="Description">
              <input className="input" value={draft.description} placeholder="What it shows" onChange={(e) => set({ description: e.target.value })} />
            </Field>
          </div>
          <div className="wstudio-editor">
            <CodeMirror value={draft.source} height="100%" theme="dark" extensions={extensions} onChange={(source) => set({ source })} basicSetup={{ foldGutter: false }} />
          </div>
          <div className="wstudio-status">
            {compiled.ok ? <span style={{ color: 'var(--ok)' }}>✓ Compiles</span> : <span className="error-text">{compiled.error}</span>}
            {previousSource !== null ? (
              <button className="btn btn--small btn--ghost" style={{ marginLeft: 10 }} onClick={() => (set({ source: previousSource }), setPreviousSource(null))}>
                ↶ Undo last replace
              </button>
            ) : null}
          </div>
          <div className="ai-box">
            <input
              className="input"
              value={prompt}
              disabled={busy}
              placeholder={draft.source.trim() === BLANK_SOURCE.trim() ? '✦ Describe a widget, e.g. "a bus timetable with the next 3 departures"' : '✦ Ask for a change, e.g. "make the numbers purple and add a progress bar"'}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askAi()}
            />
            {busy ? (
              <button className="btn" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            ) : (
              <button className="btn btn--primary" disabled={!prompt.trim()} onClick={askAi}>
                Generate
              </button>
            )}
          </div>
          {aiError ? <div className="wstudio-status error-text">{aiError}</div> : null}
        </div>

        <div className="wstudio-side">
          <div className="wstudio-preview">
            <MirrorScreen widgets={[previewWidget]} widgetTypes={[draft]} screen={PREVIEW_SCREEN} />
          </div>
          <div className="modal-body">
            <DataSourceEditor source={draft.defaultData} onChange={(defaultData) => set({ defaultData })} />
            <JsonField label="Default props (widget.metadata)" value={draft.defaultProps} onChange={(defaultProps) => set({ defaultProps: defaultProps as Record<string, unknown> })} rows={6} hint="New copies of this widget start with these; each copy can change them in the inspector." />
            <div className="hint">
              Runs as a React component in the studio and, from glasscube 0.2.0, on the mirror. Only <code>react</code> can be imported; data comes from the data source.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
