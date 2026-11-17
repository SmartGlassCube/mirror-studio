import yaml from 'js-yaml'
import { compileWidgetSource } from '../mirror/customWidgets'
import type { Project } from './project'
import { DEFAULT_GESTURE_CONFIG, PROJECT_FORMAT, PROJECT_VERSION } from './project'

export type ExportFormat = 'json' | 'yaml'

// The exported file also carries each custom widget compiled to plain JS (`compiled`), so the
// mirror can load it without a TypeScript/JSX compiler. The studio ignores it on import.
export function exportProject(project: Project, format: ExportFormat): string {
  const file = {
    ...project,
    updatedAt: new Date().toISOString(),
    widgetTypes: project.widgetTypes.map((type) => {
      const result = compileWidgetSource(type.source)
      return { ...type, compiled: result.ok ? result.code : null }
    }),
  }
  return format === 'json' ? JSON.stringify(file, null, 2) : yaml.dump(file, { lineWidth: 120, noRefs: true })
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileName(project: Project, format: ExportFormat) {
  const base = project.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mirror'
  return `${base}.smartmirror.${format === 'json' ? 'json' : 'yaml'}`
}

export class ImportError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Parses a JSON or YAML file and checks its shape, filling defaults for anything optional.
export function parseProject(text: string): Project {
  let raw: unknown
  try {
    raw = text.trimStart().startsWith('{') ? JSON.parse(text) : yaml.load(text)
  } catch (error) {
    throw new ImportError(`Not valid JSON or YAML: ${(error as Error).message}`)
  }
  if (!isObject(raw)) throw new ImportError('The file is not a project.')
  if (raw.format !== PROJECT_FORMAT) throw new ImportError(`Not a Smart Mirror Studio project (format should be "${PROJECT_FORMAT}").`)
  if (typeof raw.version !== 'number' || raw.version > PROJECT_VERSION) {
    throw new ImportError(`This project was made by a newer studio (version ${String(raw.version)}).`)
  }
  if (!Array.isArray(raw.pages) || raw.pages.length === 0) throw new ImportError('The project has no pages.')

  const pages = raw.pages.map((page, i) => {
    if (!isObject(page) || typeof page.id !== 'string') throw new ImportError(`Page ${i + 1} has no id.`)
    const widgets = Array.isArray(page.widgets) ? page.widgets : []
    return {
      id: page.id,
      name: typeof page.name === 'string' ? page.name : page.id,
      canvas: isObject(page.canvas) ? { x: Number(page.canvas.x) || 0, y: Number(page.canvas.y) || 0 } : { x: i * 320, y: 0 },
      widgets: widgets.map((widget, j) => {
        if (!isObject(widget) || typeof widget.type !== 'string') throw new ImportError(`Widget ${j + 1} on page "${page.id}" has no type.`)
        const position = isObject(widget.position) ? widget.position : {}
        return {
          id: typeof widget.id === 'string' ? widget.id : `${widget.type}-${j + 1}`,
          type: widget.type,
          position: { x: clamp01(Number(position.x ?? 0.5)), y: clamp01(Number(position.y ?? 0.5)) },
          content: widget.content ?? null,
          props: isObject(widget.props) ? widget.props : {},
          data: isObject(widget.data) && typeof widget.data.kind === 'string' ? (widget.data as Project['pages'][0]['widgets'][0]['data']) : { kind: 'none' as const },
          refreshInterval: Number(widget.refreshInterval) || 300,
          draggable: widget.draggable !== false,
        }
      }),
    }
  })
  const pageIds = new Set(pages.map((p) => p.id))
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(isObject) : [])
  const settings = isObject(raw.settings) ? raw.settings : {}
  const screen = isObject(settings.screen) ? settings.screen : {}

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: typeof raw.name === 'string' ? raw.name : 'Imported mirror',
    updatedAt: new Date().toISOString(),
    settings: {
      initialPage: typeof settings.initialPage === 'string' && pageIds.has(settings.initialPage) ? settings.initialPage : pages[0].id,
      screen: { width: Number(screen.width) || 1080, height: Number(screen.height) || 1920 },
      gestureConfig: { ...DEFAULT_GESTURE_CONFIG, ...(isObject(settings.gestureConfig) ? settings.gestureConfig : {}) },
    },
    pages,
    edges: list(raw.edges)
      .filter((e) => typeof e.from === 'string' && typeof e.to === 'string' && typeof e.gesture === 'string')
      .map((e, i) => ({ id: typeof e.id === 'string' ? e.id : `edge-${i}`, from: e.from as string, to: e.to as string, gesture: e.gesture as string })),
    bindings: list(raw.bindings)
      .filter((b) => typeof b.gesture === 'string' && isObject(b.action) && typeof b.action.page === 'string')
      .map((b, i) => ({
        id: typeof b.id === 'string' ? b.id : `binding-${i}`,
        gesture: b.gesture as string,
        action: { kind: 'goto' as const, page: (b.action as { page: string }).page },
      })),
    widgetTypes: list(raw.widgetTypes)
      .filter((t) => typeof t.type === 'string' && typeof t.source === 'string')
      .map((t) => ({
        type: t.type as string,
        name: typeof t.name === 'string' ? t.name : (t.type as string),
        description: typeof t.description === 'string' ? t.description : '',
        source: t.source as string,
        origin: t.origin === 'ai' || t.origin === 'template' ? t.origin : 'code',
        defaultData: isObject(t.defaultData) && typeof t.defaultData.kind === 'string' ? (t.defaultData as Project['widgetTypes'][0]['defaultData']) : { kind: 'none' },
        defaultProps: isObject(t.defaultProps) ? t.defaultProps : {},
      })),
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5)
