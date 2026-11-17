import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { builtinWidget, newWidgetInstance } from './model/catalog'
import { demoProject } from './model/examples'
import type { Binding, CustomWidgetType, Edge, Page, Project, ProjectSettings, WidgetInstance, XY } from './model/project'
import { emptyProject, uid, uniquePageId } from './model/project'

export type View = 'graph' | 'test'
export type Selection =
  | { kind: 'page'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'widget'; id: string; pageId: string }
  | { kind: 'settings' }
  | null

type HistoryEntry = { project: Project; key: string; at: number }

type State = {
  project: Project
  // False after importing a file with custom widget code, until the user agrees to run it.
  trusted: boolean
  view: View
  selection: Selection
  designerPageId: string | null // the page open in the page designer
  widgetEditor: string | null // custom widget type open in the widget studio ('new' for a new one)
  assistantOpen: boolean
  creatorOpen: boolean // the "+" panel: add pages and widgets
  past: HistoryEntry[]
  future: HistoryEntry[]
  savedAt: number

  // history
  undo: () => void
  redo: () => void

  // ui
  setView: (view: View) => void
  select: (selection: Selection) => void
  openDesigner: (pageId: string | null) => void
  openWidgetEditor: (type: string | null) => void
  toggleAssistant: (open?: boolean) => void
  toggleCreator: (open?: boolean) => void
  trust: () => void

  // project
  replaceProject: (project: Project, trusted: boolean) => void
  applyProject: (project: Project) => void // one undoable step (assistant plans)
  newProject: (kind: 'blank' | 'demo') => void
  renameProject: (name: string) => void
  updateSettings: (patch: Partial<ProjectSettings>) => void
  addPage: (name: string, canvas: XY) => string
  updatePage: (id: string, patch: Partial<Omit<Page, 'id' | 'widgets'>>, historyKey?: string) => void
  renamePageId: (id: string, newId: string) => boolean
  removePage: (id: string) => void
  duplicatePage: (id: string) => void
  addEdge: (from: string, to: string, gesture: string) => string
  updateEdge: (id: string, patch: Partial<Omit<Edge, 'id'>>) => void
  removeEdge: (id: string) => void
  addBinding: (gesture: string, page: string) => void
  updateBinding: (id: string, patch: Partial<Omit<Binding, 'id'>>) => void
  removeBinding: (id: string) => void
  addWidget: (pageId: string, type: string, position?: XY) => string | null
  updateWidget: (pageId: string, id: string, patch: Partial<WidgetInstance>, historyKey?: string) => void
  removeWidget: (pageId: string, id: string) => void
  duplicateWidget: (pageId: string, id: string) => void
  upsertWidgetType: (type: CustomWidgetType, previousType?: string) => void
  removeWidgetType: (type: string) => void
}

const HISTORY_LIMIT = 80
const COALESCE_MS = 800

export const useStudio = create<State>()(
  persist(
    (set, get) => {
      // Applies a change to the project, recording undo history. Changes with the same `key`
      // within COALESCE_MS (a widget being dragged, a name being typed) are one undo step.
      const commit = (change: (project: Project) => Project, key = String(Math.random())) => {
        const { project, past } = get()
        const next = { ...change(structuredClone(project)), updatedAt: new Date().toISOString() }
        const last = past[past.length - 1]
        const now = Date.now()
        const coalesce = last && last.key === key && now - last.at < COALESCE_MS
        set({
          project: next,
          past: coalesce ? [...past.slice(0, -1), { ...last, at: now }] : [...past, { project, key, at: now }].slice(-HISTORY_LIMIT),
          future: [],
          savedAt: now,
        })
      }

      const mapPage = (pageId: string, fn: (page: Page) => Page) => (project: Project) => ({
        ...project,
        pages: project.pages.map((p) => (p.id === pageId ? fn(p) : p)),
      })

      return {
        project: demoProject(),
        trusted: true,
        view: 'graph',
        selection: null,
        designerPageId: null,
        widgetEditor: null,
        assistantOpen: false,
        creatorOpen: false,
        past: [],
        future: [],
        savedAt: Date.now(),

        undo: () => {
          const { past, project, future } = get()
          const previous = past[past.length - 1]
          if (!previous) return
          set({ project: previous.project, past: past.slice(0, -1), future: [{ project, key: 'redo', at: 0 }, ...future], savedAt: Date.now() })
        },
        redo: () => {
          const { past, project, future } = get()
          const next = future[0]
          if (!next) return
          set({ project: next.project, future: future.slice(1), past: [...past, { project, key: 'undo', at: 0 }], savedAt: Date.now() })
        },

        setView: (view) => set({ view }),
        select: (selection) => set({ selection }),
        openDesigner: (pageId) => set({ designerPageId: pageId, selection: pageId ? { kind: 'page', id: pageId } : get().selection }),
        openWidgetEditor: (type) => set({ widgetEditor: type }),
        toggleAssistant: (open) => set({ assistantOpen: open ?? !get().assistantOpen }),
        toggleCreator: (open) => set({ creatorOpen: open ?? !get().creatorOpen }),
        trust: () => set({ trusted: true }),

        replaceProject: (project, trusted) => {
          commit(() => project)
          set({ trusted, selection: null, designerPageId: null, widgetEditor: null, view: 'graph' })
        },
        applyProject: (project) => commit(() => project),
        newProject: (kind) => {
          commit(() => (kind === 'demo' ? demoProject() : emptyProject()))
          set({ trusted: true, selection: null, designerPageId: null, widgetEditor: null, view: 'graph' })
        },
        renameProject: (name) => commit((p) => ({ ...p, name }), 'rename-project'),
        updateSettings: (patch) => commit((p) => ({ ...p, settings: { ...p.settings, ...patch } }), `settings:${Object.keys(patch).join()}`),

        addPage: (name, canvas) => {
          const id = uniquePageId(get().project, name)
          commit((p) => ({ ...p, pages: [...p.pages, { id, name, canvas, widgets: [] }] }))
          set({ selection: { kind: 'page', id } })
          return id
        },
        updatePage: (id, patch, historyKey) => commit(mapPage(id, (page) => ({ ...page, ...patch })), historyKey),
        renamePageId: (id, newId) => {
          const project = get().project
          if (!/^[a-z][a-z0-9_-]*$/.test(newId) || project.pages.some((p) => p.id === newId)) return false
          const swap = (value: string) => (value === id ? newId : value)
          commit((p) => ({
            ...p,
            settings: { ...p.settings, initialPage: swap(p.settings.initialPage) },
            pages: p.pages.map((page) => (page.id === id ? { ...page, id: newId } : page)),
            edges: p.edges.map((e) => ({ ...e, from: swap(e.from), to: swap(e.to) })),
            bindings: p.bindings.map((b) => ({ ...b, action: { ...b.action, page: swap(b.action.page) } })),
          }))
          set({ selection: { kind: 'page', id: newId }, designerPageId: get().designerPageId === id ? newId : get().designerPageId })
          return true
        },
        removePage: (id) => {
          const project = get().project
          if (project.pages.length <= 1) return
          commit((p) => {
            const pages = p.pages.filter((page) => page.id !== id)
            return {
              ...p,
              pages,
              edges: p.edges.filter((e) => e.from !== id && e.to !== id),
              bindings: p.bindings.filter((b) => b.action.page !== id),
              settings: { ...p.settings, initialPage: p.settings.initialPage === id ? pages[0].id : p.settings.initialPage },
            }
          })
          set({ selection: null, designerPageId: get().designerPageId === id ? null : get().designerPageId })
        },
        duplicatePage: (id) => {
          const page = get().project.pages.find((p) => p.id === id)
          if (!page) return
          const newId = uniquePageId(get().project, `${page.name} copy`)
          commit((p) => ({
            ...p,
            pages: [...p.pages, { ...structuredClone(page), id: newId, name: `${page.name} copy`, canvas: { x: page.canvas.x + 60, y: page.canvas.y + 220 }, widgets: page.widgets.map((w) => ({ ...structuredClone(w), id: uid(w.type) })) }],
          }))
          set({ selection: { kind: 'page', id: newId } })
        },

        addEdge: (from, to, gesture) => {
          const id = uid('edge')
          commit((p) => ({ ...p, edges: [...p.edges, { id, from, to, gesture }] }))
          set({ selection: { kind: 'edge', id } })
          return id
        },
        updateEdge: (id, patch) => commit((p) => ({ ...p, edges: p.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
        removeEdge: (id) => {
          commit((p) => ({ ...p, edges: p.edges.filter((e) => e.id !== id) }))
          set({ selection: null })
        },
        addBinding: (gesture, page) => commit((p) => ({ ...p, bindings: [...p.bindings, { id: uid('binding'), gesture, action: { kind: 'goto', page } }] })),
        updateBinding: (id, patch) => commit((p) => ({ ...p, bindings: p.bindings.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
        removeBinding: (id) => commit((p) => ({ ...p, bindings: p.bindings.filter((b) => b.id !== id) })),

        addWidget: (pageId, type, position) => {
          const project = get().project
          const builtin = builtinWidget(type)
          const custom = project.widgetTypes.find((t) => t.type === type)
          if (!builtin && !custom) return null
          const defaults = builtin
            ? builtin.defaults
            : { content: null, props: custom!.defaultProps, data: custom!.defaultData, refreshInterval: custom!.defaultData.kind === 'clock' ? 1 : 300, draggable: true }
          const widget = newWidgetInstance(type, defaults, position)
          commit(mapPage(pageId, (page) => ({ ...page, widgets: [...page.widgets, widget] })))
          set({ selection: { kind: 'widget', id: widget.id, pageId } })
          return widget.id
        },
        updateWidget: (pageId, id, patch, historyKey) =>
          commit(mapPage(pageId, (page) => ({ ...page, widgets: page.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) })), historyKey),
        removeWidget: (pageId, id) => {
          commit(mapPage(pageId, (page) => ({ ...page, widgets: page.widgets.filter((w) => w.id !== id) })))
          set({ selection: { kind: 'page', id: pageId } })
        },
        duplicateWidget: (pageId, id) => {
          const widget = get().project.pages.find((p) => p.id === pageId)?.widgets.find((w) => w.id === id)
          if (!widget) return
          const copy = { ...structuredClone(widget), id: uid(widget.type), position: { x: Math.min(1, widget.position.x + 0.05), y: Math.min(1, widget.position.y + 0.05) } }
          commit(mapPage(pageId, (page) => ({ ...page, widgets: [...page.widgets, copy] })))
          set({ selection: { kind: 'widget', id: copy.id, pageId } })
        },

        upsertWidgetType: (type, previousType) =>
          commit((p) => {
            const old = previousType ?? type.type
            const exists = p.widgetTypes.some((t) => t.type === old)
            return {
              ...p,
              widgetTypes: exists ? p.widgetTypes.map((t) => (t.type === old ? type : t)) : [...p.widgetTypes, type],
              // A renamed type: the widgets using it follow.
              pages: old === type.type ? p.pages : p.pages.map((page) => ({ ...page, widgets: page.widgets.map((w) => (w.type === old ? { ...w, type: type.type } : w)) })),
            }
          }, `widget-type:${previousType ?? type.type}`),
        removeWidgetType: (type) =>
          commit((p) => ({
            ...p,
            widgetTypes: p.widgetTypes.filter((t) => t.type !== type),
            pages: p.pages.map((page) => ({ ...page, widgets: page.widgets.filter((w) => w.type !== type) })),
          })),
      }
    },
    {
      name: 'smart-mirror-studio',
      version: 1,
      // Only the work itself survives a reload, not the open panels or the undo history.
      partialize: (state) => ({ project: state.project, trusted: state.trusted }),
    },
  ),
)

export const useProject = () => useStudio((s) => s.project)
