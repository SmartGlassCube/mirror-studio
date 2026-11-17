// The studio's project: everything needed to rebuild a mirror. Saved in the browser, exported as
// JSON or YAML, and (from glasscube 0.2.0) run on a real mirror by `glasscube run <file>`.
// Mapping to the SDK: pages = graph nodes, edges = graph edges, bindings = StateManager
// event_bindings, widgets = BaseWidget(widget_type, position, content, metadata=props, data_provider).

export const PROJECT_FORMAT = 'glasscube-project'
export const PROJECT_VERSION = 1

export type XY = { x: number; y: number }

// Where a widget's `data` comes from. On the mirror each one is a Python data provider.
export type DataSource =
  | { kind: 'none' }
  | { kind: 'static'; value: unknown }
  // OpenMeteoWeatherProvider: {city, temperature, humidity, wind, code, isDay}
  | { kind: 'weather'; city: string; latitude: number; longitude: number }
  // {time: "14:05", seconds: "07", date: "Tuesday 17 November", iso}
  | { kind: 'clock'; hour12: boolean }
  // GET a JSON URL; `path` ("a.b.0") picks part of the response.
  | { kind: 'http'; url: string; path: string }

export type DataSourceKind = DataSource['kind']

export type WidgetInstance = {
  id: string
  type: string
  position: XY // 0..1 fractions of the screen, the widget's center
  content: unknown // string | string[] | Record<string, string[]> for text widgets
  props: Record<string, unknown> // serialized as the widget's `metadata`
  data: DataSource
  refreshInterval: number // seconds between data refreshes
  draggable: boolean
}

export type Page = {
  id: string
  name: string
  canvas: XY // where the node sits on the studio's graph canvas
  widgets: WidgetInstance[]
}

// A gesture on page `from` shows page `to`.
export type Edge = {
  id: string
  from: string
  to: string
  gesture: string
}

// A gesture that works on every page (StateManager event_bindings), checked before edges.
export type Binding = {
  id: string
  gesture: string
  action: { kind: 'goto'; page: string }
}

// A widget type written in the studio: one React component, compiled in the browser.
export type CustomWidgetType = {
  type: string // the widget `type`, unique, [a-z][a-z0-9_]*
  name: string
  description: string
  source: string // TSX; `export default function Widget({ widget }) { ... }`
  origin: 'template' | 'code' | 'ai'
  defaultData: DataSource
  defaultProps: Record<string, unknown>
}

export type GestureConfig = {
  target_radius: number
  swipe_cooldown: number
  scroll_cooldown: number
  node_navigation_cooldown: number
  scroll_velocity_threshold: number
  allow_unmatched_single_edge_navigation: boolean
}

export type ProjectSettings = {
  initialPage: string
  screen: { width: number; height: number } // the mirror display, in pixels
  gestureConfig: GestureConfig
}

export type Project = {
  format: typeof PROJECT_FORMAT
  version: number
  name: string
  updatedAt: string
  settings: ProjectSettings
  pages: Page[]
  edges: Edge[]
  bindings: Binding[]
  widgetTypes: CustomWidgetType[]
}

// glasscube/config/json_config/default_gesture_config.json
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  target_radius: 0.35,
  swipe_cooldown: 0.3,
  scroll_cooldown: 0.25,
  node_navigation_cooldown: 0.8,
  scroll_velocity_threshold: 0.03,
  allow_unmatched_single_edge_navigation: false,
}

export const SCREEN_PRESETS = [
  { label: 'Portrait mirror 1080×1920', width: 1080, height: 1920 },
  { label: 'Landscape 1920×1080', width: 1920, height: 1080 },
  { label: 'Square 1080×1080', width: 1080, height: 1080 },
]

export const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'w_$1') || 'widget'

export function emptyProject(name = 'My mirror'): Project {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    updatedAt: new Date().toISOString(),
    settings: {
      initialPage: 'home',
      screen: { width: 1080, height: 1920 },
      gestureConfig: { ...DEFAULT_GESTURE_CONFIG },
    },
    pages: [{ id: 'home', name: 'Home', canvas: { x: 0, y: 0 }, widgets: [] }],
    edges: [],
    bindings: [],
    widgetTypes: [],
  }
}

export function uniquePageId(project: Project, name: string) {
  const base = slug(name) || 'page'
  let id = base
  for (let n = 2; project.pages.some((page) => page.id === id); n++) id = `${base}_${n}`
  return id
}

export function uniqueWidgetType(project: Project, name: string, taken: string[] = []) {
  const base = slug(name)
  const used = new Set([...project.widgetTypes.map((t) => t.type), ...taken])
  let type = base
  for (let n = 2; used.has(type); n++) type = `${base}_${n}`
  return type
}
