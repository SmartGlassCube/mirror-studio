import type { WidgetProps } from '../defineWidget'

// Navigation state added by TextWidget.serialize() in Python.
type TextMetadata = {
  contentMode?: 'string' | 'list' | 'dict'
  key?: string
  itemIndex?: number
  activeItemCount?: number
}

const TextWidget = ({ widget }: WidgetProps<unknown, TextMetadata>) => {
  const metadata = widget.metadata ?? {}
  const hasIndex = typeof metadata.itemIndex === 'number' && typeof metadata.activeItemCount === 'number'

  return (
    <div className="widget text-widget">
      <h2>Text</h2>
      {metadata.contentMode === 'dict' && metadata.key ? <div>Section: {metadata.key}</div> : null}
      {hasIndex ? <div>Item: {(metadata.itemIndex ?? 0) + 1}/{metadata.activeItemCount}</div> : null}
      <div className="widget-message">{widget.content ?? 'Welcome to Smart Mirror!'}</div>
    </div>
  )
}

export default TextWidget
