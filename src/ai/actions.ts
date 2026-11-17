import { widgetAgentContext } from './agentContext'
import { BUILTIN_WIDGETS, builtinWidget, newWidgetInstance } from '../model/catalog'
import { GESTURES } from '../model/gestures'
import type { DataSource, Project } from '../model/project'
import { slug, uniquePageId, uniqueWidgetType } from '../model/project'
import { compileWidgetSource } from '../mirror/customWidgets'

// What the assistant may do to a project. It answers {"reply", "actions"}; the user reviews the
// list and applies it in one undoable step.
export type Action = Record<string, unknown> & { op: string }

export type AssistantReply = { reply: string; actions: Action[] }

export function projectSummary(project: Project): string {
  return JSON.stringify(
    {
      name: project.name,
      screen: project.settings.screen,
      startPage: project.settings.initialPage,
      pages: project.pages.map((p) => ({
        id: p.id,
        name: p.name,
        widgets: p.widgets.map((w) => ({ type: w.type, x: w.position.x, y: w.position.y, data: w.data.kind, ...(w.type === 'text' ? { content: w.content } : {}) })),
      })),
      links: project.edges.map((e) => ({ from: e.from, to: e.to, gesture: e.gesture })),
      anyPageGestures: project.bindings.map((b) => ({ gesture: b.gesture, to: b.action.page })),
      customWidgetTypes: project.widgetTypes.map((t) => ({ type: t.type, name: t.name, description: t.description })),
    },
    null,
    1,
  )
}

export function builderSystemPrompt(project: Project): string {
  return `You are the assistant inside Smart Mirror Studio, a no-code editor for gesture-controlled smart
mirrors built on the open-source "glasscube" Python SDK. Users are often beginners: be brief,
friendly and concrete.

A project is a graph: PAGES (screens of widgets) linked by GESTURES the webcam recognizes. Widgets
are placed with x/y from 0 to 1 (the widget's center; 0,0 is the top-left of the screen).

Gestures (use these exact names):
${GESTURES.map((g) => `- ${g.name}: ${g.how}`).join('\n')}
Conventions: two-finger swipes change pages (left/right pairs, so the user can go back);
open-hand swipes are kept for widgets (they cycle text lines), and pinching moves widgets.

Built-in widget types:
${BUILTIN_WIDGETS.map((w) => `- ${w.type}: ${w.description}`).join('\n')}

Data sources for a widget's "data" field:
{"kind":"none"} | {"kind":"static","value":<any JSON>} | {"kind":"clock","hour12":false}
| {"kind":"weather","city":"Paris","latitude":48.85,"longitude":2.35} | {"kind":"http","url":"https://…","path":""}

Always answer with ONE JSON object: {"reply": "<what you did or your answer, 1-4 sentences>", "actions": [ … ]}.
"actions" is empty when the user only asks a question. Available actions:
- {"op":"add_page","id":"agenda","name":"Agenda"}
- {"op":"rename_page","page":"agenda","name":"My agenda"}
- {"op":"remove_page","page":"agenda"}
- {"op":"set_start_page","page":"home"}
- {"op":"add_link","from":"home","to":"agenda","gesture":"two_fingers_swipe_right"}
- {"op":"remove_link","from":"home","gesture":"two_fingers_swipe_right"}
- {"op":"add_any_page_gesture","gesture":"right_click","to":"home"}
- {"op":"add_widget","page":"home","type":"weather","x":0.5,"y":0.2,"data":{…},"props":{…},"lines":["…"],"caption":"…"}
  ("lines" only for text widgets: a list of strings, or {"section":["line",…]} for sections)
- {"op":"remove_widget","page":"home","type":"weather"}
- {"op":"move_widget","page":"home","type":"weather","x":0.2,"y":0.1}
- {"op":"create_widget_type","type":"countdown","name":"Countdown","description":"…","source":"<full TSX file>","defaultData":{…},"defaultProps":{…}}
- {"op":"update_widget_type","type":"countdown","source":"<full TSX file>"}
Use create_widget_type when no built-in widget fits, then add_widget with its type. Page ids and
widget types are lowercase with underscores. Spread widgets so they don't overlap (vary y by
about 0.18 on a portrait screen). Prefer adding back links for every page link.

How to write a custom widget's "source":
${widgetAgentContext().split('## This widget')[0].replace('# Writing a Smart Mirror widget', '').trim()}

The current project:
${projectSummary(project)}`
}

export function parseReply(text: string): AssistantReply {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')
  try {
    const parsed = JSON.parse(cleaned)
    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : '',
      actions: Array.isArray(parsed.actions) ? parsed.actions.filter((a: unknown) => a && typeof a === 'object' && typeof (a as Action).op === 'string') : [],
    }
  } catch {
    return { reply: text, actions: [] }
  }
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const num01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback)
const isSource = (v: unknown): v is DataSource => !!v && typeof v === 'object' && ['none', 'static', 'clock', 'weather', 'http'].includes(String((v as DataSource).kind))

export function describeAction(a: Action): string {
  switch (a.op) {
    case 'add_page':
      return `Add page "${str(a.name, str(a.id))}"`
    case 'rename_page':
      return `Rename ${str(a.page)} to "${str(a.name)}"`
    case 'remove_page':
      return `Delete page ${str(a.page)}`
    case 'set_start_page':
      return `Start on ${str(a.page)}`
    case 'add_link':
      return `Link ${str(a.from)} → ${str(a.to)} on ${str(a.gesture)}`
    case 'remove_link':
      return `Remove ${str(a.gesture)} link from ${str(a.from)}`
    case 'add_any_page_gesture':
      return `${str(a.gesture)} from any page → ${str(a.to)}`
    case 'add_widget':
      return `Add ${str(a.type)} to ${str(a.page)}`
    case 'remove_widget':
      return `Remove ${str(a.type)} from ${str(a.page)}`
    case 'move_widget':
      return `Move ${str(a.type)} on ${str(a.page)}`
    case 'create_widget_type':
      return `Create widget "${str(a.name, str(a.type))}"`
    case 'update_widget_type':
      return `Rewrite widget ${str(a.type)}`
    default:
      return `Unknown step "${a.op}" (skipped)`
  }
}

// Applies the actions to a copy of the project. Unknown or invalid steps are skipped and reported.
export function applyActions(input: Project, actions: Action[]): { project: Project; errors: string[] } {
  const project: Project = structuredClone(input)
  const errors: string[] = []
  const typeAlias = new Map<string, string>() // asked type -> actual (deduplicated) type
  const pageAlias = new Map<string, string>()
  const pageId = (v: unknown) => pageAlias.get(str(v)) ?? str(v)
  const page = (v: unknown) => project.pages.find((p) => p.id === pageId(v))
  const knownType = (t: string) => !!builtinWidget(t) || project.widgetTypes.some((w) => w.type === t)

  for (const a of actions) {
    const fail = (why: string) => errors.push(`${describeAction(a)}: ${why}`)
    switch (a.op) {
      case 'add_page': {
        const wanted = slug(str(a.id, str(a.name, 'page')))
        const id = project.pages.some((p) => p.id === wanted) ? uniquePageId(project, wanted) : wanted
        pageAlias.set(str(a.id, wanted), id)
        const last = project.pages[project.pages.length - 1]
        project.pages.push({ id, name: str(a.name, id), canvas: { x: (last?.canvas.x ?? 0) + 320, y: (last?.canvas.y ?? 0) + (project.pages.length % 2 ? 140 : -140) }, widgets: [] })
        break
      }
      case 'rename_page': {
        const p = page(a.page)
        if (!p) fail('no such page')
        else p.name = str(a.name, p.name)
        break
      }
      case 'remove_page': {
        const p = page(a.page)
        if (!p || project.pages.length <= 1) {
          fail(p ? 'the last page stays' : 'no such page')
          break
        }
        project.pages = project.pages.filter((x) => x !== p)
        project.edges = project.edges.filter((e) => e.from !== p.id && e.to !== p.id)
        project.bindings = project.bindings.filter((b) => b.action.page !== p.id)
        if (project.settings.initialPage === p.id) project.settings.initialPage = project.pages[0].id
        break
      }
      case 'set_start_page': {
        const p = page(a.page)
        if (!p) fail('no such page')
        else project.settings.initialPage = p.id
        break
      }
      case 'add_link': {
        const from = page(a.from)
        const to = page(a.to)
        const gesture = str(a.gesture)
        if (!from || !to) fail('no such page')
        else if (!gesture) fail('no gesture')
        else if (project.edges.some((e) => e.from === from.id && e.gesture === gesture)) fail(`${from.name} already uses ${gesture}`)
        else project.edges.push({ id: `edge-${Math.random().toString(36).slice(2, 8)}`, from: from.id, to: to.id, gesture })
        break
      }
      case 'remove_link':
        project.edges = project.edges.filter((e) => !(e.from === pageId(a.from) && e.gesture === str(a.gesture)))
        break
      case 'add_any_page_gesture': {
        const to = page(a.to)
        if (!to) fail('no such page')
        else project.bindings.push({ id: `binding-${Math.random().toString(36).slice(2, 8)}`, gesture: str(a.gesture, 'right_click'), action: { kind: 'goto', page: to.id } })
        break
      }
      case 'add_widget': {
        const p = page(a.page)
        const type = typeAlias.get(str(a.type)) ?? str(a.type)
        if (!p) {
          fail('no such page')
          break
        }
        if (!knownType(type)) {
          fail(`unknown widget type "${type}"`)
          break
        }
        const builtin = builtinWidget(type)
        const custom = project.widgetTypes.find((t) => t.type === type)
        const defaults = builtin
          ? builtin.defaults
          : { content: null, props: custom!.defaultProps, data: custom!.defaultData, refreshInterval: custom!.defaultData.kind === 'clock' ? 1 : 300, draggable: true }
        const widget = newWidgetInstance(type, defaults, { x: num01(a.x, 0.5), y: num01(a.y, 0.3) })
        if (isSource(a.data)) widget.data = a.data
        if (a.props && typeof a.props === 'object') widget.props = { ...widget.props, ...(a.props as Record<string, unknown>) }
        if (type === 'text' && a.lines) widget.content = a.lines
        if (typeof a.caption === 'string') widget.content = a.caption
        p.widgets.push(widget)
        break
      }
      case 'remove_widget':
      case 'move_widget': {
        const p = page(a.page)
        const type = typeAlias.get(str(a.type)) ?? str(a.type)
        const widget = p?.widgets.find((w) => w.type === type)
        if (!p || !widget) {
          fail('not found')
          break
        }
        if (a.op === 'remove_widget') p.widgets = p.widgets.filter((w) => w !== widget)
        else widget.position = { x: num01(a.x, widget.position.x), y: num01(a.y, widget.position.y) }
        break
      }
      case 'create_widget_type': {
        const source = str(a.source)
        if (!source) {
          fail('no source code')
          break
        }
        const asked = slug(str(a.type, str(a.name, 'widget')))
        const type = knownType(asked) ? uniqueWidgetType(project, asked, BUILTIN_WIDGETS.map((w) => w.type)) : asked
        typeAlias.set(str(a.type, asked), type)
        const compiled = compileWidgetSource(source)
        if (!compiled.ok) errors.push(`Widget "${type}" has a syntax error; open it in the widget editor to fix it: ${compiled.error}`)
        project.widgetTypes.push({
          type,
          name: str(a.name, type),
          description: str(a.description),
          source,
          origin: 'ai',
          defaultData: isSource(a.defaultData) ? a.defaultData : { kind: 'none' },
          defaultProps: a.defaultProps && typeof a.defaultProps === 'object' ? (a.defaultProps as Record<string, unknown>) : {},
        })
        break
      }
      case 'update_widget_type': {
        const t = project.widgetTypes.find((w) => w.type === (typeAlias.get(str(a.type)) ?? str(a.type)))
        if (!t) fail('no such custom widget')
        else {
          t.source = str(a.source, t.source)
          if (typeof a.description === 'string') t.description = a.description
        }
        break
      }
      default:
        fail('not supported')
    }
  }
  return { project, errors }
}
