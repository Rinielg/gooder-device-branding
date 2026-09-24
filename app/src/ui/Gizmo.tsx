import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../state/store'

const SIZE = 74
const R = SIZE / 2
const ARM = R - 13

/**
 * Snap targets. With the device's 'YXZ' rotation order these are the angles
 * that bring each local axis round to face the camera.
 */
const VIEWS: Record<string, { rotX: number; rotY: number; rotZ: number }> = {
  '+x': { rotX: 0, rotY: -90, rotZ: 0 },
  '-x': { rotX: 0, rotY: 90, rotZ: 0 },
  '+y': { rotX: 90, rotY: 0, rotZ: 0 },
  '-y': { rotX: -90, rotY: 0, rotZ: 0 },
  '+z': { rotX: 0, rotY: 0, rotZ: 0 },
  '-z': { rotX: 0, rotY: 180, rotZ: 0 },
}

const AXES = [
  { key: 'x', label: 'X', colour: 'var(--axis-x)', vec: new THREE.Vector3(1, 0, 0) },
  { key: 'y', label: 'Y', colour: 'var(--axis-y)', vec: new THREE.Vector3(0, 1, 0) },
  { key: 'z', label: 'Z', colour: 'var(--axis-z)', vec: new THREE.Vector3(0, 0, 1) },
]

/**
 * Orientation gizmo.
 *
 * Drawn from the pose rather than rendered as a second scene: it is three
 * vectors and an orthographic projection, so an SVG is both cheaper and
 * sharper than a WebGL viewport in the corner. Clicking a handle snaps the
 * device to that view — and because it goes through `setTransform`, a snap
 * keys itself when rotation is animated, exactly like dragging the device.
 */
export function Gizmo() {
  const transform = useStore((s) => s.transform)
  const setTransform = useStore((s) => s.setTransform)

  const handles = useMemo(() => {
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(transform.rotX),
      THREE.MathUtils.degToRad(transform.rotY),
      THREE.MathUtils.degToRad(transform.rotZ),
      'YXZ',
    )
    const out: {
      id: string; label: string; colour: string
      x: number; y: number; depth: number; positive: boolean
    }[] = []
    for (const axis of AXES) {
      const v = axis.vec.clone().applyEuler(euler)
      for (const sign of [1, -1]) {
        out.push({
          id: `${sign > 0 ? '+' : '-'}${axis.key}`,
          label: axis.label,
          colour: axis.colour,
          // Screen y grows downward, so the projection flips it.
          x: R + v.x * ARM * sign,
          y: R - v.y * ARM * sign,
          depth: v.z * sign,
          positive: sign > 0,
        })
      }
    }
    // Painter's order: what is behind is drawn first.
    return out.sort((a, b) => a.depth - b.depth)
  }, [transform.rotX, transform.rotY, transform.rotZ])

  return (
    <svg className="gizmo" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {handles.filter((h) => h.positive).map((h) => (
        <line key={`l${h.id}`} x1={R} y1={R} x2={h.x} y2={h.y} stroke={h.colour} strokeWidth={1.5} />
      ))}
      {handles.map((h) => (
        <g
          key={h.id}
          className="gizmo-handle"
          onPointerDown={(e) => { e.stopPropagation(); setTransform(VIEWS[h.id]) }}
        >
          <title>{`Look down ${h.id.toUpperCase()}`}</title>
          <circle
            cx={h.x} cy={h.y} r={9}
            fill={h.positive ? h.colour : 'var(--panel)'}
            stroke={h.colour} strokeWidth={1.5}
          />
          {h.positive && (
            <text x={h.x} y={h.y} textAnchor="middle" dominantBaseline="central">{h.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}
