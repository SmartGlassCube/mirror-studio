// Wire format sent by the Python backend: see docs/protocol.md (backend/smartmirror/server/websocket.py).

export type Position = {
  x?: number
  y?: number
}

// One widget as serialized by BaseWidget.serialize() in Python.
export type MirrorWidget<TData = unknown, TMetadata = Record<string, unknown>> = {
  id: string
  type: string
  position?: Position
  content?: string | null
  data?: TData | null
  metadata?: TMetadata
  draggable?: boolean
  dragging?: boolean
}

// StateManager.get_state_snapshot(): the active page and the ids of all pages.
export type MirrorState = {
  nodeId: string | null
  nodeIds: string[]
  widgets: MirrorWidget[]
}

export type GestureEventInfo = {
  name: string
  hand: string | null
}

// Small annotated webcam preview (JPEG data URL) plus the latest gestures.
export type CameraFrame = {
  image: string
  events: GestureEventInfo[]
}

// 0..1 fractions of the screen, like widget positions.
export type PointerPosition = {
  x: number
  y: number
}

export type BackendMessage =
  | { type: 'INIT' | 'STATE_UPDATE'; state: MirrorState }
  | ({ type: 'CAMERA_FRAME' } & CameraFrame)
  // Index fingertip for the cursor (server/hand_pointer.py); null when the hand is lost.
  // While `pinching`, the point between thumb and index: the drawing page's pen is down.
  | { type: 'POINTER'; position: PointerPosition | null; pinching: boolean }
  // Transcript of what the chatbot heard, shown next to the camera preview; '' = only the wake word.
  | { type: 'ASSISTANT_HEARD'; text: string }
  // Someone talked to the chatbot: wakes Abdo (see assistant/Abdo.tsx).
  | { type: 'ASSISTANT_WAKE' }
  // Chatbot reply: wakes Abdo and types `text` into his speech bubble.
  | { type: 'ASSISTANT_SAY'; text: string }
