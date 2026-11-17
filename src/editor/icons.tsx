import {
  CalendarDays,
  CloudSun,
  Code2,
  Gamepad2,
  LayoutGrid,
  Newspaper,
  PenLine,
  QrCode,
  Sparkles,
  Type,
  type LucideIcon,
} from 'lucide-react'
import type { CustomWidgetType } from '../model/project'

// One icon and one colour per widget type, as n8n gives each node kind its own.
const BUILTIN: Record<string, { icon: LucideIcon; color: string }> = {
  text: { icon: Type, color: '#6b7cff' },
  weather: { icon: CloudSun, color: '#f2a516' },
  calendar: { icon: CalendarDays, color: '#2fa6e8' },
  news: { icon: Newspaper, color: '#8b5cf6' },
  events: { icon: LayoutGrid, color: '#ec5f94' },
  qr_gallery: { icon: QrCode, color: '#3b82f6' },
  games: { icon: Gamepad2, color: '#22b07d' },
  drawing: { icon: PenLine, color: '#ff6d5a' },
}

export function widgetLook(type: string, custom?: CustomWidgetType) {
  if (BUILTIN[type]) return BUILTIN[type]
  return { icon: custom?.origin === 'ai' ? Sparkles : Code2, color: custom?.origin === 'ai' ? '#a855f7' : '#64748b' }
}

export function WidgetIcon({ type, custom, size = 18 }: { type: string; custom?: CustomWidgetType; size?: number }) {
  const { icon: Icon, color } = widgetLook(type, custom)
  return (
    <span className="type-icon" style={{ '--tone': color } as React.CSSProperties}>
      <Icon size={size} strokeWidth={2} />
    </span>
  )
}
