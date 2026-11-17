import { useState } from 'react'
import type { WidgetProps } from '../defineWidget'

// One club event (see content sync's event_cards()) or project.
type EventItem = {
  id: string
  name?: string
  description?: string
  image?: string | null
  // ISO, in the mirror's local time
  date?: string
  // null = the whole Student Branch
  chapter_name?: string | null
  past?: boolean
}
type EventsData = { items?: EventItem[] }

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Tunis',
  })

// The event's image, or the "?" placeholder when it has none or it fails to load.
function EventImage({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="event-card__image">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : '?'}
    </div>
  )
}

const EventsWidget = ({ widget }: WidgetProps<EventsData>) => {
  const items = widget.data?.items ?? []

  return (
    <div className="widget events-widget">
      <h2>Events</h2>
      {widget.content ? <div>{widget.content}</div> : null}
      {items.length === 0 ? <div>No events yet</div> : null}
      <div className="events-grid">
        {items.map((item) => (
          <div key={item.id} className={`event-card${item.past ? ' event-card--past' : ''}`}>
            {/* key: a new URL gets a fresh load attempt instead of keeping an old failure */}
            <EventImage key={item.image ?? ''} src={item.image} />
            <div className="event-card__name">{item.name ?? item.id}</div>
            {item.date ? (
              <div className="event-card__meta">
                {formatDate(item.date)}
                {item.chapter_name ? ` · ${item.chapter_name}` : ''}
              </div>
            ) : null}
            {item.description ? <div className="event-card__description">{item.description}</div> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

export default EventsWidget
