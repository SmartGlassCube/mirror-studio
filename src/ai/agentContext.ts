import type { DataSource } from '../model/project'
import { dataFor } from '../runtime/dataSources'
import { WIDGET_TEMPLATES } from '../model/templates'

const describeSource = (source: DataSource): string => {
  switch (source.kind) {
    case 'none':
      return '`none`: `widget.data` is null. Put everything the widget needs in props.'
    case 'static':
      return '`static`: fixed JSON set in the studio.'
    case 'clock':
      return '`clock`: `{ time: "14:05", seconds: "07", date: "Tuesday 17 November", iso }`, refreshed every second (so the widget re-renders every second; no timers needed).'
    case 'weather':
      return '`weather` (Open-Meteo): `{ city, temperature (°C), humidity (%), wind (km/h), code (WMO weather code), isDay (boolean) }`.'
    case 'http':
      return `\`http\`: the JSON from ${source.url}${source.path ? ` at path "${source.path}"` : ''}, refetched periodically.`
  }
}

const sample = (value: unknown) => {
  const text = JSON.stringify(value, null, 2) ?? 'null'
  return text.length > 1500 ? `${text.slice(0, 1500)}\n… (truncated)` : text
}

export type WidgetBrief = {
  name?: string
  description?: string
  source?: string
  data?: DataSource
  props?: Record<string, unknown>
}

// Everything an outside coding agent (or Gemini) needs to write a widget that runs in the studio
// and, unchanged, on the mirror.
export function widgetAgentContext(brief: WidgetBrief = {}): string {
  const example = WIDGET_TEMPLATES[0]
  const data = brief.data ?? { kind: 'none' }
  const current = dataFor(data).value
  return `# Writing a Smart Mirror widget

You are writing one React component for a gesture-controlled smart mirror (the open-source
\`glasscube\` SDK, https://github.com/SmartGlassCube/Smart-Mirror-SDK). It is designed in Smart
Mirror Studio and later runs unchanged on the mirror's display (a 1080×1920 portrait screen behind
two-way glass, so black is see-through and bright colours glow).

## The contract

- Exactly one file, TSX or JSX. \`export default function Widget({ widget }) { … }\`.
- The only import allowed is \`react\` (\`import { useState, useEffect, useMemo } from 'react'\`).
  No other packages, no CSS imports, no \`fetch\`: data arrives through \`widget.data\`.
- \`widget\` is:
  \`\`\`ts
  type MirrorWidget = {
    id: string
    type: string
    position: { x: number; y: number }   // 0..1, where the widget's center sits on the screen
    content: string | null                // optional caption
    data: unknown                         // from the widget's data source (below); may be null while loading
    metadata: Record<string, unknown>     // the props the user sets in the studio
    dragging: boolean                     // true while a user pinches and moves it
  }
  \`\`\`
- Handle \`widget.data\` being null or partial (it is null until the first fetch completes).
- Nobody can click, hover or type: the mirror is controlled with hand gestures, which move
  between pages. Don't build buttons or inputs; the widget only shows things.
- Render a single root element with \`className="widget"\` to get the mirror's pixel-art panel.

## Look and sizing

- Size everything with \`calc(var(--u) * N)\`: \`--u\` is one design pixel (the design is about
  1080 units wide). \`--px\` = 4 units, the pixel grid step for paddings and borders.
- Colours: \`var(--px-black)\` #000, \`var(--px-silver)\` #d5d5d5 (text), \`var(--px-orange)\` #fd7a33
  (accents, headings), \`var(--px-purple)\` #ab32ac, \`var(--px-indigo)\` #4341aa.
- Fonts: \`var(--font-pixel-title)\` (Press Start 2P, headings and big numbers) and
  \`var(--font-pixel-body)\` (VT323, the default body text, already set).
- Inside \`.widget\`: an \`<h2>\` is the styled title; \`.widget-message\` keeps a line of text from
  jumping. Use inline styles for the rest. Width: \`.widget\` is 240 to 340 units by default; set
  \`maxWidth: 'none'\` in its style when you need more.

## This widget

- Name: ${brief.name ?? '(new widget)'}
- What it should do: ${brief.description || '(describe it)'}
- Data source: ${describeSource(data)}
- \`widget.data\` right now:
\`\`\`json
${sample(current)}
\`\`\`
- \`widget.metadata\` (props) right now:
\`\`\`json
${sample(brief.props ?? {})}
\`\`\`
Read props with defaults (\`widget.metadata?.title ?? 'Title'\`) and say in a top comment which
props the widget reads, so the user can set them.

## Example (the built-in Clock template)

\`\`\`tsx
${example.source.trim()}
\`\`\`
${brief.source ? `\n## Current code\n\n\`\`\`tsx\n${brief.source.trim()}\n\`\`\`\n` : ''}
## Answer with

The complete file in a single \`\`\`tsx block, nothing else needed. It is pasted into the studio's
code editor as is.
`
}

// Pulls the code out of a reply: the first fenced block, or the whole text when there is none.
export function extractCode(reply: string): string {
  const match = reply.match(/```(?:tsx|jsx|typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/)
  return (match ? match[1] : reply).trim() + '\n'
}
