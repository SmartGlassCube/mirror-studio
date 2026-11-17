import type { WidgetComponent, WidgetDefinition } from './defineWidget'
import './widget.css'

// Auto-discovers every widgets/<name>/index.ts. To add a widget, create a folder
// whose index.ts does `export default defineWidget('<type>', MyWidget)`.
const definitions = import.meta.glob<WidgetDefinition>('./*/index.ts', { eager: true, import: 'default' })

export const widgetRegistry: Partial<Record<string, WidgetComponent>> = {}

for (const [path, definition] of Object.entries(definitions)) {
  if (widgetRegistry[definition.type]) {
    console.warn(`[widgets] Duplicate widget type "${definition.type}" in ${path}; keeping the first one`)
    continue
  }
  widgetRegistry[definition.type] = definition.component
}
