import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DataSourceEditor, Field, JsonField, TextContentEditor } from '../components/fields'
import { builtinWidget } from '../model/catalog'
import { GESTURES, gestureInfo } from '../model/gestures'
import { DEFAULT_GESTURE_CONFIG, SCREEN_PRESETS, type GestureConfig, type Project } from '../model/project'
import { useStudio } from '../store'

export function GestureSelect({ value, onChange, taken = [] }: { value: string; onChange: (g: string) => void; taken?: string[] }) {
  const families = [...new Set(GESTURES.map((g) => g.family))]
  const known = GESTURES.some((g) => g.name === value)
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {!known ? <option value={value}>{value} (custom)</option> : null}
      {families.map((family) => (
        <optgroup key={family} label={family}>
          {GESTURES.filter((g) => g.family === family).map((g) => (
            <option key={g.name} value={g.name}>
              {g.icon} {g.label}
              {taken.includes(g.name) && g.name !== value ? ' (used here)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export default function Inspector() {
  const selection = useStudio((s) => s.selection)
  const project = useStudio((s) => s.project)
  let body
  if (selection?.kind === 'page' && project.pages.some((p) => p.id === selection.id)) body = <PageInspector id={selection.id} />
  else if (selection?.kind === 'edge' && project.edges.some((e) => e.id === selection.id)) body = <EdgeInspector id={selection.id} />
  else if (selection?.kind === 'widget') body = <WidgetInspector id={selection.id} pageId={selection.pageId} />
  else body = <SettingsInspector />
  return (
    <aside className="panel">
      <button className="icon-btn panel-close" onClick={() => useStudio.getState().select(null)} aria-label="Close panel" title="Close">
        <X size={18} />
      </button>
      {body}
    </aside>
  )
}

function PageInspector({ id }: { id: string }) {
  const project = useStudio((s) => s.project)
  const page = project.pages.find((p) => p.id === id)!
  const { updatePage, renamePageId, removePage, duplicatePage, updateSettings, openDesigner, select, addEdge, updateEdge, removeEdge } = useStudio.getState()
  const [pageId, setPageId] = useState(id)
  useEffect(() => setPageId(id), [id])
  const outgoing = project.edges.filter((e) => e.from === id)
  const incoming = project.edges.filter((e) => e.to === id)
  const others = project.pages.filter((p) => p.id !== id)
  return (
    <>
      <div className="inspector-head">
        <span className="badge">Page</span>
        <h3>{page.name}</h3>
      </div>
      <div className="inspector-body">
        <Field label="Name">
          <input className="input" value={page.name} onChange={(e) => updatePage(id, { name: e.target.value }, `page-name:${id}`)} />
        </Field>
        <Field label="Id" hint="The node id in the SDK graph. Lowercase letters, digits, - and _.">
          <input
            className={`input${pageId !== id && !/^[a-z][a-z0-9_-]*$/.test(pageId) ? ' input--invalid' : ''}`}
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            onBlur={() => pageId !== id && !renamePageId(id, pageId) && setPageId(id)}
          />
        </Field>
        <label className="check" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={project.settings.initialPage === id} disabled={project.settings.initialPage === id} onChange={() => updateSettings({ initialPage: id })} />
          Start page (shown when the mirror starts)
        </label>
        <div className="actions" style={{ marginBottom: 16 }}>
          <button className="btn btn--primary" onClick={() => openDesigner(id)}>
            Design page
          </button>
          <button className="btn" onClick={() => duplicatePage(id)}>
            Duplicate
          </button>
          <button className="btn btn--danger" disabled={project.pages.length <= 1} onClick={() => confirm(`Delete "${page.name}" and its links?`) && removePage(id)}>
            Delete
          </button>
        </div>

        <div className="side-title">Widgets ({page.widgets.length})</div>
        <div className="list">
          {page.widgets.map((w) => (
            <button key={w.id} className="list-row list-row--button" onClick={() => select({ kind: 'widget', id: w.id, pageId: id })}>
              <span className="grow">{builtinWidget(w.type)?.name ?? project.widgetTypes.find((t) => t.type === w.type)?.name ?? w.type}</span>
              <span className="hint">
                {Math.round(w.position.x * 100)}%, {Math.round(w.position.y * 100)}%
              </span>
            </button>
          ))}
          {page.widgets.length === 0 ? <div className="hint">Drag widgets from the left onto this page, or open the designer.</div> : null}
        </div>

        <div className="side-title">Gestures leaving this page</div>
        <div className="list">
          {outgoing.map((e) => (
            <div key={e.id} className="list-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
              <GestureSelect value={e.gesture} onChange={(gesture) => updateEdge(e.id, { gesture })} taken={outgoing.map((o) => o.gesture)} />
              <select className="select" value={e.to} onChange={(ev) => updateEdge(e.id, { to: ev.target.value })}>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    → {p.name}
                  </option>
                ))}
              </select>
              <button className="btn btn--ghost btn--icon btn--danger" onClick={() => removeEdge(e.id)} aria-label="Remove link">
                ✕
              </button>
            </div>
          ))}
          {others.length ? (
            <button
              className="btn btn--small"
              onClick={() => {
                const used = new Set(outgoing.map((o) => o.gesture))
                addEdge(id, others[0].id, GESTURES.find((g) => !used.has(g.name))?.name ?? 'two_fingers_swipe_right')
                select({ kind: 'page', id })
              }}
            >
              + Add a gesture link
            </button>
          ) : (
            <div className="hint">Add another page to link to.</div>
          )}
        </div>
        {incoming.length ? (
          <div className="hint">
            Reached from: {incoming.map((e) => `${project.pages.find((p) => p.id === e.from)?.name} (${gestureInfo(e.gesture).label})`).join(', ')}
          </div>
        ) : null}
      </div>
    </>
  )
}

function EdgeInspector({ id }: { id: string }) {
  const project = useStudio((s) => s.project)
  const edge = project.edges.find((e) => e.id === id)!
  const { updateEdge, removeEdge } = useStudio.getState()
  const info = gestureInfo(edge.gesture)
  const name = (pid: string) => project.pages.find((p) => p.id === pid)?.name ?? pid
  return (
    <>
      <div className="inspector-head">
        <span className="badge badge--accent">Link</span>
        <h3>
          {name(edge.from)} → {name(edge.to)}
        </h3>
      </div>
      <div className="inspector-body">
        <Field label="Gesture" hint={info.how}>
          <GestureSelect value={edge.gesture} onChange={(gesture) => updateEdge(id, { gesture })} taken={project.edges.filter((e) => e.from === edge.from).map((e) => e.gesture)} />
        </Field>
        <Field label="From">
          <select className="select" value={edge.from} onChange={(e) => updateEdge(id, { from: e.target.value })}>
            {project.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To">
          <select className="select" value={edge.to} onChange={(e) => updateEdge(id, { to: e.target.value })}>
            {project.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {info.sharedWithWidgets ? <div className="hint" style={{ marginBottom: 12 }}>This gesture also drives widgets (text lines, dragging). On this page, the link takes it first.</div> : null}
        <div className="actions">
          <button className="btn" onClick={() => updateEdge(id, { from: edge.to, to: edge.from })}>
            Reverse
          </button>
          <button className="btn btn--danger" onClick={() => removeEdge(id)}>
            Delete link
          </button>
        </div>
        <div className="divider" />
        <div className="hint">Try it in the Test tab: perform the gesture in front of your webcam, or press its simulate button.</div>
      </div>
    </>
  )
}

function WidgetInspector({ id, pageId }: { id: string; pageId: string }) {
  const project = useStudio((s) => s.project)
  const widget = project.pages.find((p) => p.id === pageId)?.widgets.find((w) => w.id === id)
  const { updateWidget, removeWidget, duplicateWidget, openWidgetEditor, select } = useStudio.getState()
  if (!widget) return <SettingsInspector />
  const builtin = builtinWidget(widget.type)
  const custom = project.widgetTypes.find((t) => t.type === widget.type)
  const update = (patch: Parameters<typeof updateWidget>[2], key?: string) => updateWidget(pageId, id, patch, key)
  return (
    <>
      <div className="inspector-head">
        <span className={`badge ${custom ? 'badge--violet' : ''}`}>{custom ? 'Custom widget' : 'Widget'}</span>
        <h3>{builtin?.name ?? custom?.name ?? widget.type}</h3>
      </div>
      <div className="inspector-body">
        {builtin ? <div className="hint" style={{ marginBottom: 12 }}>{builtin.description} SDK: <code>{builtin.sdkClass}</code></div> : null}
        <div className="field-row" style={{ marginBottom: 12 }}>
          <Field label="X (0–1)">
            <input className="input" type="number" step={0.01} min={0} max={1} value={widget.position.x} onChange={(e) => update({ position: { ...widget.position, x: Math.max(0, Math.min(1, Number(e.target.value))) } }, `pos:${id}`)} />
          </Field>
          <Field label="Y (0–1)">
            <input className="input" type="number" step={0.01} min={0} max={1} value={widget.position.y} onChange={(e) => update({ position: { ...widget.position, y: Math.max(0, Math.min(1, Number(e.target.value))) } }, `pos:${id}`)} />
          </Field>
        </div>
        <label className="check" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={widget.draggable} onChange={(e) => update({ draggable: e.target.checked })} />
          Can be moved by pinching on the mirror
        </label>

        {widget.type === 'text' ? <TextContentEditor content={widget.content} onChange={(content) => update({ content }, `content:${id}`)} /> : null}
        {['calendar', 'qr_gallery', 'games', 'news'].includes(widget.type) ? (
          <Field label="Caption">
            <input className="input" value={(widget.content as string) ?? ''} onChange={(e) => update({ content: e.target.value || null }, `content:${id}`)} />
          </Field>
        ) : null}
        {widget.type !== 'text' && widget.type !== 'drawing' ? (
          <DataSourceEditor source={widget.data} onChange={(data) => update({ data }, `data:${id}`)} refresh={widget.refreshInterval} onRefresh={(refreshInterval) => update({ refreshInterval }, `refresh:${id}`)} />
        ) : null}
        {custom ? <JsonField label="Props (widget.metadata)" value={widget.props} onChange={(props) => update({ props: props as Record<string, unknown> }, `props:${id}`)} rows={6} /> : null}

        <div className="actions">
          {custom ? (
            <button className="btn btn--primary" onClick={() => openWidgetEditor(custom.type)}>
              Edit code
            </button>
          ) : null}
          <button className="btn" onClick={() => duplicateWidget(pageId, id)}>
            Duplicate
          </button>
          <button className="btn btn--danger" onClick={() => removeWidget(pageId, id)}>
            Delete
          </button>
          <button className="btn btn--ghost" onClick={() => select({ kind: 'page', id: pageId })}>
            ← Page
          </button>
        </div>
      </div>
    </>
  )
}

function SettingsInspector() {
  const project = useStudio((s) => s.project)
  const { updateSettings, updateBinding, removeBinding, addBinding } = useStudio.getState()
  const config = project.settings.gestureConfig
  const setConfig = (key: keyof GestureConfig, value: number | boolean) => updateSettings({ gestureConfig: { ...config, [key]: value } })
  const screen = project.settings.screen
  return (
    <>
      <div className="inspector-head">
        <span className="badge">Project</span>
        <h3>{project.name}</h3>
      </div>
      <div className="inspector-body">
        <Field label="Mirror screen">
          <select className="select" value={`${screen.width}x${screen.height}`} onChange={(e) => {
            const [width, height] = e.target.value.split('x').map(Number)
            updateSettings({ screen: { width, height } })
          }}>
            {SCREEN_PRESETS.map((p) => (
              <option key={p.label} value={`${p.width}x${p.height}`}>
                {p.label}
              </option>
            ))}
            {!SCREEN_PRESETS.some((p) => p.width === screen.width && p.height === screen.height) ? <option value={`${screen.width}x${screen.height}`}>{`${screen.width}×${screen.height}`}</option> : null}
          </select>
        </Field>
        <Field label="Start page">
          <select className="select" value={project.settings.initialPage} onChange={(e) => updateSettings({ initialPage: e.target.value })}>
            {project.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="divider" />
        <div className="side-title">From any page</div>
        <div className="hint" style={{ marginBottom: 8 }}>
          Gestures that jump to a page wherever you are, checked before links. Draw them from the ★ node too.
        </div>
        <div className="list">
          {project.bindings.map((b) => (
            <div key={b.id} className="list-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
              <GestureSelect value={b.gesture} onChange={(gesture) => updateBinding(b.id, { gesture })} />
              <select className="select" value={b.action.page} onChange={(e) => updateBinding(b.id, { action: { kind: 'goto', page: e.target.value } })}>
                {project.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    → {p.name}
                  </option>
                ))}
              </select>
              <button className="btn btn--ghost btn--icon btn--danger" onClick={() => removeBinding(b.id)} aria-label="Remove">
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn--small" onClick={() => addBinding('right_click', project.settings.initialPage)}>
            + Add
          </button>
        </div>

        <div className="divider" />
        <div className="side-title">Gesture tuning</div>
        <NumberSetting project={project} label="Page change cooldown (s)" k="node_navigation_cooldown" onChange={setConfig} />
        <NumberSetting project={project} label="Swipe cooldown on widgets (s)" k="swipe_cooldown" onChange={setConfig} />
        <NumberSetting project={project} label="Scroll cooldown (s)" k="scroll_cooldown" onChange={setConfig} />
        <NumberSetting project={project} label="Widget reach (0–1 of screen)" k="target_radius" onChange={setConfig} />
        <label className="check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={config.allow_unmatched_single_edge_navigation} onChange={(e) => setConfig('allow_unmatched_single_edge_navigation', e.target.checked)} />
          Any gesture follows a page's only link
        </label>
        <button className="btn btn--small" onClick={() => updateSettings({ gestureConfig: { ...DEFAULT_GESTURE_CONFIG } })}>
          Reset to SDK defaults
        </button>

        <div className="divider" />
        <div className="hint">
          Your work is saved in this browser automatically. Export it (top right) to keep a copy, share it, or run it on a mirror with the <code>glasscube</code> Python package.
        </div>
      </div>
    </>
  )
}

function NumberSetting({ project, label, k, onChange }: { project: Project; label: string; k: keyof GestureConfig; onChange: (k: keyof GestureConfig, v: number) => void }) {
  return (
    <Field label={label}>
      <input className="input" type="number" step={0.05} min={0} value={project.settings.gestureConfig[k] as number} onChange={(e) => onChange(k, Math.max(0, Number(e.target.value) || 0))} />
    </Field>
  )
}
