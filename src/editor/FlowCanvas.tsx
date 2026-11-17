import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MiniMap,
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
import { memo, useCallback, useMemo, useState } from 'react'
import MirrorScreen from '../mirror/MirrorScreen'
import { GESTURES, gestureInfo } from '../model/gestures'
import type { Page, Project } from '../model/project'
import { useStudio } from '../store'

export const ANY_NODE = '__any__'
export const DRAG_PAGE = 'application/x-mirror-page'
export const DRAG_WIDGET = 'application/x-mirror-widget'

type PageNodeData = { page: Page; project: Project; isStart: boolean; live: boolean; dropTarget: boolean }
type GestureEdgeData = { gesture: string; binding?: boolean; fired?: boolean }

const PageNode = memo(function PageNode({ data, selected }: NodeProps<FlowNode<PageNodeData>>) {
  const { page, project, isStart, live, dropTarget } = data
  return (
    <div className={`page-node${selected ? ' page-node--selected' : ''}${live ? ' page-node--live' : ''}${dropTarget ? ' page-node--drop' : ''}`}>
      {/* Forward links leave on the right and enter on the left (upper handles); links going back
          to a page further left use the lower pair, so a there-and-back pair draws as two curves. */}
      <Handle id="in-l" type="target" position={Position.Left} style={{ top: '38%' }} />
      <Handle id="out-l" type="source" position={Position.Left} style={{ top: '62%' }} className="handle--back" />
      <div className="page-node__head">
        <span className="page-node__title">{page.name}</span>
        {isStart ? <span className="badge badge--accent">start</span> : null}
        {live ? <span className="badge" style={{ color: 'var(--ok)' }}>● live</span> : null}
      </div>
      <div className="page-node__thumb">
        <MirrorScreen widgets={page.widgets} widgetTypes={project.widgetTypes} screen={project.settings.screen} />
      </div>
      <div className="page-node__foot">
        <span>{page.widgets.length} widget{page.widgets.length === 1 ? '' : 's'}</span>
        <span>double-click to design</span>
      </div>
      <Handle id="out-r" type="source" position={Position.Right} style={{ top: '38%' }} />
      <Handle id="in-r" type="target" position={Position.Right} style={{ top: '62%' }} className="handle--back" />
    </div>
  )
})

const AnyNode = memo(function AnyNode() {
  return (
    <div className="any-node" title="Gestures from this node work on every page (event bindings)">
      ★ Any page
      <Handle type="source" position={Position.Right} />
    </div>
  )
})

function GestureEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<FlowEdge<GestureEdgeData>>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 })
  const info = gestureInfo(data?.gesture ?? '')
  const select = useStudio((s) => s.select)
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: data?.fired ? 'var(--ok)' : selected ? 'var(--accent)' : data?.binding ? 'var(--violet)' : undefined,
          strokeWidth: data?.fired ? 3.5 : selected ? 2.5 : 1.8,
          strokeDasharray: data?.binding ? '6 5' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan${selected ? ' edge-label--selected' : ''}${data?.binding ? ' edge-label--binding' : ''}${data?.fired ? ' edge-label--fired' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => (data?.binding ? select({ kind: 'settings' }) : select({ kind: 'edge', id }))}
          title={info.how}
        >
          <span>{info.icon}</span>
          {info.label}
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

type Props = { readOnly?: boolean; livePage?: string | null; firedEdgeId?: string | null }

function Canvas({ readOnly, livePage, firedEdgeId }: Props) {
  const project = useStudio((s) => s.project)
  const selection = useStudio((s) => s.selection)
  const { select, updatePage, addEdge, addPage, addWidget, openDesigner, removeEdge, removePage, addBinding, removeBinding } = useStudio.getState()
  const flow = useReactFlow()
  const [dropPage, setDropPage] = useState<string | null>(null)
  const showAny = project.bindings.length > 0 || !readOnly

  const nodes = useMemo<FlowNode[]>(() => {
    const pageNodes: FlowNode[] = project.pages.map((page) => ({
      id: page.id,
      type: 'page',
      position: page.canvas,
      selected: selection?.kind === 'page' && selection.id === page.id,
      data: { page, project, isStart: page.id === project.settings.initialPage, live: livePage === page.id, dropTarget: dropPage === page.id },
      draggable: !readOnly,
    }))
    if (!showAny) return pageNodes
    const minX = Math.min(...project.pages.map((p) => p.canvas.x))
    const minY = Math.min(...project.pages.map((p) => p.canvas.y))
    return [{ id: ANY_NODE, type: 'any', position: { x: minX - 260, y: minY - 90 }, data: {}, draggable: false, selectable: false }, ...pageNodes]
  }, [project, selection, livePage, dropPage, readOnly, showAny])

  const edges = useMemo<FlowEdge[]>(() => {
    const x = (id: string) => project.pages.find((p) => p.id === id)?.canvas.x ?? 0
    const backwards = (from: string, to: string) => x(to) < x(from)
    return [
      ...project.edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        sourceHandle: backwards(e.from, e.to) ? 'out-l' : 'out-r',
        targetHandle: backwards(e.from, e.to) ? 'in-r' : 'in-l',
        type: 'gesture',
        selected: selection?.kind === 'edge' && selection.id === e.id,
        data: { gesture: e.gesture, fired: firedEdgeId === e.id },
        markerEnd: { type: 'arrowclosed' as const, color: firedEdgeId === e.id ? '#3fd16b' : '#8a8aa8' },
      })),
      ...(showAny
        ? project.bindings.map((b) => ({
            id: b.id,
            source: ANY_NODE,
            target: b.action.page,
            targetHandle: 'in-l',
            type: 'gesture',
            deletable: !readOnly,
            data: { gesture: b.gesture, binding: true, fired: firedEdgeId === b.id },
            markerEnd: { type: 'arrowclosed' as const, color: '#8b7cff' },
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
      if (connection.source === connection.target || !connection.target) return
      addEdge(connection.source, connection.target, freeGesture(project, connection.source))
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
        const position = flow.screenToFlowPosition({ x: e.clientX - 110, y: e.clientY - 40 })
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
        colorMode="dark"
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
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#33334a" />
        <Controls showInteractive={false} />
        {!readOnly ? <MiniMap pannable zoomable nodeColor={(n) => (n.id === ANY_NODE ? '#8b7cff' : '#3a3a52')} maskColor="rgba(10,10,16,0.6)" /> : null}
      </ReactFlow>
      {!readOnly && project.edges.length === 0 ? <div className="canvas-hint">Drag from a page's orange dot to another page to link them with a gesture</div> : null}
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
