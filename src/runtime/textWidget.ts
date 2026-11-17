// Port of glasscube/widgets/text.py: what a TextWidget shows for a navigation state.

export type TextNav = { key: number; item: number }

type Normalized = { mode: 'string' | 'list' | 'dict'; keys: string[]; source: string | string[] | Record<string, string[]> }

export function normalizeText(content: unknown): Normalized {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const sections: Record<string, string[]> = {}
    for (const [key, items] of Object.entries(content as Record<string, unknown>)) {
      if (Array.isArray(items) && items.length) sections[key] = items.map(String)
    }
    if (Object.keys(sections).length) return { mode: 'dict', keys: Object.keys(sections), source: sections }
  }
  if (Array.isArray(content)) {
    const items = content.map(String).filter((s) => s.trim())
    if (items.length) return { mode: 'list', keys: [], source: items }
  }
  return { mode: 'string', keys: [], source: content == null ? '' : String(content) }
}

const activeItems = (n: Normalized, nav: TextNav): string[] =>
  n.mode === 'dict' ? (n.source as Record<string, string[]>)[n.keys[nav.key]] : n.mode === 'list' ? (n.source as string[]) : []

// TextWidget.apply_navigation: returns the new state, or null when nothing changed.
export function navigateText(content: unknown, nav: TextNav, horizontal: number, vertical: number): TextNav | null {
  const n = normalizeText(content)
  let { key, item } = nav
  if (vertical && n.keys.length) {
    key = (((key + vertical) % n.keys.length) + n.keys.length) % n.keys.length
    if (key !== nav.key) item = 0
  }
  const items = activeItems(n, { key, item })
  if (horizontal && items.length) item = (((item + horizontal) % items.length) + items.length) % items.length
  return key === nav.key && item === nav.item ? null : { key, item }
}

export const isNavigableContent = (content: unknown) => normalizeText(content).mode !== 'string'

// TextWidget.serialize(): the shown line plus the navigation metadata the React component reads.
export function textView(content: unknown, nav: TextNav = { key: 0, item: 0 }) {
  const n = normalizeText(content)
  const items = activeItems(n, nav)
  const shown = items.length ? items[nav.item % items.length] : (n.source as string)
  const metadata: Record<string, unknown> = { contentMode: n.mode, itemIndex: nav.item }
  if (n.mode !== 'string') metadata.activeItemCount = items.length
  if (n.mode === 'dict') metadata.key = n.keys[nav.key]
  return { content: shown, metadata }
}
