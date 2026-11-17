import type { ComponentType } from 'react'
import type { MirrorWidget } from '../types/mirror'

export type WidgetProps<TData = unknown, TMetadata = Record<string, unknown>> = {
  widget: MirrorWidget<TData, TMetadata>
}

export type WidgetComponent = ComponentType<WidgetProps>

export type WidgetDefinition = {
  type: string
  component: WidgetComponent
}

// Pairs a backend widget `type` (BaseWidget.type in Python) with its React component.
// Each widget folder default-exports one of these from its index.ts; registry.ts picks it up.
export function defineWidget<TData, TMetadata>(
  type: string,
  component: ComponentType<WidgetProps<TData, TMetadata>>,
): WidgetDefinition {
  return { type, component: component as unknown as WidgetComponent }
}
