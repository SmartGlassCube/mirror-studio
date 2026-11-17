import type { WidgetProps } from '../defineWidget'

const placeholderHeadlines = [
  'Breaking: Smart Mirror MVP Launched!',
  'Weather is sunny today in Paris.',
  'Calendar now supports gesture navigation.',
  'Stay tuned for more updates!',
]

// One news item: an active announcement or an achievement (see content sync's news()).
type NewsItem = {
  id?: string
  kind?: 'announcement' | 'achievement'
  title?: string
  body?: string
  priority?: string | null
  // null = the whole Student Branch
  chapter_name?: string | null
}
type NewsData = { items?: NewsItem[] }

type TickerEntry = { key: string; label: string | null; text: string }

// Ticker speed: seconds per character of one full run, so long and short feeds scroll at the same pace.
const SECONDS_PER_CHAR = 0.22
const MIN_DURATION_S = 8

const toEntry = (item: NewsItem, index: number): TickerEntry => ({
  key: item.id ?? String(index),
  label:
    `${item.kind === 'achievement' ? 'Achievement' : item.priority === 'high' ? 'Important' : 'Announcement'}` +
    ` · ${item.chapter_name ?? 'IEEE INSAT SB'}`,
  text: item.body ? `${item.title ?? 'Untitled'}: ${item.body}` : (item.title ?? 'Untitled'),
})

// News ticker: the announcements and achievements scroll right to left, looping seamlessly.
const NewsWidget = ({ widget }: WidgetProps<NewsData>) => {
  const items = widget.data?.items ?? []
  const entries: TickerEntry[] =
    items.length > 0
      ? items.map(toEntry)
      : (widget.content ? [String(widget.content)] : placeholderHeadlines).map((text, index) => ({
          key: String(index),
          label: null,
          text,
        }))

  const chars = entries.reduce((total, entry) => total + (entry.label?.length ?? 0) + entry.text.length, 0)
  const duration = Math.max(MIN_DURATION_S, chars * SECONDS_PER_CHAR)
  // Restart the scroll only when the feed itself changes, not on every data refresh.
  const feedKey = entries.map((entry) => `${entry.key}:${entry.text}`).join('|')

  // The run is rendered twice: sliding the track by half its width brings the
  // copy exactly where the original started, so the loop has no visible jump.
  const run = (copy: number) => (
    <span className="news-ticker__run" aria-hidden={copy > 0 ? true : undefined}>
      {entries.map((entry) => (
        <span key={entry.key} className="news-ticker__item">
          {entry.label ? <span className="news-widget__label">{entry.label} </span> : null}
          {entry.text}
        </span>
      ))}
    </span>
  )

  return (
    <div className="widget news-widget">
      <h2>News</h2>
      <div className="widget-message news-ticker">
        <div key={feedKey} className="news-ticker__track" style={{ animationDuration: `${duration}s` }}>
          {run(0)}
          {run(1)}
        </div>
      </div>
    </div>
  )
}

export default NewsWidget
