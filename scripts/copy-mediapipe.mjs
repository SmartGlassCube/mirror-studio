// Copies MediaPipe's wasm runtime next to the app (public/mediapipe/), so it always matches
// the installed @mediapipe/tasks-vision. Runs before `dev` and `build`.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const to = join(root, 'public', 'mediapipe')
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log('MediaPipe wasm copied to public/mediapipe/')
