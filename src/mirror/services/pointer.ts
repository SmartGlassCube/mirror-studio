import type { PointerPosition } from '../types/mirror'

export type PointerUpdate = { position: PointerPosition | null; pinching: boolean }
type PointerListener = (update: PointerUpdate) => void

const listeners = new Set<PointerListener>()

// POINTER messages (~30/s) for widgets that follow the hand themselves, like the drawing canvas.
// Plain callbacks instead of React state, so they don't re-render anything. Returns an unsubscribe.
export function onPointer(listener: PointerListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishPointer(update: PointerUpdate) {
  for (const listener of listeners) {
    listener(update)
  }
}
