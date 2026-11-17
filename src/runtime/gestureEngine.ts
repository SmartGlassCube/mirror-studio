// A line-by-line port of the SDK's gesture pipeline (glasscube/vision/gesture_detector.py and
// gestures/*.py), so what fires here fires on the mirror. Keep the numbers in sync with the SDK.

export type Side = 'left' | 'right'
export const SIDES: Side[] = ['left', 'right']
export type Point = [number, number]
export type Landmark = [number, number, number]

export type HandData = { landmarks: Landmark[] | null; palmCenter: Point | null; isRaised: boolean }
export type Hands = Record<Side, HandData>

export type GestureEvent = { name: string; hand: Side | null; location: Point | null; data?: Record<string, number> }

const THUMB_TIP = 4
const INDEX_PIP = 6
const INDEX_TIP = 8
const MIDDLE_MCP = 9
const MIDDLE_PIP = 10
const MIDDLE_TIP = 12
const RING_PIP = 14
const RING_TIP = 16
const PINKY_PIP = 18
const PINKY_TIP = 20
const WRIST = 0

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17],
]

export const emptyHand = (): HandData => ({ landmarks: null, palmCenter: null, isRaised: false })

// LandmarkDetector._build_hand_data
export function handFromLandmarks(landmarks: Landmark[]): HandData {
  return {
    landmarks,
    palmCenter: [landmarks[MIDDLE_MCP][0], landmarks[MIDDLE_MCP][1]],
    isRaised: landmarks[WRIST][1] < 0.5,
  }
}

type PerSide<T> = Record<Side, T>
const perSide = <T,>(fn: (side: Side) => T): PerSide<T> => ({ left: fn('left'), right: fn('right') })

export type Signals = {
  hand_count: number
  left_detected: boolean
  right_detected: boolean
  pinching: PerSide<boolean>
  index_up: PerSide<boolean>
  middle_up: PerSide<boolean>
  ring_up: PerSide<boolean>
  pinky_up: PerSide<boolean>
  hover_posture: PerSide<boolean>
  open_hand: PerSide<boolean>
  pointer_position: PerSide<Point | null>
  vertical_delta: PerSide<number | null>
  thumb_index_distance: PerSide<number | null>
  thumb_index_distance_delta: PerSide<number | null>
  zoom_mode_pinky_up: PerSide<boolean>
  zoom_mode_no_pinky: PerSide<boolean>
}

type Context = { hands: Hands; signals: Signals; timestamp: number }

interface Gesture {
  detect(context: Context): GestureEvent[]
}

const fingerUp = (hand: HandData, tip: number, pip: number) => hand.landmarks !== null && hand.landmarks[tip][1] < hand.landmarks[pip][1]
const span = (hand: HandData) => (hand.landmarks ? Math.hypot(hand.landmarks[THUMB_TIP][0] - hand.landmarks[INDEX_TIP][0], hand.landmarks[THUMB_TIP][1] - hand.landmarks[INDEX_TIP][1]) : null)
const pointer = (hand: HandData): Point | null => (hand.landmarks ? [hand.landmarks[INDEX_TIP][0], hand.landmarks[INDEX_TIP][1]] : hand.palmCenter)

class PinchGesture implements Gesture {
  private pinching = perSide(() => false)
  private prev = perSide<Point | null>(() => null)
  detect({ signals }: Context) {
    const events: GestureEvent[] = []
    for (const side of SIDES) {
      const current = signals.pointer_position[side]
      const previous = this.prev[side]
      const now = signals.pinching[side]
      if (now && !this.pinching[side]) events.push({ name: 'pinch_start', hand: side, location: current })
      else if (now && current && previous) {
        events.push({ name: 'pinch_move', hand: side, location: current, data: { dx: current[0] - previous[0], dy: current[1] - previous[1] } })
      } else if (!now && this.pinching[side]) events.push({ name: 'pinch_end', hand: side, location: current })
      this.pinching[side] = now
      this.prev[side] = current
    }
    return events
  }
}

class ClickGesture implements Gesture {
  private prevIndex = perSide(() => false)
  private prevMiddle = perSide(() => false)
  private prevHover = perSide(() => false)
  detect({ signals }: Context) {
    const events: GestureEvent[] = []
    for (const side of SIDES) {
      if (this.prevHover[side]) {
        let click: string | null = null
        if (this.prevIndex[side] && !signals.index_up[side] && signals.middle_up[side]) click = 'left_click'
        else if (this.prevMiddle[side] && !signals.middle_up[side] && signals.index_up[side]) click = 'right_click'
        if (click) events.push({ name: click, hand: side, location: signals.pointer_position[side] })
      }
      this.prevIndex[side] = signals.index_up[side]
      this.prevMiddle[side] = signals.middle_up[side]
      this.prevHover[side] = signals.hover_posture[side]
    }
    return events
  }
}

// ContinuousGesture._phase
class Phases {
  private active = new Map<string, boolean>()
  phase(side: Side, triggered: boolean, ended: boolean, names: [string, string, string], location: Point | null, data: Record<string, number>, endData: Record<string, number>, channel = 'default'): GestureEvent[] {
    const key = `${channel}:${side}`
    const active = this.active.get(key) ?? false
    if (triggered) {
      this.active.set(key, true)
      return [{ name: active ? names[1] : names[0], hand: side, location, data }]
    }
    if (active && ended) {
      this.active.set(key, false)
      return [{ name: names[2], hand: side, location, data: endData }]
    }
    return []
  }
}

class ScrollGesture implements Gesture {
  private phases = new Phases()
  constructor(private startDelta = 0.05, private endDelta = 0.02) {}
  detect({ signals }: Context) {
    return SIDES.flatMap((side) => {
      const vy = signals.vertical_delta[side]
      const hover = signals.hover_posture[side]
      return this.phases.phase(
        side,
        hover && vy !== null && Math.abs(vy) >= this.startDelta,
        !hover || vy === null || Math.abs(vy) <= this.endDelta,
        ['scroll_start', 'scroll_update', 'scroll_end'],
        signals.pointer_position[side],
        { velocity_y: vy ?? 0 },
        { velocity_y: vy ?? 0 },
      )
    })
  }
}

class ZoomGesture implements Gesture {
  private phases = new Phases()
  constructor(private startDelta = 0.025, private endDelta = 0.015) {}
  detect({ signals }: Context) {
    const modes: [keyof Signals, [string, string, string]][] = [
      ['zoom_mode_pinky_up', ['zoom_start_pinky_up', 'zoom_update_pinky_up', 'zoom_end_pinky_up']],
      ['zoom_mode_no_pinky', ['zoom_start_no_pinky', 'zoom_update_no_pinky', 'zoom_end_no_pinky']],
    ]
    return SIDES.flatMap((side) => {
      const delta = signals.thumb_index_distance_delta[side]
      return modes.flatMap(([mode, names]) => {
        const inMode = (signals[mode] as PerSide<boolean>)[side]
        return this.phases.phase(
          side,
          inMode && delta !== null && Math.abs(delta) >= this.startDelta,
          !inMode || delta === null || Math.abs(delta) <= this.endDelta,
          names,
          signals.pointer_position[side],
          { span_delta: delta ?? 0 },
          { span_delta: delta ?? 0 },
          mode,
        )
      })
    })
  }
}

type SwipeOptions = { thresholdX: number; thresholdY: number; timeWindow: number; cooldown: number; minSamples: number; warmup: number; minVelocity: number; directionRatio: number }

// PostureSwipeGesture
abstract class PostureSwipe implements Gesture {
  abstract prefix: string
  abstract isReady(context: Context, side: Side): boolean
  abstract trackedPoint(context: Context, side: Side): Point | null
  private history: [number, number, number][] = []
  private activeSide: Side | null = null
  private readySince: number | null = null
  private lastSwipe = -Infinity
  protected o: SwipeOptions

  constructor(options: Partial<SwipeOptions> = {}) {
    this.o = { thresholdX: 0.12, thresholdY: 0.12, timeWindow: 0.5, cooldown: 0.6, minSamples: 4, warmup: 0.12, minVelocity: 0.3, directionRatio: 0.75, ...options }
  }

  private reset() {
    this.history = []
    this.activeSide = null
    this.readySince = null
  }

  detect(context: Context): GestureEvent[] {
    const { signals, timestamp: now } = context
    if (signals.hand_count !== 1) {
      this.reset()
      return []
    }
    const side: Side = signals.left_detected ? 'left' : 'right'
    const point = this.trackedPoint(context, side)
    if (!point || !this.isReady(context, side)) {
      this.reset()
      return []
    }
    if (this.activeSide !== side) {
      this.reset()
      this.activeSide = side
      this.readySince = now
      return []
    }
    if (now - (this.readySince ?? now) < this.o.warmup) return []
    this.history.push([now, point[0], point[1]])
    this.history = this.history.filter((sample) => now - sample[0] < this.o.timeWindow)
    const direction = this.classify()
    if (!direction) return []
    this.history = []
    if (now - this.lastSwipe <= this.o.cooldown) return []
    this.lastSwipe = now
    return [{ name: `${this.prefix}${direction}`, hand: side, location: point }]
  }

  private classify(): string | null {
    const h = this.history
    if (h.length < this.o.minSamples) return null
    const [t0, x0, y0] = h[0]
    const [t1, x1, y1] = h[h.length - 1]
    const dx = x1 - x0
    const dy = y1 - y0
    if (Math.abs(dx) < this.o.thresholdX && Math.abs(dy) < this.o.thresholdY) return null
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const dominant = horizontal ? dx : dy
    if (Math.abs(dominant) / Math.max(1e-6, t1 - t0) < this.o.minVelocity) return null
    if (!this.consistent(horizontal, dominant > 0 ? 1 : -1)) return null
    if (horizontal) return dx < 0 ? 'right' : 'left'
    return dy < 0 ? 'up' : 'down'
  }

  private consistent(horizontal: boolean, sign: number) {
    let matching = 0
    let meaningful = 0
    for (let i = 1; i < this.history.length; i++) {
      const dx = this.history[i][1] - this.history[i - 1][1]
      const dy = this.history[i][2] - this.history[i - 1][2]
      const [main, ortho] = horizontal ? [dx, dy] : [dy, dx]
      if (Math.abs(main) < 0.002) continue
      meaningful++
      if (main * sign > 0 && Math.abs(main) >= Math.abs(ortho)) matching++
    }
    return meaningful >= 3 && matching / meaningful >= this.o.directionRatio
  }
}

class SwipeGesture extends PostureSwipe {
  prefix = 'swipe_'
  isReady({ signals }: Context, side: Side) {
    return signals.open_hand[side]
  }
  trackedPoint({ hands }: Context, side: Side) {
    return hands[side].palmCenter
  }
}

class TwoFingersSwipeGesture extends PostureSwipe {
  prefix = 'two_fingers_swipe_'
  constructor() {
    super({ thresholdX: 0.1, thresholdY: 0.1, timeWindow: 0.4, cooldown: 0.7 })
  }
  isReady({ signals: s }: Context, side: Side) {
    return s.index_up[side] && s.middle_up[side] && !s.ring_up[side] && !s.pinky_up[side] && !s.pinching[side]
  }
  trackedPoint({ signals }: Context, side: Side) {
    return signals.pointer_position[side]
  }
}

// GestureDetector
export class GestureDetector {
  private gestures: Gesture[] = [new PinchGesture(), new ClickGesture(), new ScrollGesture(), new ZoomGesture(), new SwipeGesture(), new TwoFingersSwipeGesture()]
  private wasPinching = perSide(() => false)
  private prevPointer = perSide<Point | null>(() => null)
  private prevSpan = perSide<number | null>(() => null)

  constructor(private pinchStart = 0.045, private pinchEnd = 0.065, private zoomMinSpan = 0.08) {}

  process(hands: Hands, timestamp: number): { signals: Signals; events: GestureEvent[] } {
    const signals = this.buildSignals(hands)
    const context = { hands, signals, timestamp }
    const events = this.gestures.flatMap((g) => g.detect(context))
    for (const side of SIDES) {
      this.wasPinching[side] = signals.pinching[side]
      this.prevPointer[side] = signals.pointer_position[side]
      this.prevSpan[side] = signals.thumb_index_distance[side]
    }
    return { signals, events }
  }

  private buildSignals(hands: Hands): Signals {
    const spans = perSide((s) => span(hands[s]))
    const pinching = perSide((s) => spans[s] !== null && spans[s]! < (this.wasPinching[s] ? this.pinchEnd : this.pinchStart))
    const index_up = perSide((s) => fingerUp(hands[s], INDEX_TIP, INDEX_PIP))
    const middle_up = perSide((s) => fingerUp(hands[s], MIDDLE_TIP, MIDDLE_PIP))
    const ring_up = perSide((s) => fingerUp(hands[s], RING_TIP, RING_PIP))
    const pinky_up = perSide((s) => fingerUp(hands[s], PINKY_TIP, PINKY_PIP))
    const pointers = perSide((s) => pointer(hands[s]))
    const vertical = perSide((s) => {
      const prev = this.prevPointer[s]
      const now = pointers[s]
      return prev && now ? now[1] - prev[1] : null
    })
    const zoomMode = (pinky: boolean) => perSide((s) => spans[s] !== null && !pinching[s] && pinky_up[s] === pinky && spans[s]! >= this.zoomMinSpan)
    const left = hands.left.landmarks !== null
    const right = hands.right.landmarks !== null
    return {
      hand_count: Number(left) + Number(right),
      left_detected: left,
      right_detected: right,
      pinching,
      index_up,
      middle_up,
      ring_up,
      pinky_up,
      hover_posture: perSide((s) => index_up[s] && middle_up[s]),
      open_hand: perSide((s) => [index_up[s], middle_up[s], ring_up[s], pinky_up[s]].filter(Boolean).length >= 3 && !pinching[s]),
      pointer_position: pointers,
      vertical_delta: vertical,
      thumb_index_distance: spans,
      thumb_index_distance_delta: perSide((s) => (spans[s] === null || this.prevSpan[s] === null ? null : spans[s]! - this.prevSpan[s]!)),
      zoom_mode_pinky_up: zoomMode(true),
      zoom_mode_no_pinky: zoomMode(false),
    }
  }
}

// server/hand_pointer.py: the pointer hand's index tip, or between thumb and index while pinching.
export function pointerFor(hands: Hands, signals: Signals, preferred: Side = 'right'): { position: Point | null; pinching: boolean } {
  const side: Side | null = hands[preferred].landmarks ? preferred : hands[preferred === 'right' ? 'left' : 'right'].landmarks ? (preferred === 'right' ? 'left' : 'right') : null
  if (!side) return { position: null, pinching: false }
  const lm = hands[side].landmarks!
  const pinching = signals.pinching[side]
  const position: Point = pinching ? [(lm[THUMB_TIP][0] + lm[INDEX_TIP][0]) / 2, (lm[THUMB_TIP][1] + lm[INDEX_TIP][1]) / 2] : [lm[INDEX_TIP][0], lm[INDEX_TIP][1]]
  return { position, pinching }
}
