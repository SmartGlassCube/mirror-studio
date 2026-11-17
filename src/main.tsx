import '@fontsource-variable/inter'
import '@fontsource/press-start-2p'
import '@fontsource/vt323'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme, storedTheme } from './theme'

// Before the first render, so the page doesn't flash the wrong theme.
applyTheme(storedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
