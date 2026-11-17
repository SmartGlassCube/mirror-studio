import { useEffect, useState } from 'react'

// Light, dark, or following the system; the choice is remembered in this browser.
export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'smart-mirror-studio:theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function storedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && media().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(storedTheme)
  const [resolved, setResolved] = useState(() => document.documentElement.dataset.theme ?? 'light')

  useEffect(() => {
    const update = () => {
      applyTheme(choice)
      setResolved(document.documentElement.dataset.theme ?? 'light')
    }
    update()
    try {
      localStorage.setItem(KEY, choice)
    } catch {
      /* private mode: the choice lasts for this visit */
    }
    const query = media()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [choice])

  const cycle = () => setChoice((c) => (c === 'system' ? 'light' : c === 'light' ? 'dark' : 'system'))
  return { choice, resolved: resolved as 'light' | 'dark', setChoice, cycle }
}
