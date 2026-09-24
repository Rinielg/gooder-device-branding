import { useEffect, useRef, useState } from 'react'
import { DialRoot, useDialKitController } from 'dialkit'
import 'dialkit/styles.css'
import { useStore } from '../state/store'
import { useChannel } from './sampled'

type Axis = [number, number, number, number]

/**
 * DialKit drives the numeric side of the transform. The zustand store stays the
 * single source of truth: dial edits are pushed into it, and changes that come
 * from anywhere else (dragging the model, scrubbing the timeline, loading a
 * saved view) are pushed back out to the dials. Both directions compare before
 * writing, which is what stops the two from ping-ponging.
 */
export function Dials() {
  const [config] = useState(() => {
    const t = useStore.getState().transform
    const s = useStore.getState().stage
    return {
      Position: {
        X: [t.posX, -40, 40, 0.01] as Axis,
        Y: [t.posY, -40, 40, 0.01] as Axis,
        Z: [t.posZ, -60, 30, 0.01] as Axis,
      },
      Rotation: {
        X: [t.rotX, -89, 89, 0.1] as Axis,
        Y: [t.rotY, -180, 180, 0.1] as Axis,
        Z: [t.rotZ, -180, 180, 0.1] as Axis,
      },
      Scale: [t.scale, 0.1, 4, 0.001] as Axis,
      Camera: {
        FOV: [s.fov, 10, 80, 0.5] as Axis,
        Distance: [s.distance, 1.2, 8, 0.01] as Axis,
      },
    }
  })

  const dial = useDialKitController('Transform', config, { persist: false })
  const transform = useStore((s) => s.transform)
  const stage = useStore((s) => s.stage)
  const suppress = useRef(false)
  /**
   * What the dials were last told to show, which is what an edit is measured
   * against. Seeded from the values the dials were built with, so the very
   * first pass cannot mistake initialisation for an edit.
   */
  const shown = useRef({ fov: config.Camera.FOV[0], distance: config.Camera.Distance[0] })

  // The transform already follows the timeline — playback and scrubbing write
  // the sampled pose back into the store. The camera does not, so it is read
  // through the sample here.
  const fov = useChannel('camera', 'fov', stage.fov)
  const distance = useChannel('camera', 'distance', stage.distance)

  // dials -> store.
  // Deliberately keyed on `dial.values` alone: `dial` is a fresh object every
  // render, so depending on it would re-run this effect continuously.
  useEffect(() => {
    if (suppress.current) return
    const v = dial.values
    const st = useStore.getState()
    const nextT = {
      posX: v.Position.X, posY: v.Position.Y, posZ: v.Position.Z,
      rotX: v.Rotation.X, rotY: v.Rotation.Y, rotZ: v.Rotation.Z,
      scale: v.Scale,
    }
    const nextS = { fov: v.Camera.FOV, distance: v.Camera.Distance }
    if (differs(nextT, st.transform)) st.setTransform(nextT)
    // Compared against what the dials were last *set to*, not against the
    // project: with the camera animated those differ every frame, and comparing
    // against the project would write the sampled value back into it.
    if (differs(nextS, { fov: shown.current.fov, distance: shown.current.distance })) st.setStage(nextS)
  }, [dial.values])

  // store -> dials
  useEffect(() => {
    const v = dial.getValues()
    // Recorded whether or not the dials need setting: either way this is what
    // they are showing, and an edit is anything that moves away from it.
    shown.current = { fov, distance }
    const same =
      near(v.Position.X, transform.posX) && near(v.Position.Y, transform.posY) &&
      near(v.Position.Z, transform.posZ) && near(v.Rotation.X, transform.rotX) &&
      near(v.Rotation.Y, transform.rotY) && near(v.Rotation.Z, transform.rotZ) &&
      near(v.Scale, transform.scale) &&
      near(v.Camera.FOV, fov) && near(v.Camera.Distance, distance)
    if (same) return
    suppress.current = true
    dial.setValues({
      Position: { X: transform.posX, Y: transform.posY, Z: transform.posZ },
      Rotation: { X: transform.rotX, Y: transform.rotY, Z: transform.rotZ },
      Scale: transform.scale,
      Camera: { FOV: fov, Distance: distance },
    })
    // Release on the next tick, after DialKit has re-rendered with the new values.
    const id = setTimeout(() => { suppress.current = false }, 0)
    return () => clearTimeout(id)
  }, [transform, fov, distance])

  return (
    <div className="dial-host">
      <DialRoot mode="inline" theme="dark" defaultOpen />
    </div>
  )
}

function near(a: number, b: number) { return Math.abs(a - b) < 1e-4 }

function differs<T extends object>(a: T, b: T) {
  const av = a as Record<string, number>
  const bv = b as unknown as Record<string, number>
  return Object.keys(av).some((k) => !near(av[k], bv[k]))
}
