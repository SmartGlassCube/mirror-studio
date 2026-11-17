import type { WidgetProps } from '../defineWidget'

type CalendarEvent = {
  title?: string
  // ISO, in the mirror's local time (e.g. "2026-10-28T14:00:00+01:00")
  start?: string
  location?: string | null
  // null = the whole Student Branch
  chapter_name?: string | null
}
// `days`: events keyed by local day ("2026-10-28"), see content sync's calendar_days().
// `events`: a flat list from the simpler providers, grouped by day here.
type CalendarData = { days?: Record<string, CalendarEvent[]>; events?: CalendarEvent[] }

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

const groupByDay = (events: CalendarEvent[]) => {
  const days: Record<string, CalendarEvent[]> = {}
  for (const event of events) {
    if (event.start) (days[event.start.slice(0, 10)] ??= []).push(event)
  }
  return days
}

// Events listed under the grid: today's, else the next day that has some.
const MAX_LISTED = 3

const CalendarWidget = ({ widget }: WidgetProps<CalendarData>) => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  // Monday-first columns: blank cells before the 1st.
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7
  const eventsByDay = widget.data?.days ?? groupByDay(widget.data?.events ?? [])

  const todayKey = dayKey(year, month, today.getDate())
  const shownKey = Object.keys(eventsByDay)
    .filter((key) => key >= todayKey && eventsByDay[key].length > 0)
    .sort()[0]
  const shownEvents = shownKey ? eventsByDay[shownKey] : []

  return (
    <div className="widget calendar-widget">
      <h2>Calendar</h2>
      {widget.content ? <div>{widget.content}</div> : null}
      <div>{year} - {month + 1}</div>
      <div className="calendar-grid">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map(day => {
          const key = dayKey(year, month, day)
          const classes = ['calendar-day']
          if (key === todayKey) classes.push('calendar-day--today')
          if (eventsByDay[key]?.length) classes.push('calendar-day--has-events')
          return (
            <div key={day} className={classes.join(' ')}>
              {day}
            </div>
          )
        })}
      </div>
      {shownEvents.length > 0 ? (
        <div className="calendar-events">
          <div className="calendar-events__day">{shownKey === todayKey ? 'Today' : `Next: ${shownKey}`}</div>
          {shownEvents.slice(0, MAX_LISTED).map((event, index) => (
            <div key={`${event.title ?? 'event'}-${index}`}>
              • {event.start?.slice(11, 16)} {event.title ?? 'Untitled'}
              {event.chapter_name ? <span className="calendar-events__chapter"> ({event.chapter_name})</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default CalendarWidget
