// Port of smartmirror/core (StateManager + navigation + widget events + the drawing widget's
// handle_gesture), running a studio project the way the mirror will.
import type { WidgetRuntime } from '../mirror/MirrorScreen'
import type { Project, WidgetInstance } from '../model/project'
import { DEFAULT_GESTURE_CONFIG } from '../model/project'
import type { GestureEvent, Point } from './gestureEngine'
import { isNavigableContent, navigateText } from './textWidget'

type WidgetBinding = { handler: 'nav' | 'scroll' | 'drag_start' | 'drag_move' | 'drag_end'; target: 'navigable' | 'draggable' | 'none'; h?: number; v?: number; cooldownKey?: string; cooldownConfig?: 'swipe_cooldown' | 'scroll_cooldown' }

// smartmirror/config/json_config/default_widget_event_bindings.json
const WIDGET_BINDINGS: Record<string, WidgetBinding> = {
  swipe_left: { handler: 'nav', target: 'navigable', h: 1, v: 0, cooldownKey: 'horizontal', cooldownConfig: 'swipe_cooldown' },
  swipe_right: { handler: 'nav', target: 'navigable', h: -1, v: 0, cooldownKey: 'horizontal', cooldownConfig: 'swipe_cooldown' },
  swipe_up: { handler: 'nav', target: 'navigable', h: 0, v: -1, cooldownKey: 'vertical', cooldownConfig: 'swipe_cooldown' },
  swipe_down: { handler: 'nav', target: 'navigable', h: 0, v: 1, cooldownKey: 'vertical', cooldownConfig: 'swipe_cooldown' },
  scroll_start: { handler: 'scroll', target: 'navigable', cooldownKey: 'vertical', cooldownConfig: 'scroll_cooldown' },
  scroll_update: { handler: 'scroll', target: 'navigable', cooldownKey: 'vertical', cooldownConfig: 'scroll_cooldown' },
  pinch_start: { handler: 'drag_start', target: 'draggable' },
  pinch_move: { handler: 'drag_move', target: 'none' },
  pinch_end: { handler: 'drag_end', target: 'none' },
}

// smartmirror/widgets/drawing.py
const DRAW_COLORS = ['#d5d5d5', '#fd7a33', '#ab32ac', '#3fd16b', '#3fa9f5', '#ffd23f']
const DRAW_SIZES = [1, 2, 4, 6]
const DRAW_GESTURES = ['left_click', 'swipe_left', 'swipe_right', 'swipe_up', 'two_fingers_swipe_up']

export type Outcome =
  | { stage: 'binding'; event: string; to: string; bindingId: string }
  | { stage: 'edge'; event: string; to: string; edgeId: string; from: string }
  | { stage: 'widget'; event: string; widgetId: string; what: string }
  | { stage: 'ignored'; event: string; why: string }

export class MirrorSimulator {
  currentPage: string
  runtime: Record<string, WidgetRuntime> = {}
  private lastTimes = new Map<string, number>()
  private dragging = new Map<string, string>() // hand -> widget id
  private drawing = new Map<string, { color: number; size: number; clears: number }>()

  constructor(private project: Project) {
    this.currentPage = project.pages.some((p) => p.id === project.settings.initialPage) ? project.settings.initialPage : project.pages[0]?.id
  }

  private get config() {
    return { ...DEFAULT_GESTURE_CONFIG, ...this.project.settings.gestureConfig }
  }

  setProject(project: Project) {
    this.project = project
    if (!project.pages.some((p) => p.id === this.currentPage)) this.currentPage = project.settings.initialPage
  }

  page() {
    return this.project.pages.find((p) => p.id === this.currentPage)
  }

  goto(pageId: string) {
    if (pageId === this.currentPage || !this.project.pages.some((p) => p.id === pageId)) return false
    this.currentPage = pageId
    return true
  }

  // handle_gesture_events: returns what each event did, in order.
  handle(events: GestureEvent[], now: number): Outcome[] {
    return events.map((event) => this.dispatch(event, now))
  }

  private rateLimited(key: string, now: number, cooldown: number) {
    if (!cooldown || cooldown <= 0) return false
    const previous = this.lastTimes.get(key)
    if (previous !== undefined && now - previous < cooldown) return true
    this.lastTimes.set(key, now)
    return false
  }

  private dispatch(event: GestureEvent, now: number): Outcome {
    // 1. event_bindings ("from any page")
    const binding = this.project.bindings.find((b) => b.gesture === event.name)
    if (binding && this.goto(binding.action.page)) return { stage: 'binding', event: event.name, to: binding.action.page, bindingId: binding.id }

    // 2. graph edges from the current page
    const outgoing = this.project.edges.filter((e) => e.from === this.currentPage)
    let edge = outgoing.find((e) => e.gesture === event.name)
    if (!edge && this.config.allow_unmatched_single_edge_navigation && outgoing.length === 1) edge = outgoing[0]
    if (edge && edge.to !== this.currentPage && this.project.pages.some((p) => p.id === edge.to)) {
      if (this.rateLimited(`node:${event.name}`, now, this.config.node_navigation_cooldown)) {
        return { stage: 'ignored', event: event.name, why: 'page change cooling down' }
      }
      const from = this.currentPage
      this.goto(edge.to)
      return { stage: 'edge', event: event.name, to: edge.to, edgeId: edge.id, from }
    }

    // 3. widget events
    return this.widgetEvent(event, now)
  }

  private widgets(): WidgetInstance[] {
    return this.page()?.widgets ?? []
  }

  private position(widget: WidgetInstance) {
    return this.runtime[widget.id]?.position ?? widget.position
  }

  private resolve(event: GestureEvent, candidates: WidgetInstance[]) {
    if (!candidates.length) return null
    if (!event.location) return candidates[0]
    const distance = (w: WidgetInstance) => Math.hypot(this.position(w).x - (event.location as Point)[0], this.position(w).y - (event.location as Point)[1])
    const nearest = candidates.reduce((a, b) => (distance(b) < distance(a) ? b : a))
    return distance(nearest) <= this.config.target_radius ? nearest : candidates[0]
  }

  private widgetEvent(event: GestureEvent, now: number): Outcome {
    const widgets = this.widgets()
    // Widgets that handle the event themselves (only the drawing canvas among the built-ins).
    const listener = this.resolve(event, widgets.filter((w) => w.type === 'drawing' && DRAW_GESTURES.includes(event.name)))
    if (listener) {
      const what = this.drawingGesture(listener, event.name)
      if (what) return { stage: 'widget', event: event.name, widgetId: listener.id, what }
    }

    const binding = WIDGET_BINDINGS[event.name]
    if (!binding) return { stage: 'ignored', event: event.name, why: 'no link or widget uses it here' }
    let target: WidgetInstance | null = null
    if (binding.target !== 'none') {
      const can = binding.target === 'navigable' ? (w: WidgetInstance) => w.type === 'text' && isNavigableContent(w.content) : (w: WidgetInstance) => w.draggable
      target = this.resolve(event, widgets.filter(can))
      if (!target) return { stage: 'ignored', event: event.name, why: binding.target === 'navigable' ? 'no text widget with several lines' : 'no draggable widget' }
      if (binding.cooldownKey && binding.cooldownConfig && this.rateLimited(`widget:${target.id}:${binding.cooldownKey}`, now, this.config[binding.cooldownConfig])) {
        return { stage: 'ignored', event: event.name, why: 'cooling down' }
      }
    }

    const rt = (id: string) => (this.runtime[id] ??= {})
    switch (binding.handler) {
      case 'nav':
      case 'scroll': {
        let h = binding.h ?? 0
        let v = binding.v ?? 0
        if (binding.handler === 'scroll') {
          const vy = event.data?.velocity_y ?? 0
          if (Math.abs(vy) < this.config.scroll_velocity_threshold) return { stage: 'ignored', event: event.name, why: 'scroll too slow' }
          h = 0
          v = vy > 0 ? 1 : -1
        }
        const next = navigateText(target!.content, rt(target!.id).nav ?? { key: 0, item: 0 }, h, v)
        if (!next) return { stage: 'ignored', event: event.name, why: 'nothing to cycle' }
        rt(target!.id).nav = next
        return { stage: 'widget', event: event.name, widgetId: target!.id, what: v ? 'next section' : 'next line' }
      }
      case 'drag_start':
        if (!event.hand) return { stage: 'ignored', event: event.name, why: 'no hand' }
        this.dragging.set(event.hand, target!.id)
        rt(target!.id).dragging = true
        rt(target!.id).position ??= { ...target!.position }
        return { stage: 'widget', event: event.name, widgetId: target!.id, what: 'grabbed' }
      case 'drag_move': {
        const id = event.hand ? this.dragging.get(event.hand) : undefined
        if (!id) return { stage: 'ignored', event: event.name, why: 'nothing grabbed' }
        const position = rt(id).position ?? { x: 0.5, y: 0.5 }
        const clamp = (n: number) => Math.max(0, Math.min(1, n))
        rt(id).position = { x: clamp(position.x + (event.data?.dx ?? 0)), y: clamp(position.y + (event.data?.dy ?? 0)) }
        return { stage: 'widget', event: event.name, widgetId: id, what: 'moved' }
      }
      case 'drag_end': {
        const id = event.hand ? this.dragging.get(event.hand) : undefined
        if (!id) return { stage: 'ignored', event: event.name, why: 'nothing grabbed' }
        this.dragging.delete(event.hand!)
        rt(id).dragging = false
        return { stage: 'widget', event: event.name, widgetId: id, what: 'released' }
      }
    }
  }

  private drawingGesture(widget: WidgetInstance, name: string): string | null {
    const state = this.drawing.get(widget.id) ?? { color: 0, size: 0, clears: 0 }
    let what: string
    if (name === 'left_click') {
      state.color = (state.color + 1) % DRAW_COLORS.length
      what = 'next colour'
    } else if (name === 'swipe_left' || name === 'swipe_right') {
      const size = Math.max(0, Math.min(DRAW_SIZES.length - 1, state.size + (name === 'swipe_left' ? 1 : -1)))
      if (size === state.size) return null
      state.size = size
      what = name === 'swipe_left' ? 'bigger brush' : 'smaller brush'
    } else {
      state.clears++
      what = 'cleared'
    }
    this.drawing.set(widget.id, state)
    ;(this.runtime[widget.id] ??= {}).data = { color: DRAW_COLORS[state.color], size: DRAW_SIZES[state.size], clears: state.clears }
    return what
  }
}
