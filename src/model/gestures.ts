// The computer-vision moves the SDK recognizes (smartmirror/vision/gestures/), as edge triggers.
// Only discrete events are offered for edges and bindings: a continuous gesture's
// *_update events fire every frame and would flip pages back and forth.

export type GestureInfo = {
  name: string
  label: string
  family: 'Two-finger swipe' | 'Open-hand swipe' | 'Click' | 'Pinch' | 'Scroll' | 'Zoom'
  how: string
  icon: string
  // Also used by the default widget bindings (swipes cycle text items, pinch drags widgets).
  sharedWithWidgets?: boolean
}

export const GESTURES: GestureInfo[] = [
  { name: 'two_fingers_swipe_left', label: 'Two fingers ← left', family: 'Two-finger swipe', icon: '✌←', how: 'Index and middle up, others folded; move the hand quickly to your left.' },
  { name: 'two_fingers_swipe_right', label: 'Two fingers → right', family: 'Two-finger swipe', icon: '✌→', how: 'Index and middle up, others folded; move the hand quickly to your right.' },
  { name: 'two_fingers_swipe_up', label: 'Two fingers ↑ up', family: 'Two-finger swipe', icon: '✌↑', how: 'Index and middle up; move the hand quickly upward.' },
  { name: 'two_fingers_swipe_down', label: 'Two fingers ↓ down', family: 'Two-finger swipe', icon: '✌↓', how: 'Index and middle up; move the hand quickly downward.' },
  { name: 'swipe_left', label: 'Open hand ← left', family: 'Open-hand swipe', icon: '✋←', how: 'Open hand (3+ fingers up); sweep it to your left.', sharedWithWidgets: true },
  { name: 'swipe_right', label: 'Open hand → right', family: 'Open-hand swipe', icon: '✋→', how: 'Open hand; sweep it to your right.', sharedWithWidgets: true },
  { name: 'swipe_up', label: 'Open hand ↑ up', family: 'Open-hand swipe', icon: '✋↑', how: 'Open hand; sweep it upward.', sharedWithWidgets: true },
  { name: 'swipe_down', label: 'Open hand ↓ down', family: 'Open-hand swipe', icon: '✋↓', how: 'Open hand; sweep it downward.', sharedWithWidgets: true },
  { name: 'left_click', label: 'Left click', family: 'Click', icon: '☝·', how: 'From the two-finger pose, fold the index finger.' },
  { name: 'right_click', label: 'Right click', family: 'Click', icon: '·☝', how: 'From the two-finger pose, fold the middle finger.' },
  { name: 'pinch_start', label: 'Pinch', family: 'Pinch', icon: '🤏', how: 'Touch thumb and index tips together.', sharedWithWidgets: true },
  { name: 'pinch_end', label: 'Pinch release', family: 'Pinch', icon: '🤏·', how: 'Open a pinch again.', sharedWithWidgets: true },
  { name: 'scroll_start', label: 'Scroll', family: 'Scroll', icon: '✌↕', how: 'Two-finger pose moving up or down steadily.', sharedWithWidgets: true },
  { name: 'zoom_start_pinky_up', label: 'Zoom (pinky up)', family: 'Zoom', icon: '🤙', how: 'Thumb–index span opening or closing with the pinky raised.' },
  { name: 'zoom_start_no_pinky', label: 'Zoom (pinky down)', family: 'Zoom', icon: '👌', how: 'Thumb–index span opening or closing, pinky folded.' },
]

// Every event the detector can emit, for the test console's simulate buttons and the log.
export const ALL_EVENT_NAMES = [
  ...GESTURES.map((g) => g.name),
  'pinch_move',
  'scroll_update',
  'scroll_end',
  'zoom_update_pinky_up',
  'zoom_end_pinky_up',
  'zoom_update_no_pinky',
  'zoom_end_no_pinky',
]

export const gestureInfo = (name: string): GestureInfo =>
  GESTURES.find((g) => g.name === name) ?? {
    name,
    label: name,
    family: 'Click',
    icon: '★',
    how: 'A custom gesture from your own Python code.',
  }
