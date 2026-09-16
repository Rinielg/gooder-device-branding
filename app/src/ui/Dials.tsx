import { useEffect, useRef, useState } from 'react'
import { DialRoot, useDialKitController } from 'dialkit'
import 'dialkit/styles.css'
import { useStore } from '../state/store'

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
      Light: {
        Environment: [s.envIntensity, 0, 4, 0.01] as Axis,
        Rotate: [s.envRotation, -180, 180, 1] as Axis,
        Key: [s.keyIntensity, 0, 6, 0.01] as Axis,
        Shadow: [s.shadow, 0, 1, 0.01] as Axis,
        Softness: [s.shadowBlur, 0, 2, 0.01] as Axis,
      },
    }
  })

  const dial = useDialKitController('Transform', config, { persist: false })
  const transform = useStore((s) => s.transform)
  const stage = useStore((s) => s.stage)
  const suppress = useRef(false)

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
    const nextS = {
      fov: v.Camera.FOV, distance: v.Camera.Distance,
      envIntensity: v.Light.Environment, envRotation: v.Light.Rotate,
      keyIntensity: v.Light.Key, shadow: v.Light.Shadow, shadowBlur: v.Light.Softness,
    }
    if (differs(nextT, st.transform)) st.setTransform(nextT)
    if (differs(nextS, st.stage)) st.setStage(nextS)
  }, [dial.values])

  // store -> dials
  useEffect(() => {
    const v = dial.getValues()
    const same =
      near(v.Position.X, transform.posX) && near(v.Position.Y, transform.posY) &&
      near(v.Position.Z, transform.posZ) && near(v.Rotation.X, transform.rotX) &&
      near(v.Rotation.Y, transform.rotY) && near(v.Rotation.Z, transform.rotZ) &&
      near(v.Scale, transform.scale) &&
      near(v.Camera.FOV, stage.fov) && near(v.Camera.Distance, stage.distance) &&
      near(v.Light.Environment, stage.envIntensity) && near(v.Light.Rotate, stage.envRotation) &&
      near(v.Light.Key, stage.keyIntensity) && near(v.Light.Shadow, stage.shadow) &&
      near(v.Light.Softness, stage.shadowBlur)
    if (same) return
    suppress.current = true
    dial.setValues({
      Position: { X: transform.posX, Y: transform.posY, Z: transform.posZ },
      Rotation: { X: transform.rotX, Y: transform.rotY, Z: transform.rotZ },
      Scale: transform.scale,
      Camera: { FOV: stage.fov, Distance: stage.distance },
      Light: {
        Environment: stage.envIntensity, Rotate: stage.envRotation,
        Key: stage.keyIntensity, Shadow: stage.shadow, Softness: stage.shadowBlur,
      },
    })
    // Release on the next tick, after DialKit has re-rendered with the new values.
    const id = setTimeout(() => { suppress.current = false }, 0)
    return () => clearTimeout(id)
  }, [transform, stage])

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
