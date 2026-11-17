import type { WidgetProps } from '../defineWidget'

// From OpenMeteoWeatherProvider (smartmirror/widgets/providers/open_meteo.py).
type WeatherData = {
  city?: string
  temperature: number
  humidity: number
  wind: number
  code: number
  isDay: boolean
}

// Pixel icons in assets/weather/, by file name.
const ICONS = import.meta.glob<string>('../../assets/weather/*.svg', { eager: true, import: 'default' })
const iconUrl = (name: string) => ICONS[`../../assets/weather/${name}.svg`]

// WMO weather code -> label and icon (`-day`/`-night` icons follow isDay).
function describe(code: number, isDay: boolean): { label: string; icon: string } {
  const time = isDay ? 'day' : 'night'
  if (code === 0) return { label: 'Clear', icon: `clear-${time}` }
  if (code === 1) return { label: 'Mainly clear', icon: `partly-cloudy-${time}` }
  if (code === 2) return { label: 'Partly cloudy', icon: `partly-cloudy-${time}` }
  if (code === 3) return { label: 'Overcast', icon: 'cloudy' }
  if (code === 45) return { label: 'Fog', icon: 'fog' }
  if (code === 48) return { label: 'Icy fog', icon: 'cloud-fog' }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rain' }
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: 'rain' }
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow' }
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: `showers-${time}` }
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'snow' }
  if (code >= 95) return { label: 'Thunderstorm', icon: 'thunderstorm' }
  return { label: 'Unknown', icon: 'cloudy' }
}

const WeatherWidget = ({ widget }: WidgetProps<WeatherData>) => {
  const weather = widget.data

  if (!weather) {
    return (
      <div className="widget weather-widget">
        <h2>Weather</h2>
        <div>{widget.content ?? 'Loading weather...'}</div>
      </div>
    )
  }

  const { label, icon } = describe(weather.code, weather.isDay)
  return (
    <div className="widget weather-widget">
      <h2>Weather{weather.city ? ` - ${weather.city}` : ''}</h2>
      <div className="weather-now">
        <img className="weather-now__icon" src={iconUrl(icon)} alt="" />
        <div>
          <div className="weather-now__temperature">{Math.round(weather.temperature)}°C</div>
          <div>{label}</div>
        </div>
      </div>
      <div>Humidity: {Math.round(weather.humidity)}%</div>
      <div>Wind: {Math.round(weather.wind)} km/h</div>
    </div>
  )
}

export default WeatherWidget
