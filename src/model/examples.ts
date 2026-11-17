import { BUILTIN_WIDGETS, newWidgetInstance } from './catalog'
import type { CustomWidgetType, Project, WidgetInstance } from './project'
import { emptyProject } from './project'
import { WIDGET_TEMPLATES } from './templates'

const builtin = (type: string, position: { x: number; y: number }, patch: Partial<WidgetInstance> = {}) => ({
  ...newWidgetInstance(type, BUILTIN_WIDGETS.find((w) => w.type === type)!.defaults, position),
  ...patch,
})

const fromTemplate = (name: string, type: string): CustomWidgetType => {
  const t = WIDGET_TEMPLATES.find((x) => x.name === name)!
  return { type, name: t.name, description: t.description, source: t.source, origin: 'template', defaultData: t.defaultData, defaultProps: t.defaultProps }
}

// What a first visit opens: three pages linked by two-finger swipes, plus a "home" gesture.
export function demoProject(): Project {
  const project = emptyProject('Demo mirror')
  const clock = fromTemplate('Clock', 'clock')
  const greeting = fromTemplate('Greeting', 'greeting')
  project.widgetTypes = [clock, greeting]
  project.pages = [
    {
      id: 'home',
      name: 'Home',
      canvas: { x: 0, y: 0 },
      widgets: [
        { ...newWidgetInstance('clock', { content: null, props: clock.defaultProps, data: clock.defaultData, refreshInterval: 1, draggable: true }, { x: 0.5, y: 0.12 }) },
        builtin('weather', { x: 0.25, y: 0.36 }),
        { ...newWidgetInstance('greeting', { content: null, props: { name: 'maker' }, data: greeting.defaultData, refreshInterval: 60, draggable: true }, { x: 0.72, y: 0.36 }) },
        builtin('text', { x: 0.5, y: 0.62 }, { content: { tips: ['Two fingers → swipe: agenda', 'Two fingers ← swipe: drawing', 'Open hand swipe: next tip'], about: ['Built in Smart Mirror Studio', 'Runs on the glasscube SDK'] } }),
      ],
    },
    {
      id: 'agenda',
      name: 'Agenda',
      canvas: { x: 420, y: -120 },
      widgets: [builtin('calendar', { x: 0.5, y: 0.25 }), builtin('news', { x: 0.5, y: 0.62 })],
    },
    {
      id: 'draw',
      name: 'Drawing',
      canvas: { x: 420, y: 200 },
      widgets: [builtin('drawing', { x: 0, y: 0 })],
    },
  ]
  project.edges = [
    { id: 'e-home-agenda', from: 'home', to: 'agenda', gesture: 'two_fingers_swipe_right' },
    { id: 'e-agenda-home', from: 'agenda', to: 'home', gesture: 'two_fingers_swipe_left' },
    { id: 'e-home-draw', from: 'home', to: 'draw', gesture: 'two_fingers_swipe_left' },
    { id: 'e-draw-home', from: 'draw', to: 'home', gesture: 'two_fingers_swipe_right' },
  ]
  project.bindings = [{ id: 'b-home', gesture: 'right_click', action: { kind: 'goto', page: 'home' } }]
  return project
}
