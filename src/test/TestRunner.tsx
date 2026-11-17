import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FlowCanvas from '../editor/FlowCanvas'
import MirrorScreen from '../mirror/MirrorScreen'
import { publishPointer } from '../mirror/services/pointer'
import { GESTURES, gestureInfo } from '../model/gestures'
import { GestureDetector, HAND_CONNECTIONS, pointerFor, type GestureEvent, type Hands, type Signals } from '../runtime/gestureEngine'
import { detectHands, loadHandLandmarker } from '../runtime/handTracker'
import { MirrorSimulator, type Outcome } from '../runtime/simulator'
import { useStudio } from '../store'

type LogEntry = Outcome & { at: number; key: number; simulated: boolean }

// Keyboard stand-ins for the gestures, so links can be tried without a camera.
const KEYS: Record<string, string> = {
  ArrowLeft: 'two_fingers_swipe_left',
  ArrowRight: 'two_fingers_swipe_right',
  ArrowUp: 'two_fingers_swipe_up',
  ArrowDown: 'two_fingers_swipe_down',
  'Shift+ArrowLeft': 'swipe_left',
  'Shift+ArrowRight': 'swipe_right',
  'Shift+ArrowUp': 'swipe_up',
  'Shift+ArrowDown': 'swipe_down',
  c: 'left_click',
  v: 'right_click',
  p: 'pinch_start',
}
const KEY_LABEL = Object.fromEntries(Object.entries(KEYS).map(([k, g]) => [g, k.replace('Arrow', '').replace('Shift+', '⇧')]))

// Continuous events that would flood the log.
const QUIET = new Set(['pinch_move', 'scroll_update', 'zoom_update_pinky_up', 'zoom_update_no_pinky'])
const FRAME_MS = 1000 / 30 // the SDK's camera rate; several thresholds are per frame

export default function TestRunner() {
  const project = useStudio((s) => s.project)
  const simulator = useRef<MirrorSimulator | null>(null)
  simulator.current ??= new MirrorSimulator(project)
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick((n) => n + 1), [])
  const [log, setLog] = useState<LogEntry[]>([])
  const [fired, setFired] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const [camera, setCamera] = useState<'off' | 'loading' | 'on' | 'error'>('off')
  const [cameraError, setCameraError] = useState('')
  const [signals, setSignals] = useState<Signals | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number; pinching: boolean } | null>(null)
  const [swapHands, setSwapHands] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const swapRef = useRef(swapHands)
  swapRef.current = swapHands
  const keyRef = useRef(0)

  useEffect(() => {
    simulator.current!.setProject(project)
    rerender()
  }, [project, rerender])

  const handle = useCallback(
    (events: GestureEvent[], simulated: boolean) => {
      const sim = simulator.current!
      const outcomes = sim.handle(events, performance.now() / 1000)
      const visible = outcomes.filter((o) => !(QUIET.has(o.event) && (o.stage === 'ignored' || (o.stage === 'widget' && o.what === 'moved'))))
      if (outcomes.some((o) => o.stage !== 'ignored')) rerender()
      if (!visible.length) return
      setLog((current) => [...visible.map((o) => ({ ...o, at: Date.now(), key: keyRef.current++, simulated })).reverse(), ...current].slice(0, 80))
      const nav = [...visible].reverse().find((o) => o.stage === 'edge' || o.stage === 'binding')
      if (nav && (nav.stage === 'edge' || nav.stage === 'binding')) {
        setFired(nav.stage === 'edge' ? nav.edgeId : nav.bindingId)
        setToast({ text: `${gestureInfo(nav.event).icon} ${project.pages.find((p) => p.id === nav.to)?.name ?? nav.to}`, key: keyRef.current })
      } else if (visible[0]) {
        setToast({ text: `${gestureInfo(visible[0].event).icon} ${gestureInfo(visible[0].event).label}`, key: keyRef.current })
      }
    },
    [project.pages, rerender],
  )

  // The camera loop and key handler outlive renders: they read the latest values through refs.
  const handleRef = useRef(handle)
  handleRef.current = handle
  const pointerRef = useRef(pointer)
  pointerRef.current = pointer

  const simulate = useCallback(
    (name: string) => {
      const pointer = pointerRef.current
      const location: [number, number] = pointer ? [pointer.x, pointer.y] : [0.5, 0.5]
      const events: GestureEvent[] = [{ name, hand: 'right', location }]
      // A pinch from the keyboard is a tap: grab and release.
      if (name === 'pinch_start') events.push({ name: 'pinch_end', hand: 'right', location })
      handleRef.current(events, true)
    },
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const gesture = KEYS[`${e.shiftKey ? 'Shift+' : ''}${e.key}`] ?? KEYS[e.key.toLowerCase()]
      if (gesture) {
        e.preventDefault()
        simulate(gesture)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [simulate])

  useEffect(() => {
    if (!fired) return
    const timer = setTimeout(() => setFired(null), 1400)
    return () => clearTimeout(timer)
  }, [fired, log])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamera('off')
    setSignals(null)
    setPointer(null)
    publishPointer({ position: null, pinching: false })
  }, [])

  const startCamera = async () => {
    setCamera('loading')
    setCameraError('')
    try {
      const [stream, landmarker] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false }), loadHandLandmarker()])
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      setCamera('on')
      runLoop(landmarker)
    } catch (error) {
      const e = error as Error
      setCameraError(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the address bar, then try again.' : e.name === 'NotFoundError' ? 'No camera found.' : e.message)
      setCamera('error')
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }

  const runLoop = (landmarker: HandLandmarker) => {
    const detector = new GestureDetector()
    let last = 0
    const step = (now: number) => {
      const video = videoRef.current
      if (!streamRef.current || !video) return
      requestAnimationFrame(step)
      if (now - last < FRAME_MS || video.readyState < 2) return
      last = now
      let hands: Hands = detectHands(landmarker, video, now)
      if (swapRef.current) hands = { left: hands.right, right: hands.left }
      const { signals: s, events } = detector.process(hands, now / 1000)
      draw(hands, s)
      setSignals(s)
      const p = pointerFor(hands, s)
      setPointer(p.position ? { x: p.position[0], y: p.position[1], pinching: p.pinching } : null)
      publishPointer({ position: p.position ? { x: p.position[0], y: p.position[1] } : null, pinching: p.pinching })
      if (events.length) handleRef.current(events, false)
    }
    requestAnimationFrame(step)
  }

  // Skeletons on the mirrored preview (landmarks are already mirrored).
  const draw = (hands: Hands, s: Signals) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const side of ['left', 'right'] as const) {
      const lm = hands[side].landmarks
      if (!lm) continue
      ctx.strokeStyle = side === 'right' ? '#fd7a33' : '#8b7cff'
      ctx.lineWidth = 3
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath()
        ctx.moveTo(lm[a][0] * canvas.width, lm[a][1] * canvas.height)
        ctx.lineTo(lm[b][0] * canvas.width, lm[b][1] * canvas.height)
        ctx.stroke()
      }
      ctx.fillStyle = s.pinching[side] ? '#3fd16b' : '#ffffff'
      for (const p of lm) {
        ctx.beginPath()
        ctx.arc(p[0] * canvas.width, p[1] * canvas.height, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.font = 'bold 16px system-ui'
      ctx.fillText(side, lm[0][0] * canvas.width + 8, lm[0][1] * canvas.height)
    }
  }

  useEffect(() => stopCamera, [stopCamera])

  const sim = simulator.current
  const page = sim.page()
  const linked = useMemo(() => new Set([...project.edges.filter((e) => e.from === sim.currentPage).map((e) => e.gesture), ...project.bindings.map((b) => b.gesture)]), [project, sim.currentPage])
  const side = signals ? (signals.right_detected ? 'right' : signals.left_detected ? 'left' : null) : null

  return (
    <div className="test">
      <section className="test-col">
        <div className="test-head">
          <span className="grow">
            Mirror · <span style={{ color: 'var(--ok)' }}>{page?.name}</span>
          </span>
          <select className="select" style={{ width: 160 }} value={sim.currentPage} onChange={(e) => (sim.goto(e.target.value), rerender())}>
            {project.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() => {
              simulator.current = new MirrorSimulator(project)
              setLog([])
              rerender()
            }}
          >
            Restart
          </button>
        </div>
        <div className="test-mirror">
          {page ? (
            <MirrorScreen widgets={page.widgets} widgetTypes={project.widgetTypes} screen={project.settings.screen} runtime={sim.runtime}>
              {pointer ? <div className={`hand-cursor${pointer.pinching ? ' hand-cursor--pinching' : ''}`} style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }} /> : null}
              {toast ? (
                <div key={toast.key} className="toast">
                  {toast.text}
                </div>
              ) : null}
            </MirrorScreen>
          ) : null}
        </div>
      </section>

      <section className="test-col">
        <div className="test-head">
          <span className="grow">Camera</span>
          <label className="check" title="If your left hand shows as right, swap them">
            <input type="checkbox" checked={swapHands} onChange={(e) => setSwapHands(e.target.checked)} /> swap hands
          </label>
          {camera === 'on' ? (
            <button className="btn" onClick={stopCamera}>
              Stop
            </button>
          ) : (
            <button className="btn btn--primary" disabled={camera === 'loading'} onClick={startCamera}>
              {camera === 'loading' ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>
        <div className="camera">
          <video ref={videoRef} muted playsInline />
          <canvas ref={canvasRef} />
          {camera !== 'on' ? (
            <div className="camera-empty">
              {camera === 'error' ? (
                <span className="error-text">{cameraError}</span>
              ) : camera === 'loading' ? (
                'Loading the hand tracker (first time ~8 MB)…'
              ) : (
                <span>
                  Start the camera to test with your hands. Video stays in your browser: hand tracking runs locally with MediaPipe, like on the mirror.
                </span>
              )}
            </div>
          ) : null}
        </div>
        <div className="signals">
          {signals ? (
            <>
              <span className={`signal${signals.hand_count ? ' signal--on' : ''}`}>hands {signals.hand_count}</span>
              {side
                ? (['index_up', 'middle_up', 'ring_up', 'pinky_up', 'pinching', 'open_hand', 'hover_posture'] as const).map((k) => (
                    <span key={k} className={`signal${signals[k][side] ? ' signal--on' : ''}`}>
                      {k}
                    </span>
                  ))
                : null}
            </>
          ) : (
            <span className="hint">Live hand signals show here.</span>
          )}
        </div>
        <div className="test-head" style={{ borderTop: 0 }}>
          <span className="grow">Simulate a gesture</span>
          <span className="hint">orange = does something here</span>
        </div>
        <div className="sim-grid">
          {GESTURES.map((g) => (
            <button key={g.name} className={`sim-btn${linked.has(g.name) ? ' sim-btn--linked' : ''}`} onClick={() => simulate(g.name)} title={g.how}>
              <span>{g.icon}</span>
              <span>{g.label}</span>
              {KEY_LABEL[g.name] ? <span className="kbd">{KEY_LABEL[g.name]}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="test-col test-col--flow">
        <div className="mini-flow">
          <FlowCanvas readOnly livePage={sim.currentPage} firedEdgeId={fired} />
        </div>
        <div className="test-head">
          <span className="grow">What happened</span>
          <button className="btn btn--small" onClick={() => setLog([])}>
            Clear
          </button>
        </div>
        <div className="log">
          {log.length === 0 ? <div className="empty">Gestures and what they did will appear here.</div> : null}
          {log.map((entry) => (
            <div key={entry.key} className={`log-row log-row--${entry.stage}`}>
              <time>{new Date(entry.at).toLocaleTimeString([], { hour12: false })}</time>
              <span>
                <b>{entry.event}</b>
                {entry.simulated ? <span className="hint"> (simulated)</span> : null}{' '}
                {entry.stage === 'edge' || entry.stage === 'binding'
                  ? `→ ${project.pages.find((p) => p.id === entry.to)?.name ?? entry.to}${entry.stage === 'binding' ? ' (any page)' : ''}`
                  : entry.stage === 'widget'
                    ? `· ${entry.what}`
                    : `· ${entry.why}`}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
