import type { CustomWidgetType } from './project'

// Starting points for custom widgets. Each is plain source the user can edit.
export type WidgetTemplate = Omit<CustomWidgetType, 'type' | 'origin'> & { icon: string }

export const BLANK_SOURCE = `// One React component. It gets the widget the mirror sends: widget.data (from the data
// source), widget.metadata (the props you set), widget.content and widget.position.
// Only 'react' can be imported. The .widget class gives the mirror's pixel-art panel.
import { useState } from 'react'

export default function Widget({ widget }) {
  const [count, setCount] = useState(0)
  const title = widget.metadata?.title ?? 'My widget'

  return (
    <div className="widget">
      <h2>{title}</h2>
      <div className="widget-message">Rendered {count} time(s)</div>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  )
}
`

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    name: 'Clock',
    icon: '◷',
    description: 'Big pixel clock with the date, from the clock data source.',
    defaultData: { kind: 'clock', hour12: false },
    defaultProps: { showSeconds: true },
    source: `type ClockData = { time: string; seconds: string; date: string }

export default function Widget({ widget }) {
  const data: ClockData | null = widget.data
  const showSeconds = widget.metadata?.showSeconds !== false

  return (
    <div className="widget" style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-pixel-title)', fontSize: 'calc(var(--u) * 44)', color: 'var(--px-orange)' }}>
        {data?.time ?? '--:--'}
        {showSeconds ? <span style={{ fontSize: '0.45em', color: 'var(--px-silver)' }}>:{data?.seconds ?? '--'}</span> : null}
      </div>
      <div style={{ marginTop: 'calc(var(--px) * 2)' }}>{data?.date ?? ''}</div>
    </div>
  )
}
`,
  },
  {
    name: 'Countdown',
    icon: '⏳',
    description: 'Days, hours and minutes left until a date.',
    defaultData: { kind: 'clock', hour12: false },
    defaultProps: { title: 'Demo day', target: '2026-12-31T18:00:00' },
    source: `// Re-renders every second because its data source is the clock.
export default function Widget({ widget }) {
  const { title = 'Countdown', target } = widget.metadata ?? {}
  const left = Math.max(0, new Date(target).getTime() - Date.now())
  const days = Math.floor(left / 86400000)
  const hours = Math.floor(left / 3600000) % 24
  const minutes = Math.floor(left / 60000) % 60

  return (
    <div className="widget">
      <h2>{title}</h2>
      <div style={{ display: 'flex', gap: 'calc(var(--px) * 4)', justifyContent: 'center' }}>
        {[['days', days], ['hrs', hours], ['min', minutes]].map(([label, value]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-pixel-title)', fontSize: 'calc(var(--u) * 28)', color: 'var(--px-orange)' }}>{value}</div>
            <div>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
`,
  },
  {
    name: 'Quote',
    icon: '❝',
    description: 'One quote, changing every few seconds.',
    defaultData: { kind: 'clock', hour12: false },
    defaultProps: {
      every: 8,
      quotes: ['Stay hungry, stay foolish.', 'Simplicity is the soul of efficiency.', 'Make it work, make it right, make it fast.'],
    },
    source: `export default function Widget({ widget }) {
  const quotes: string[] = widget.metadata?.quotes ?? []
  const every = Number(widget.metadata?.every ?? 8)
  const index = quotes.length ? Math.floor(Date.now() / 1000 / every) % quotes.length : 0

  return (
    <div className="widget">
      <h2>Quote</h2>
      <div className="widget-message">“{quotes[index] ?? 'Add quotes in the props'}”</div>
    </div>
  )
}
`,
  },
  {
    name: 'Image',
    icon: '▨',
    description: 'A picture from a URL, with an optional caption.',
    defaultData: { kind: 'none' },
    defaultProps: { url: 'https://picsum.photos/seed/mirror/320/200', caption: 'Hello from the mirror', width: 320 },
    source: `export default function Widget({ widget }) {
  const { url, caption, width = 320 } = widget.metadata ?? {}

  return (
    <div className="widget" style={{ maxWidth: 'none' }}>
      {url ? <img src={url} alt={caption ?? ''} style={{ display: 'block', width: \`calc(var(--u) * \${width})\`, imageRendering: 'auto' }} /> : 'Set a url prop'}
      {caption ? <div style={{ marginTop: 'calc(var(--px) * 2)' }}>{caption}</div> : null}
    </div>
  )
}
`,
  },
  {
    name: 'Progress',
    icon: '▰',
    description: 'A labelled pixel progress bar (goal, fundraising, steps…).',
    defaultData: { kind: 'static', value: { value: 64, max: 100 } },
    defaultProps: { title: 'Goal', unit: '%' },
    source: `export default function Widget({ widget }) {
  const { value = 0, max = 100 } = widget.data ?? {}
  const { title = 'Progress', unit = '' } = widget.metadata ?? {}
  const cells = 12
  const filled = Math.round((Math.min(value, max) / max) * cells)

  return (
    <div className="widget">
      <h2>{title}</h2>
      <div style={{ display: 'flex', gap: 'var(--px)' }}>
        {Array.from({ length: cells }, (_, i) => (
          <div key={i} style={{ width: 'calc(var(--u) * 16)', height: 'calc(var(--u) * 24)', background: i < filled ? 'var(--px-orange)' : 'var(--px-indigo)' }} />
        ))}
      </div>
      <div style={{ marginTop: 'calc(var(--px) * 2)' }}>{value}{unit} / {max}{unit}</div>
    </div>
  )
}
`,
  },
  {
    name: 'Greeting',
    icon: '☺',
    description: 'Good morning / afternoon / evening, with a name.',
    defaultData: { kind: 'clock', hour12: false },
    defaultProps: { name: 'friend' },
    source: `export default function Widget({ widget }) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  return (
    <div className="widget">
      <div style={{ fontFamily: 'var(--font-pixel-title)', fontSize: 'calc(var(--u) * 18)', color: 'var(--px-orange)', lineHeight: 1.5 }}>
        Good {part},<br />{widget.metadata?.name ?? 'friend'}!
      </div>
    </div>
  )
}
`,
  },
]
