import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge as FlowEdge,
  type EdgeProps,
  type Node as FlowNode,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, Copy, Globe, Maximize, Maximize2, Minus, PanelsTopLeft, Play, Plus, Trash2, Wand2, X, Zap } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import MirrorScreen from '../mirror/MirrorScreen'
import { GESTURES, gestureInfo } from '../model/gestures'
import { lintProject } from '../model/lint'
import type { Page, Project } from '../model/project'
import { useStudio } from '../store'
import { WidgetIcon } from './icons'
import { addLinkedPage } from './NodeCreator'

export const ANY_NODE = '__any__'
export const DRAG_PAGE = 'application/x-mirror-page'
export const DRAG_WIDGET = 'application/x-mirror-widget'

type Issues = { errors: number; warnings: number; messages: string[] }
type PageNodeData = { page: Page; project: Project; isStart: boolean; live: boolean; dropTarget: boolean; readOnly: boolean; issues?: Issues }
type GestureEdgeData = { gesture: string; binding?: boolean; fired?: boolean; readOnly?: boolean }

const PageNode = memo(function PageNode({ data, selected }: NodeProps<FlowNode<PageNodeData>>) {
  const { page, project, isStart, live, dropTarget, readOnly, issues } = data
  const { openDesigner, updateSettings, duplicatePage, removePage } = useStudio.getState()
  const hasOutgoing = project.edges.some((e) => e.from === page.id)
  const shown = page.widgets.slice(0, 6)
  return (
    <div className={`pnode${selected ? ' is-selected' : ''}${isStart ? ' pnode--start' : ''}${live ? ' is-live' : ''}${dropTarget ? ' is-drop' : ''}`}>
      {!readOnly ? (
        <div className="node-toolbar nodrag">
          <button title="Add the next page, linked by a gesture" onClick={() => addLinkedPage(page.id)}>
            <Plus size={15} />
          </button>
          <button title="Design this page (double-click)" onClick={() => openDesigner(page.id)}>
            <Maximize2 size={15} />
          </button>
          {!isStart ? (
            <button title="Make it the start page" onClick={() => updateSettings({ initialPage: page.id })}>
              <Zap size={15} />
            </button>
          ) : null}
          <button title="Duplicate" onClick={() => duplicatePage(page.id)}>
            <Copy size={15} />
          </button>
          {project.pages.length > 1 ? (
            <button title="Delete" onClick={() => removePage(page.id)}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Forward links leave on the right and enter on the left (upper handles); links going back
          to a page further left use the lower pair, so a there-and-back pair draws as two curves. */}
      <Handle id="in-l" type="target" position={Position.Left} style={{ top: '40%' }} />
      <Handle id="out-l" type="source" position={Position.Left} style={{ top: '64%' }} className="handle--back" />

      <div className="pnode-card">
        <div className="pnode-head">
          <span className="pnode-icon">{isStart ? <Zap size={16} /> : <PanelsTopLeft size={16} />}</span>
          <span className="pnode-title">
            <strong>{page.name}</strong>
            <small>{isStart ? 'Start page · ' : ''}{page.widgets.length} widget{page.widgets.length === 1 ? '' : 's'}</small>
          </span>
          {live ? <span className="live-dot" title="On screen" /> : null}
          {issues && (issues.errors || issues.warnings) ? (
            <span className={`node-issue${issues.errors ? ' node-issue--error' : ''}`} title={issues.messages.join('\n')}>
              <AlertTriangle size={14} />
            </span>
          ) : null}
        </div>
        <div className="pnode-thumb">
          <MirrorScreen widgets={page.widgets} widgetTypes={project.widgetTypes} screen={project.settings.screen} />
        </div>
        <div className="pnode-foot">
          {shown.length ? (
            shown.map((w) => <WidgetIcon key={w.id} type={w.type} custom={project.widgetTypes.find((t) => t.type === w.type)} size={13} />)
          ) : (
            <span className="pnode-empty">Empty page — double-click to add widgets</span>
          )}
          {page.widgets.length > shown.length ? <span className="pnode-more">+{page.widgets.length - shown.length}</span> : null}
        </div>
      </div>

      <Handle id="out-r" type="source" position={Position.Right} style={{ top: '40%' }} />
      <Handle id="in-r" type="target" position={Position.Right} style={{ top: '64%' }} className="handle--back" />
      {!readOnly && !hasOutgoing ? (
        <button className="node-add nodrag" title="Add the next page, linked by a gesture" onClick={() => addLinkedPage(page.id)}>
          <Plus size={14} />
        </button>
      ) : null}
    </div>
  )
})

const AnyNode = memo(function AnyNode() {
  return (
    <div className="anode" title="Gestures from here work on every page (event bindings)">
      <div className="anode-tile">
        <Globe size={22} />
      </div>
      <div className="anode-label">
        <strong>Any page</strong>
        <small>Gestures that work everywhere</small>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
})

function GestureEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<FlowEdge<GestureEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  const info = gestureInfo(data?.gesture ?? '')
  const { select, removeEdge, removeBinding } = useStudio.getState()
  const state = data?.fired ? 'fired' : selected ? 'selected' : data?.binding ? 'binding' : 'idle'
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={`gedge gedge--${state}`} interactionWidth={24} />
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan edge-label--${state}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => (data?.binding ? select({ kind: 'settings' }) : select({ kind: 'edge', id }))}
          title={`${info.label}: ${info.how}`}
        >
          <span className="edge-label__icon">{info.icon}</span>
          <span>{info.label}</span>
          {!data?.readOnly ? (
            <button
              className="edge-label__remove"
              title="Remove"
              onClick={(e) => {
                e.stopPropagation()
                if (data?.binding) removeBinding(id)
                else removeEdge(id)
              }}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { page: PageNode, any: AnyNode }
const edgeTypes = { gesture: GestureEdge }

// A gesture this page doesn't use yet, two-finger swipes first (the page-change convention).
export function freeGesture(project: Project, from: string) {
  const used = new Set(project.edges.filter((e) => e.from === from).map((e) => e.gesture))
  return GESTURES.find((g) => !used.has(g.name))?.name ?? 'two_fingers_swipe_right'
}

// Columns by distance from the start page along the links, like n8n's "Tidy up".
export function tidyLayout(project: Project): Project {
  const depth = new Map<string, number>([[project.settings.initialPage, 0]])
  const queue = [project.settings.initialPage]
  while (queue.length) {
    const id = queue.shift()!
    for (const edge of project.edges.filter((e) => e.from === id)) {
      if (!depth.has(edge.to)) {
        depth.set(edge.to, depth.get(id)! + 1)
        queue.push(edge.to)
      }
    }
  }
  const last = Math.max(0, ...depth.values())
  const columns = new Map<number, string[]>()
  for (const page of project.pages) {
    const column = depth.get(page.id) ?? last + 1 // pages no link reaches go in a column of their own
    columns.set(column, [...(columns.get(column) ?? []), page.id])
  }
  const place = new Map<string, { x: number; y: number }>()
  for (const [column, ids] of columns) {
    ids.forEach((id, row) => place.set(id, { x: column * 360, y: (row - (ids.length - 1) / 2) * 330 }))
  }
  return { ...project, pages: project.pages.map((p) => ({ ...p, canvas: place.get(p.id) ?? p.canvas })) }
}

// Arrowheads for each edge state; React Flow's own markers can't take a CSS variable as colour.
function EdgeMarkers() {
  return (
    <svg className="edge-markers" aria-hidden="true">
      <defs>
        {['idle', 'selected', 'binding', 'fired'].map((state) => (
          <marker key={state} id={`gesture-arrow-${state}`} viewBox="-10 -10 20 20" markerWidth="14" markerHeight="14" orient="auto-start-reverse" refX="0" refY="0">
            <polyline points="-5,-4 0,0 -5,4 -5,-4" style={{ fill: `var(--edge-${state})`, stroke: `var(--edge-${state})`, strokeWidth: 1, strokeLinejoin: 'round' }} />
          </marker>
        ))}
      </defs>
    </svg>
  )
}

function CanvasControls({ readOnly }: { readOnly?: boolean }) {
  const flow = useReactFlow()
  const { applyProject } = useStudio.getState()
  const fit = () => flow.fitView({ padding: 0.25, maxZoom: 1, duration: 300 })
  return (
    <Panel position="bottom-left" className="canvas-controls">
      <button title="Zoom to fit" onClick={fit}>
        <Maximize size={16} />
      </button>
      <button title="Zoom in" onClick={() => flow.zoomIn({ duration: 200 })}>
        <Plus size={16} />
      </button>
      <button title="Zoom out" onClick={() => flow.zoomOut({ duration: 200 })}>
        <Minus size={16} />
      </button>
      {!readOnly ? (
        <button
          title="Tidy up: arrange the pages by how you reach them"
          onClick={() => {
            applyProject(tidyLayout(useStudio.getState().project))
            setTimeout(fit, 50)
          }}
        >
          <Wand2 size={16} />
        </button>
      ) : null}
    </Panel>
  )
}

type Props = { readOnly?: boolean; livePage?: string | null; firedEdgeId?: string | null }

function Canvas({ readOnly, livePage, firedEdgeId }: Props) {
  const project = useStudio((s) => s.project)
  const selection = useStudio((s) => s.selection)
  const creatorOpen = useStudio((s) => s.creatorOpen)
  const { select, updatePage, addEdge, addPage, addWidget, openDesigner, removeEdge, removePage, addBinding, removeBinding, setView, toggleCreator } = useStudio.getState()
  const flow = useReactFlow()
  const [dropPage, setDropPage] = useState<string | null>(null)
  const showAny = project.bindings.length > 0 || !readOnly

  const issues = useMemo(() => {
    const byPage = new Map<string, Issues>()
    if (readOnly) return byPage
    for (const problem of lintProject(project)) {
      const pageId = problem.pageId ?? project.edges.find((e) => e.id === problem.edgeId)?.from
      if (!pageId || problem.level === 'info') continue
      const entry = byPage.get(pageId) ?? { errors: 0, warnings: 0, messages: [] }
      if (problem.level === 'error') entry.errors++
      else entry.warnings++
      entry.messages.push(problem.message)
      byPage.set(pageId, entry)
    }
    return byPage
  }, [project, readOnly])

  const nodes = useMemo<FlowNode[]>(() => {
    const pageNodes: FlowNode[] = project.pages.map((page) => ({
      id: page.id,
      type: 'page',
      position: page.canvas,
      selected: selection?.kind === 'page' && selection.id === page.id,
      data: {
        page,
        project,
        isStart: page.id === project.settings.initialPage,
        live: livePage === page.id,
        dropTarget: dropPage === page.id,
        readOnly: Boolean(readOnly),
        issues: issues.get(page.id),
      },
      draggable: !readOnly,
    }))
    if (!showAny) return pageNodes
    const minX = Math.min(...project.pages.map((p) => p.canvas.x))
    const minY = Math.min(...project.pages.map((p) => p.canvas.y))
    return [{ id: ANY_NODE, type: 'any', position: { x: minX - 300, y: minY - 110 }, data: {}, draggable: false, selectable: false }, ...pageNodes]
  }, [project, selection, livePage, dropPage, readOnly, showAny, issues])

  const edges = useMemo<FlowEdge[]>(() => {
    const x = (id: string) => project.pages.find((p) => p.id === id)?.canvas.x ?? 0
    const backwards = (from: string, to: string) => x(to) < x(from)
    // Our own <marker>s (EdgeMarkers below), coloured by CSS variables, so they follow the theme.
    const marker = (state: string) => `gesture-arrow-${state}`
    return [
      ...project.edges.map((e) => {
        const state = firedEdgeId === e.id ? 'fired' : selection?.kind === 'edge' && selection.id === e.id ? 'selected' : 'idle'
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          sourceHandle: backwards(e.from, e.to) ? 'out-l' : 'out-r',
          targetHandle: backwards(e.from, e.to) ? 'in-r' : 'in-l',
          type: 'gesture',
          selected: state === 'selected',
          data: { gesture: e.gesture, fired: state === 'fired', readOnly },
          markerEnd: marker(state),
        }
      }),
      ...(showAny
        ? project.bindings.map((b) => ({
            id: b.id,
            source: ANY_NODE,
            target: b.action.page,
            targetHandle: 'in-l',
            type: 'gesture',
            deletable: !readOnly,
            data: { gesture: b.gesture, binding: true, fired: firedEdgeId === b.id, readOnly },
            markerEnd: marker(firedEdgeId === b.id ? 'fired' : 'binding'),
          }))
        : []),
    ]
  }, [project, selection, firedEdgeId, showAny, readOnly])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id !== ANY_NODE) {
          updatePage(change.id, { canvas: { x: Math.round(change.position.x), y: Math.round(change.position.y) } }, `move-node:${change.id}`)
        }
      }
    },
    [updatePage],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      if (connection.source === ANY_NODE) {
        const used = new Set(project.bindings.map((b) => b.gesture))
        addBinding(['right_click', 'left_click', 'two_fingers_swipe_down', 'two_fingers_swipe_up'].find((g) => !used.has(g)) ?? 'right_click', connection.target)
        select({ kind: 'settings' })
        return
      }
      if (connection.source === connection.target) return
      const id = addEdge(connection.source, connection.target, freeGesture(project, connection.source))
      select({ kind: 'edge', id })
    },
    [project, addEdge, addBinding, select],
  )

  const pageAt = (x: number, y: number) => {
    const element = document.elementsFromPoint(x, y).find((el) => el.closest('.react-flow__node-page'))
    return element?.closest('.react-flow__node-page')?.getAttribute('data-id') ?? null
  }

  return (
    <div
      className="flow"
      onDragOver={(e) => {
        if (readOnly) return
        const types = e.dataTransfer.types
        if (!types.includes(DRAG_PAGE) && !types.includes(DRAG_WIDGET)) return
        e.preventDefault()
        setDropPage(types.includes(DRAG_WIDGET) ? pageAt(e.clientX, e.clientY) : null)
      }}
      onDragLeave={() => setDropPage(null)}
      onDrop={(e) => {
        if (readOnly) return
        setDropPage(null)
        const position = flow.screenToFlowPosition({ x: e.clientX - 120, y: e.clientY - 40 })
        const rounded = { x: Math.round(position.x), y: Math.round(position.y) }
        const widgetType = e.dataTransfer.getData(DRAG_WIDGET)
        if (widgetType) {
          e.preventDefault()
          // A widget dropped on a page joins it; dropped on empty canvas, it starts a new page.
          const target = pageAt(e.clientX, e.clientY) ?? addPage('New page', rounded)
          const count = project.pages.find((p) => p.id === target)?.widgets.length ?? 0
          addWidget(target, widgetType, { x: 0.5, y: Math.min(0.85, 0.2 + count * 0.18) })
        } else if (e.dataTransfer.getData(DRAG_PAGE)) {
          e.preventDefault()
          addPage('New page', rounded)
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onConnect={readOnly ? undefined : onConnect}
        onNodeClick={(_, node) => node.id !== ANY_NODE && select({ kind: 'page', id: node.id })}
        onNodeDoubleClick={(_, node) => !readOnly && node.id !== ANY_NODE && openDesigner(node.id)}
        onEdgeClick={(_, edge) => (project.bindings.some((b) => b.id === edge.id) ? select({ kind: 'settings' }) : select({ kind: 'edge', id: edge.id }))}
        onPaneClick={() => select(null)}
        onNodesDelete={(deleted) => deleted.forEach((n) => n.id !== ANY_NODE && removePage(n.id))}
        onEdgesDelete={(deleted) => deleted.forEach((e) => (project.bindings.some((b) => b.id === e.id) ? removeBinding(e.id) : removeEdge(e.id)))}
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        nodesConnectable={!readOnly}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
        <EdgeMarkers />
        <CanvasControls readOnly={readOnly} />
        {!readOnly ? (
          <>
            <Panel position="top-right" className="canvas-add">
              <button className={`fab${creatorOpen ? ' fab--open' : ''}`} title="Add a page or a widget (Tab)" onClick={() => toggleCreator()}>
                <Plus size={22} />
              </button>
            </Panel>
            <Panel position="bottom-center" className="canvas-run">
              <button className="run-btn" onClick={() => setView('test')} title="Try the gestures with your webcam or the simulator">
                <Play size={16} fill="currentColor" />
                Test mirror
              </button>
            </Panel>
          </>
        ) : null}
      </ReactFlow>
      {!readOnly && project.edges.length === 0 ? (
        <div className="canvas-hint">Drag from a page's right dot to another page, or press its + to add the next page</div>
      ) : null}
    </div>
  )
}

export default function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
