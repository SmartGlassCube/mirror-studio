import { useEffect, useSyncExternalStore } from 'react'
import type { DataSource, WidgetInstance } from '../model/project'

// Resolves widget data sources in the browser, like the SDK's data providers do on the mirror.
// One shared entry per distinct source, refreshed while some mounted widget uses it.

type Entry = { value: unknown; error: string | null; loading: boolean; timer?: number; users: number; interval: number }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0

const emit = () => {
  version++
  listeners.forEach((l) => l())
}

const keyOf = (source: DataSource) => JSON.stringify(source)

export function getPath(value: unknown, path: string): unknown {
  if (!path.trim()) return value
  return path.split('.').reduce<unknown>((current, part) => {
    if (current == null) return undefined
    return (current as Record<string, unknown>)[part]
  }, value)
}

export function clockData(hour12: boolean, now = new Date()) {
  const hours = now.getHours()
  const pad = (n: number) => String(n).padStart(2, '0')
  const shown = hour12 ? ((hours + 11) % 12) + 1 : hours
  return {
    time: `${hour12 ? shown : pad(shown)}:${pad(now.getMinutes())}${hour12 ? (hours < 12 ? ' AM' : ' PM') : ''}`,
    seconds: pad(now.getSeconds()),
    date: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
    iso: now.toISOString(),
  }
}

async function fetchSource(source: DataSource): Promise<unknown> {
  switch (source.kind) {
    case 'none':
      return null
    case 'static':
      return source.value
    case 'clock':
      return clockData(source.hour12)
    case 'weather': {
      // Same request and shape as smartmirror/widgets/providers/open_meteo.py
      const query = new URLSearchParams({
        latitude: String(source.latitude),
        longitude: String(source.longitude),
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
        timezone: 'auto',
      })
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`)
      if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`)
      const { current } = await response.json()
      return {
        city: source.city,
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        wind: current.wind_speed_10m,
        code: current.weather_code,
        isDay: Boolean(current.is_day),
      }
    }
    case 'http': {
      if (!source.url) return null
      const response = await fetch(source.url)
      if (!response.ok) throw new Error(`${source.url} answered ${response.status}`)
      return getPath(await response.json(), source.path)
    }
  }
}

function refresh(key: string, source: DataSource) {
  const entry = entries.get(key)
  if (!entry) return
  if (source.kind === 'static' || source.kind === 'none' || source.kind === 'clock') {
    entry.value = source.kind === 'clock' ? clockData(source.hour12) : source.kind === 'static' ? source.value : null
    entry.loading = false
    emit()
    return
  }
  entry.loading = true
  fetchSource(source)
    .then((value) => {
      entry.value = value
      entry.error = null
    })
    .catch((error: Error) => {
      // A browser blocks most third-party APIs without CORS headers; the mirror (Python) won't.
      entry.error = error.message === 'Failed to fetch' ? 'Request blocked (network or CORS). It may still work on the mirror.' : error.message
    })
    .finally(() => {
      entry.loading = false
      emit()
    })
}

function retain(source: DataSource, intervalSeconds: number) {
  const key = keyOf(source)
  let entry = entries.get(key)
  const interval = source.kind === 'clock' ? 1 : Math.max(5, intervalSeconds)
  if (!entry) {
    entry = { value: source.kind === 'static' ? source.value : null, error: null, loading: false, users: 0, interval }
    entries.set(key, entry)
    refresh(key, source)
  }
  entry.users++
  if (!entry.timer || interval < entry.interval) {
    window.clearInterval(entry.timer)
    entry.interval = interval
    if (source.kind !== 'static' && source.kind !== 'none') {
      entry.timer = window.setInterval(() => refresh(key, source), interval * 1000)
    }
  }
  return () => {
    entry.users--
    if (entry.users <= 0) {
      window.clearInterval(entry.timer)
      entries.delete(key)
    }
  }
}

export function dataFor(source: DataSource): { value: unknown; error: string | null; loading: boolean } {
  if (source.kind === 'static') return { value: source.value, error: null, loading: false }
  const entry = entries.get(keyOf(source))
  return entry ?? { value: null, error: null, loading: true }
}

// Keeps every widget's source live while mounted; re-renders when any value changes.
export function useLiveData(widgets: WidgetInstance[]) {
  const signature = widgets.map((w) => `${keyOf(w.data)}@${w.refreshInterval}`).join('\n')
  useEffect(() => {
    const releases = widgets.map((w) => retain(w.data, w.refreshInterval))
    return () => releases.forEach((release) => release())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
}
