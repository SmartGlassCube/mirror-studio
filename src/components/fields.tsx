import { useEffect, useState, type ReactNode } from 'react'
import type { DataSource, DataSourceKind } from '../model/project'
import { dataFor } from '../runtime/dataSources'

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

// A JSON value edited as text; only valid JSON is committed.
export function JsonField({ value, onChange, rows = 6, label, hint }: { value: unknown; onChange: (value: unknown) => void; rows?: number; label: string; hint?: ReactNode }) {
  const pretty = JSON.stringify(value ?? null, null, 2)
  const [text, setText] = useState(pretty)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    // Follow outside changes (undo, another editor) unless the user is mid-edit with an error.
    setText((current) => {
      try {
        return JSON.stringify(JSON.parse(current)) === JSON.stringify(value ?? null) ? current : pretty
      } catch {
        return current
      }
    })
  }, [pretty, value])
  return (
    <Field label={label} hint={error ? <span className="error-text">{error}</span> : hint}>
      <textarea
        className={`textarea${error ? ' textarea--invalid' : ''}`}
        rows={rows}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          try {
            const parsed = JSON.parse(e.target.value)
            setError(null)
            onChange(parsed)
          } catch (err) {
            setError((err as Error).message)
          }
        }}
      />
    </Field>
  )
}

export const DATA_KINDS: { kind: DataSourceKind; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'static', label: 'Fixed data (JSON)' },
  { kind: 'clock', label: 'Clock (every second)' },
  { kind: 'weather', label: 'Weather (Open-Meteo)' },
  { kind: 'http', label: 'Web API (JSON URL)' },
]

export function defaultSource(kind: DataSourceKind): DataSource {
  switch (kind) {
    case 'none':
      return { kind }
    case 'static':
      return { kind, value: { value: 42 } }
    case 'clock':
      return { kind, hour12: false }
    case 'weather':
      return { kind, city: 'Paris', latitude: 48.8566, longitude: 2.3522 }
    case 'http':
      return { kind, url: 'https://dummyjson.com/quotes/random', path: '' }
  }
}

export function DataSourceEditor({ source, onChange, refresh, onRefresh }: { source: DataSource; onChange: (s: DataSource) => void; refresh?: number; onRefresh?: (n: number) => void }) {
  const live = dataFor(source)
  return (
    <div>
      <Field label="Data source">
        <select className="select" value={source.kind} onChange={(e) => onChange(defaultSource(e.target.value as DataSourceKind))}>
          {DATA_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      {source.kind === 'static' ? <JsonField label="Data" value={source.value} onChange={(value) => onChange({ ...source, value })} rows={8} hint="Becomes widget.data as is." /> : null}
      {source.kind === 'clock' ? (
        <label className="check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={source.hour12} onChange={(e) => onChange({ ...source, hour12: e.target.checked })} /> 12-hour clock
        </label>
      ) : null}
      {source.kind === 'weather' ? <WeatherFields source={source} onChange={onChange} /> : null}
      {source.kind === 'http' ? (
        <>
          <Field label="URL" hint="Fetched by the browser here (needs CORS) and by the mirror's Python on the device.">
            <input className="input" value={source.url} onChange={(e) => onChange({ ...source, url: e.target.value })} />
          </Field>
          <Field label="Path in the response" hint='Optional, like "quote" or "items.0.title".'>
            <input className="input" value={source.path} onChange={(e) => onChange({ ...source, path: e.target.value })} />
          </Field>
        </>
      ) : null}
      {onRefresh && source.kind !== 'none' && source.kind !== 'static' && source.kind !== 'clock' ? (
        <Field label="Refresh every (seconds)">
          <input className="input" type="number" min={5} value={refresh} onChange={(e) => onRefresh(Math.max(5, Number(e.target.value) || 5))} />
        </Field>
      ) : null}
      {source.kind !== 'none' && source.kind !== 'static' ? (
        <div className="hint">
          {live.error ? <span className="error-text">{live.error}</span> : live.loading && live.value == null ? 'Loading…' : <>Now: <code>{JSON.stringify(live.value)?.slice(0, 160)}</code></>}
        </div>
      ) : null}
    </div>
  )
}

function WeatherFields({ source, onChange }: { source: Extract<DataSource, { kind: 'weather' }>; onChange: (s: DataSource) => void }) {
  const [query, setQuery] = useState(source.city)
  const [status, setStatus] = useState<string | null>(null)
  const search = async () => {
    setStatus('Searching…')
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(query)}`)
      const hit = (await response.json()).results?.[0]
      if (!hit) return setStatus('No such place')
      onChange({ kind: 'weather', city: hit.name, latitude: hit.latitude, longitude: hit.longitude })
      setStatus(`${hit.name}, ${hit.country ?? ''}`)
    } catch {
      setStatus('Search failed')
    }
  }
  return (
    <>
      <Field label="City" hint={status ?? `${source.latitude.toFixed(3)}, ${source.longitude.toFixed(3)}`}>
        <div className="field-row">
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <button className="btn" style={{ flex: 'none' }} onClick={search}>
            Find
          </button>
        </div>
      </Field>
    </>
  )
}

// Text widget content: "# section" lines start a section, other lines are items.
export function textToContent(text: string): unknown {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.some((l) => l.startsWith('#'))) return lines.length > 1 ? lines : lines[0] ?? ''
  const sections: Record<string, string[]> = {}
  let current = 'main'
  for (const line of lines) {
    if (line.startsWith('#')) {
      current = line.replace(/^#+/, '').trim() || 'section'
      sections[current] ??= []
    } else (sections[current] ??= []).push(line)
  }
  return sections
}

export function contentToText(content: unknown): string {
  if (Array.isArray(content)) return content.join('\n')
  if (content && typeof content === 'object') {
    return Object.entries(content as Record<string, string[]>)
      .map(([key, items]) => `# ${key}\n${(items ?? []).join('\n')}`)
      .join('\n\n')
  }
  return content == null ? '' : String(content)
}

export function TextContentEditor({ content, onChange }: { content: unknown; onChange: (c: unknown) => void }) {
  const [text, setText] = useState(() => contentToText(content))
  useEffect(() => {
    setText((current) => (JSON.stringify(textToContent(current)) === JSON.stringify(content) ? current : contentToText(content)))
  }, [content])
  return (
    <Field label="Lines" hint={<>One line per item; an open-hand swipe shows the next. Start a line with <code>#</code> to begin a section (scroll or swipe up/down).</>}>
      <textarea
        className="textarea"
        rows={7}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(textToContent(e.target.value))
        }}
      />
    </Field>
  )
}
