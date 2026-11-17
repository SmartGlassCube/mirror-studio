import { memo } from 'react'

// 16x8 pixel half circle: '#' outline, '.' fill, '*' shine, ' ' transparent.
const DOME = [
  '     ######     ',
  '   ##..**..##   ',
  '  #..**......#  ',
  ' #..*.........# ',
  ' #............# ',
  '#..............#',
  '#..............#',
  '#..............#',
]

const PIXEL_CLASS: Record<string, string> = {
  '#': 'drag-handle__outline',
  '.': 'drag-handle__fill',
  '*': 'drag-handle__shine',
}

const pixels = DOME.flatMap((row, y) =>
  [...row].flatMap((char, x) => (PIXEL_CLASS[char] ? [{ x, y, className: PIXEL_CLASS[char] }] : [])),
)

type DragHandleProps = {
  lit: boolean
}

// Half-circle grip on top of a draggable widget; lights up while the widget is pinched and moved.
function DragHandle({ lit }: DragHandleProps) {
  return (
    <svg
      className={`drag-handle${lit ? ' drag-handle--lit' : ''}`}
      viewBox={`0 0 ${DOME[0].length} ${DOME.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pixels.map(({ x, y, className }) => (
        <rect key={`${x}-${y}`} className={className} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  )
}

export default memo(DragHandle)
