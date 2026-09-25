import { makeTrackKey, type TrackSource } from './tracks'
import type { TrackId, TrackKey } from './types'

/**
 * Ready-made animations for an empty timeline.
 *
 * Each one ends on the pose you have already set up, so it animates *into*
 * your shot rather than replacing it. A blank timeline asks you to know what a
 * keyframe is before it will do anything; a tile gives you something moving
 * that you can then take apart.
 */
export interface Starter {
  id: string
  name: string
  description: string
}

export const STARTERS: Starter[] = [
  { id: 'slide-in', name: 'Slide in', description: 'Arrives from the left and settles.' },
  { id: 'rise', name: 'Rise', description: 'Lifts into place from below.' },
  { id: 'turn', name: 'Turn', description: 'A half turn onto your angle.' },
  { id: 'scale-in', name: 'Scale in', description: 'Grows into the frame.' },
  { id: 'bounce', name: 'Bounce', description: 'Drops in and springs to rest.' },
  { id: 'showcase', name: 'Showcase', description: 'A slow turn with a gentle push in.' },
]

type Keys = Partial<Record<TrackId, TrackKey[]>>

const SPRINGY = { stiffness: 190, damping: 11, mass: 1, velocity: 0 }

export function buildStarter(id: string, s: TrackSource): Keys {
  const t = s.transform
  const pos = (x: number, y: number, z: number) => ({ x, y, z })
  const rot = (y: number) => ({ x: t.rotX, y, z: t.rotZ })

  const at = (time: number, value: Record<string, number>, ease?: TrackKey['ease']) => {
    const k = makeTrackKey(time, value)
    if (ease) k.ease = ease
    return k
  }

  switch (id) {
    case 'slide-in':
      return {
        position: [at(0, pos(t.posX - 2.2, t.posY, t.posZ)), at(1.1, pos(t.posX, t.posY, t.posZ), 'power3.out')],
      }

    case 'rise':
      return {
        position: [at(0, pos(t.posX, t.posY - 1.6, t.posZ)), at(1, pos(t.posX, t.posY, t.posZ), 'power3.out')],
      }

    case 'turn':
      return {
        rotation: [at(0, rot(t.rotY - 180)), at(1.6, rot(t.rotY), 'power2.inOut')],
      }

    case 'scale-in':
      return {
        scale: [at(0, { uniform: t.scale * 0.55 }), at(0.9, { uniform: t.scale }, 'power3.out')],
      }

    case 'bounce': {
      const drop = at(0.9, pos(t.posX, t.posY, t.posZ), 'spring')
      drop.spring = { ...SPRINGY }
      return { position: [at(0, pos(t.posX, t.posY + 2, t.posZ)), drop] }
    }

    case 'showcase':
      return {
        rotation: [at(0, rot(t.rotY - 120)), at(3, rot(t.rotY), 'power1.inOut')],
        camera: [
          at(0, { fov: s.stage.fov, distance: s.stage.distance + 0.7 }),
          at(3, { fov: s.stage.fov, distance: s.stage.distance }, 'power2.inOut'),
        ],
      }

    default:
      return {}
  }
}
