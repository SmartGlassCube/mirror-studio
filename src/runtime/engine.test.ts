import { describe, expect, it } from 'vitest'
import { compileWidgetSource, loadCompiledWidget } from '../mirror/customWidgets'
import { demoProject } from '../model/examples'
import { exportProject, parseProject } from '../model/io'
import { lintProject } from '../model/lint'
import { WIDGET_TEMPLATES, BLANK_SOURCE } from '../model/templates'
import { applyActions } from '../ai/actions'
import { emptyHand, GestureDetector, handFromLandmarks, type Hands, type Landmark } from './gestureEngine'
import { MirrorSimulator } from './simulator'
import { navigateText, textView } from './textWidget'

// Port of the SDK's tests/hands.py make_hand(): an upright hand whose middle PIP is at (x, y).
const FINGERS: Record<string, [number, number, number, number, number]> = {
  index: [-0.03, 5, 6, 7, 8],
  middle: [0, 9, 10, 11, 12],
  ring: [0.03, 13, 14, 15, 16],
  pinky: [0.06, 17, 18, 19, 20],
}
function makeHand(x = 0.5, y = 0.5, fingersUp = ['index', 'middle', 'ring', 'pinky'], pinch = false) {
  const lm: Landmark[] = Array.from({ length: 21 }, () => [x, y, 0])
  lm[0] = [x, y + 0.2, 0]
  for (const [name, [dx, mcp, pip, dip, tip]] of Object.entries(FINGERS)) {
    const fx = x + dx
    const up = fingersUp.includes(name)
    lm[mcp] = [fx, y + 0.07, 0]
    lm[pip] = [fx, y, 0]
    lm[dip] = [fx, up ? y - 0.05 : y + 0.03, 0]
    lm[tip] = [fx, up ? y - 0.1 : y + 0.05, 0]
  }
  const indexTip = lm[8]
  const thumbTip: Landmark = pinch ? [indexTip[0] - 0.01, indexTip[1], 0] : [indexTip[0] - 0.2, indexTip[1] + 0.1, 0]
  lm[1] = [x - 0.06, y + 0.16, 0]
  lm[2] = [x - 0.09, y + 0.12, 0]
  lm[3] = [(lm[2][0] + thumbTip[0]) / 2, (lm[2][1] + thumbTip[1]) / 2, 0]
  lm[4] = thumbTip
  return handFromLandmarks(lm)
}
const hands = (sides: Partial<Hands>): Hands => ({ left: sides.left ?? emptyHand(), right: sides.right ?? emptyHand() })
const run = (detector: GestureDetector, frames: Hands[], step = 0.03) => frames.map((f, i) => detector.process(f, i * step).events.map((e) => e.name))

describe('gesture engine (same cases as the SDK tests)', () => {
  it('reports a pinch lifecycle with movement', () => {
    const d = new GestureDetector()
    const frames = [hands({ right: makeHand(0.5, 0.5, undefined, true) }), hands({ right: makeHand(0.55, 0.5, undefined, true) }), hands({ right: makeHand(0.55, 0.5) })]
    const results = frames.map((f, i) => d.process(f, i * 0.03).events.filter((e) => e.name.startsWith('pinch')))
    expect(results.map((r) => r.map((e) => e.name))).toEqual([['pinch_start'], ['pinch_move'], ['pinch_end']])
    expect(results[1][0].data!.dx).toBeCloseTo(0.05)
  })

  it('mirrors open-hand swipes and ignores the return motion', () => {
    const d = new GestureDetector()
    const still = Array.from({ length: 6 }, () => hands({ right: makeHand(0.8, 0.5) }))
    const left = Array.from({ length: 7 }, (_, i) => hands({ right: makeHand(0.8 - 0.03 * (i + 1), 0.5) }))
    const back = Array.from({ length: 7 }, (_, i) => hands({ right: makeHand(0.59 + 0.03 * (i + 1), 0.5) }))
    const swipes = run(d, [...still, ...left, ...back]).flat().filter((n) => n.includes('swipe'))
    expect(swipes).toEqual(['swipe_right'])
  })

  it('needs the two-finger posture for two-finger swipes', () => {
    const d = new GestureDetector()
    const two = ['index', 'middle']
    const frames = [...Array.from({ length: 6 }, () => hands({ left: makeHand(0.3, 0.5, two) })), ...Array.from({ length: 7 }, (_, i) => hands({ left: makeHand(0.3 + 0.03 * (i + 1), 0.5, two) }))]
    expect(run(d, frames).flat().filter((n) => n.includes('swipe'))).toEqual(['two_fingers_swipe_left'])
  })

  it('detects a left click from the hover posture', () => {
    const d = new GestureDetector()
    const frames = [hands({ right: makeHand(0.5, 0.5, ['index', 'middle']) }), hands({ right: makeHand(0.5, 0.5, ['middle']) })]
    expect(run(d, frames).flat()).toContain('left_click')
  })
})

describe('simulator (StateManager port)', () => {
  const at = (name: string, location: [number, number] = [0.5, 0.5]) => ({ name, hand: 'right' as const, location })

  it('follows links, respects the page cooldown, and gives "any page" gestures priority', () => {
    const sim = new MirrorSimulator(demoProject())
    expect(sim.currentPage).toBe('home')
    expect(sim.handle([at('two_fingers_swipe_right')], 10)[0]).toMatchObject({ stage: 'edge', to: 'agenda' })
    // Same event within node_navigation_cooldown (0.8 s): ignored.
    expect(sim.handle([at('two_fingers_swipe_left')], 10.1)[0].stage).toBe('edge') // different event key
    expect(sim.currentPage).toBe('home')
    expect(sim.handle([at('two_fingers_swipe_right')], 10.3)[0]).toMatchObject({ stage: 'ignored' })
    sim.goto('agenda')
    expect(sim.handle([at('right_click')], 20)[0]).toMatchObject({ stage: 'binding', to: 'home' })
  })

  it('cycles text lines with open-hand swipes and drags widgets with pinches', () => {
    const sim = new MirrorSimulator(demoProject())
    const text = sim.page()!.widgets.find((w) => w.type === 'text')!
    expect(sim.handle([at('swipe_left', [text.position.x, text.position.y])], 1)[0]).toMatchObject({ stage: 'widget', what: 'next line' })
    expect(sim.runtime[text.id].nav).toEqual({ key: 0, item: 1 })
    const out = sim.handle([at('pinch_start', [text.position.x, text.position.y]), { name: 'pinch_move', hand: 'right', location: [0.5, 0.5], data: { dx: 0.1, dy: 0 } }, at('pinch_end')], 2)
    expect(out.map((o) => o.stage)).toEqual(['widget', 'widget', 'widget'])
    expect(sim.runtime[text.id].position!.x).toBeCloseTo(text.position.x + 0.1)
  })
})

describe('text widget port', () => {
  it('navigates sections and items like TextWidget', () => {
    const content = { a: ['1', '2'], b: ['3'] }
    expect(textView(content).content).toBe('1')
    expect(navigateText(content, { key: 0, item: 0 }, 1, 0)).toEqual({ key: 0, item: 1 })
    expect(navigateText(content, { key: 0, item: 1 }, 0, 1)).toEqual({ key: 1, item: 0 })
    expect(navigateText('static', { key: 0, item: 0 }, 1, 0)).toBeNull()
  })
})

describe('projects', () => {
  it('round-trips through JSON and YAML, with compiled widget code', () => {
    const project = demoProject()
    for (const format of ['json', 'yaml'] as const) {
      const text = exportProject(project, format)
      expect(text).toContain('compiled')
      const back = parseProject(text)
      expect(back.pages).toEqual(project.pages)
      expect(back.edges).toEqual(project.edges)
      expect(back.bindings).toEqual(project.bindings)
      expect(back.widgetTypes.map((t) => t.source)).toEqual(project.widgetTypes.map((t) => t.source))
    }
  })

  it('rejects files that are not projects', () => {
    expect(() => parseProject('{"hello": 1}')).toThrow(/Not a Smart Mirror Studio project/)
    expect(() => parseProject('not: [valid')).toThrow()
  })

  it('has no errors in the demo, and flags duplicate gestures', () => {
    const project = demoProject()
    expect(lintProject(project).filter((p) => p.level === 'error')).toEqual([])
    project.edges.push({ id: 'dup', from: 'home', to: 'draw', gesture: 'two_fingers_swipe_right' })
    expect(lintProject(project).some((p) => p.level === 'error' && p.edgeId === 'dup')).toBe(true)
  })

  it('applies assistant plans and reports bad steps', () => {
    const { project, errors } = applyActions(demoProject(), [
      { op: 'add_page', id: 'tokyo', name: 'Tokyo' },
      { op: 'add_widget', page: 'tokyo', type: 'weather', x: 0.5, y: 0.2, data: { kind: 'weather', city: 'Tokyo', latitude: 35.68, longitude: 139.69 } },
      { op: 'add_link', from: 'home', to: 'tokyo', gesture: 'two_fingers_swipe_up' },
      { op: 'add_link', from: 'home', to: 'tokyo', gesture: 'two_fingers_swipe_up' },
      { op: 'create_widget_type', type: 'clock', name: 'Clock 2', source: 'export default () => <div className="widget">hi</div>' },
      { op: 'add_widget', page: 'tokyo', type: 'clock' },
      { op: 'teleport' },
    ])
    expect(project.pages.find((p) => p.id === 'tokyo')!.widgets.map((w) => w.type)).toEqual(['weather', 'clock_2'])
    expect(errors).toHaveLength(2) // the duplicate link and the unknown op
  })
})

describe('custom widgets', () => {
  it('compiles every template and the blank starter into a component', () => {
    for (const source of [BLANK_SOURCE, ...WIDGET_TEMPLATES.map((t) => t.source)]) {
      const result = compileWidgetSource(source)
      expect(result.ok).toBe(true)
      if (result.ok) expect(typeof loadCompiledWidget(result.code)).toBe('function')
    }
  })

  it('refuses imports other than react', () => {
    const result = compileWidgetSource("import x from 'lodash'\nexport default () => x")
    expect(result.ok).toBe(true)
    if (result.ok) expect(() => loadCompiledWidget(result.code)).toThrow(/only import 'react'/)
  })
})
