import { BUILTIN_TYPES } from './catalog'
import { GESTURES, gestureInfo } from './gestures'
import type { Project } from './project'

export type Problem = {
  level: 'error' | 'warning' | 'info'
  message: string
  pageId?: string
  edgeId?: string
}

// Checks a project the way the mirror will run it (core/navigation.py, core/widget_events.py).
export function lintProject(project: Project): Problem[] {
  const problems: Problem[] = []
  const pageIds = new Set(project.pages.map((p) => p.id))
  const customTypes = new Set(project.widgetTypes.map((t) => t.type))
  const known = new Set(GESTURES.map((g) => g.name))

  for (const edge of project.edges) {
    if (!pageIds.has(edge.from) || !pageIds.has(edge.to)) {
      problems.push({ level: 'error', edgeId: edge.id, message: `A link points to a page that no longer exists.` })
    }
    if (!known.has(edge.gesture)) {
      problems.push({ level: 'info', edgeId: edge.id, message: `"${edge.gesture}" is a custom gesture: it only fires if your Python code adds it.` })
    }
  }

  // Two links leaving one page on the same gesture: the mirror only follows the first.
  const seen = new Map<string, string>()
  for (const edge of project.edges) {
    const key = `${edge.from}|${edge.gesture}`
    if (seen.has(key)) {
      problems.push({ level: 'error', pageId: edge.from, edgeId: edge.id, message: `"${pageName(project, edge.from)}" has two links on ${gestureInfo(edge.gesture).label}; only the first is followed.` })
    } else seen.set(key, edge.id)
  }

  for (const binding of project.bindings) {
    if (!pageIds.has(binding.action.page)) {
      problems.push({ level: 'error', message: `The "from any page" gesture ${gestureInfo(binding.gesture).label} goes to a deleted page.` })
    }
    const shadowed = project.edges.filter((e) => e.gesture === binding.gesture)
    if (shadowed.length) {
      problems.push({ level: 'warning', edgeId: shadowed[0].id, message: `${gestureInfo(binding.gesture).label} is a "from any page" gesture, so it overrides ${shadowed.length} link(s) using it.` })
    }
  }

  // Pages a visitor can never reach from the start page.
  const reachable = new Set([project.settings.initialPage])
  const anyPageTargets = project.bindings.map((b) => b.action.page)
  anyPageTargets.forEach((id) => reachable.add(id))
  let grew = true
  while (grew) {
    grew = false
    for (const edge of project.edges) {
      if (reachable.has(edge.from) && !reachable.has(edge.to)) {
        reachable.add(edge.to)
        grew = true
      }
    }
  }
  for (const page of project.pages) {
    if (!reachable.has(page.id)) {
      problems.push({ level: 'warning', pageId: page.id, message: `"${page.name}" can't be reached from the start page.` })
    } else if (page.id !== project.settings.initialPage && !project.edges.some((e) => e.from === page.id) && !project.bindings.length) {
      problems.push({ level: 'warning', pageId: page.id, message: `"${page.name}" is a dead end: no gesture leaves it.` })
    }
    if (page.widgets.length === 0) {
      problems.push({ level: 'info', pageId: page.id, message: `"${page.name}" has no widgets yet.` })
    }
    for (const widget of page.widgets) {
      if (!BUILTIN_TYPES.includes(widget.type) && !customTypes.has(widget.type)) {
        problems.push({ level: 'error', pageId: page.id, message: `"${page.name}" uses the unknown widget type "${widget.type}".` })
      }
    }
    // Open-hand swipes are also the text widgets' item navigation: a link wins on the mirror.
    const textWidgets = page.widgets.filter((w) => w.type === 'text')
    const swipeLinks = project.edges.filter((e) => e.from === page.id && gestureInfo(e.gesture).sharedWithWidgets)
    if (textWidgets.length && swipeLinks.length) {
      problems.push({ level: 'warning', pageId: page.id, message: `On "${page.name}", ${gestureInfo(swipeLinks[0].gesture).label} changes page, so text widgets there can't use it to cycle lines.` })
    }
    const drags = project.edges.filter((e) => e.from === page.id && e.gesture.startsWith('pinch'))
    if (drags.length && page.widgets.some((w) => w.draggable)) {
      problems.push({ level: 'warning', pageId: page.id, message: `On "${page.name}", pinching changes page, so its widgets can't be dragged.` })
    }
  }
  return problems
}

const pageName = (project: Project, id: string) => project.pages.find((p) => p.id === id)?.name ?? id
