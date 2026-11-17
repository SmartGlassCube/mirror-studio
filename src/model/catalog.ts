import type { DataSource, WidgetInstance } from './project'
import { uid } from './project'

// The widget types built into the SDK (glasscube.widgets + the mirror UI's widgets/ folder).
export type BuiltinWidget = {
  type: string
  name: string
  icon: string
  description: string
  sdkClass: string
  // Text widgets cycle `content` items with swipes and scroll sections (apply_navigation).
  navigable?: boolean
  defaults: Pick<WidgetInstance, 'content' | 'props' | 'data' | 'refreshInterval' | 'draggable'>
}

const today = new Date()
const isoDay = (offset: number, hour: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, hour)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00:00`
}

const qr = (text: string) => `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`

export const PARIS: DataSource = { kind: 'weather', city: 'Paris', latitude: 48.8566, longitude: 2.3522 }

export const BUILTIN_WIDGETS: BuiltinWidget[] = [
  {
    type: 'text',
    name: 'Text',
    icon: 'Aa',
    sdkClass: 'TextWidget',
    navigable: true,
    description: 'Text that open-hand swipes cycle (left/right) and scrolls page through (sections).',
    defaults: {
      content: { welcome: ['Hello!', 'Swipe to see the next line'], tips: ['Two fingers swipe to change page'] },
      props: {},
      data: { kind: 'none' },
      refreshInterval: 300,
      draggable: true,
    },
  },
  {
    type: 'weather',
    name: 'Weather',
    icon: '☀',
    sdkClass: 'WeatherWidget + OpenMeteoWeatherProvider',
    description: 'Current weather from Open-Meteo, no API key.',
    defaults: { content: null, props: {}, data: PARIS, refreshInterval: 600, draggable: true },
  },
  {
    type: 'calendar',
    name: 'Calendar',
    icon: '▦',
    sdkClass: 'CalendarWidget',
    description: 'Month grid with the upcoming events.',
    defaults: {
      content: 'Upcoming',
      props: {},
      data: {
        kind: 'static',
        value: {
          events: [
            { title: 'Standup', start: isoDay(0, 9) },
            { title: 'Demo day', start: isoDay(2, 14) },
            { title: 'Workshop', start: isoDay(5, 18) },
          ],
        },
      },
      refreshInterval: 60,
      draggable: true,
    },
  },
  {
    type: 'news',
    name: 'News ticker',
    icon: '≡',
    sdkClass: 'NewsWidget',
    description: 'A scrolling ticker of announcements.',
    defaults: {
      content: null,
      props: {},
      data: {
        kind: 'static',
        value: {
          items: [
            { id: '1', kind: 'announcement', title: 'Welcome', body: 'This mirror was built without code.' },
            { id: '2', kind: 'achievement', title: 'New record', body: 'The team shipped version 0.1.0.' },
          ],
        },
      },
      refreshInterval: 30,
      draggable: true,
    },
  },
  {
    type: 'events',
    name: 'Event cards',
    icon: '▤',
    sdkClass: 'EventsWidget',
    description: 'Cards for events or projects, with images.',
    defaults: {
      content: null,
      props: {},
      data: {
        kind: 'static',
        value: {
          items: [
            { id: 'e1', name: 'Hackathon', description: '24 hours of building.', date: isoDay(3, 10) },
            { id: 'e2', name: 'Robotics fair', description: 'Bring your robots.', date: isoDay(9, 15) },
          ],
        },
      },
      refreshInterval: 30,
      draggable: false,
    },
  },
  {
    type: 'qr_gallery',
    name: 'QR gallery',
    icon: '▣',
    sdkClass: 'QRGalleryWidget + QRCodeCatalogProvider',
    description: 'QR codes grouped by category.',
    defaults: {
      content: 'Scan me',
      props: {},
      data: {
        kind: 'static',
        value: { categories: { links: [{ title: 'Smart Mirror SDK', url: 'https://github.com/SmartGlassCube', imageUrl: qr('https://github.com/SmartGlassCube') }] } },
      },
      refreshInterval: 120,
      draggable: true,
    },
  },
  {
    type: 'games',
    name: 'Games grid',
    icon: '◈',
    sdkClass: 'GamesWidget',
    description: 'Tiles for computer-vision games.',
    defaults: {
      content: null,
      props: {},
      data: { kind: 'static', value: { games: [1, 2, 3, 4].map((n) => ({ id: `game-${n}`, title: 'Coming soon' })) } },
      refreshInterval: 300,
      draggable: false,
    },
  },
  {
    type: 'drawing',
    name: 'Drawing canvas',
    icon: '✎',
    sdkClass: 'DrawingWidget',
    description: 'Draw by pinching. Left click: colour; open-hand swipes: brush size; swipe up: clear.',
    defaults: {
      content: null,
      props: {},
      data: { kind: 'static', value: { color: '#d5d5d5', size: 1, clears: 0 } },
      refreshInterval: 300,
      draggable: false,
    },
  },
]

export const builtinWidget = (type: string) => BUILTIN_WIDGETS.find((w) => w.type === type)

export const BUILTIN_TYPES = BUILTIN_WIDGETS.map((w) => w.type)

export function newWidgetInstance(
  type: string,
  defaults: BuiltinWidget['defaults'],
  position = { x: 0.5, y: 0.3 },
): WidgetInstance {
  return {
    id: uid(type),
    type,
    position,
    content: structuredClone(defaults.content),
    props: structuredClone(defaults.props),
    data: structuredClone(defaults.data),
    refreshInterval: defaults.refreshInterval,
    draggable: defaults.draggable,
  }
}
