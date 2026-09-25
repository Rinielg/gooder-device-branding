import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Stage } from '../engine/Stage'
import { CompositionTimeline } from '../engine/Timeline'
import { engine } from '../engine/handle'
import { mergeTransform } from '../engine/tracks'
import { useStore, compositionDuration } from '../state/store'
import type { VariantManifest } from '../engine/types'

/**
 * Run a load step that is allowed to fail.
 *
 * Media can be missing — a link that expired, a file that moved — and the
 * editor still has to start. Before this, a stale screen URL aborted the boot
 * sequence and the app sat on "Loading model…" for ever, with no error left on
 * screen by the time anybody looked.
 */
async function softly(what: string, run: () => Promise<unknown>) {
  try {
    await run()
  } catch (e) {
    useStore.getState().setError(`Could not load ${what} — ${(e as Error).message}`)
  }
}

export function Viewport({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const timelineRef = useRef<CompositionTimeline | null>(null)
  const [booted, setBooted] = useState(false)

  const device = useStore((s) => s.device)
  const variant = useStore((s) => s.variant)
  const manifest = useStore((s) => s.manifest)
  const frame = useStore((s) => s.frame)
  const stageState = useStore((s) => s.stage)
  const background = useStore((s) => s.background)
  const screen = useStore((s) => s.screen)
  const lighting = useStore((s) => s.lighting)
  const showLightHelpers = useStore((s) => s.showLightHelpers)
  const composition = useStore((s) => s.composition)

  /* ---------------- boot ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false

    const stage = new Stage(canvas, useStore.getState().device)
    const timeline = new CompositionTimeline()
    stageRef.current = stage
    timelineRef.current = timeline
    engine.stage = stage
    engine.timeline = timeline
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>
      w.__stage = stage
      w.__engine = engine
      w.__store = useStore
    }
    engine.thumbnail = (t: number) => {
      // Gizmos are an editing aid; a saved view should not be a picture of them.
      const hadHelpers = useStore.getState().showLightHelpers
      if (hadHelpers) stage.lighting.setHelpersVisible(false)
      stage.render(t)
      const src = stage.renderer.domElement
      const c = document.createElement('canvas')
      const w = 132
      c.width = w
      c.height = Math.round((w * src.height) / src.width)
      c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height)
      if (hadHelpers) stage.lighting.setHelpersVisible(true)
      return c.toDataURL('image/jpeg', 0.7)
    }

    ;(async () => {
      try {
        const res = await fetch('/models/variants.json')
        const m = (await res.json()) as VariantManifest
        if (disposed) return
        useStore.getState().setManifest(m)
        await stage.loadDevice(useStore.getState().device)
        if (disposed) return
        await stage.applyLighting(useStore.getState().lighting)
        if (disposed) return
        await stage.device.applyVariant(m, useStore.getState().variant)
        // Media can fail — a link that expired, a file that moved — and the
        // editor still has to start. Before this, a stale screen URL aborted
        // the sequence here and the app sat on "Loading model…" for ever.
        await softly('the screen content', () => stage.device.setScreen(useStore.getState().screen))
        await softly('the background', () => stage.applyBackground(useStore.getState().background))
        useStore.getState().setReady(true)
        setBooted(true)
      } catch (e) {
        useStore.getState().setError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      disposed = true
      engine.stage = null
      engine.timeline = null
      engine.thumbnail = null
      timeline.dispose()
      stage.dispose()
    }
  }, [])

  /* ---------------- sizing: the canvas always matches the frame aspect ------ */
  useEffect(() => {
    const holder = holderRef.current
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!holder || !canvas || !stage) return

    const fit = () => {
      const pad = 32
      const availW = holder.clientWidth - pad * 2
      const availH = holder.clientHeight - pad * 2
      if (availW <= 0 || availH <= 0) return
      const aspect = frame.width / frame.height
      let w = availW
      let h = w / aspect
      if (h > availH) { h = availH; w = h * aspect }
      canvas.style.width = `${Math.round(w)}px`
      canvas.style.height = `${Math.round(h)}px`
      canvas.style.borderRadius = `${Math.min(frame.radius * (w / frame.width), 64)}px`
      stage.setViewportSize(Math.round(w), Math.round(h), window.devicePixelRatio)
      stage.setFrame(frame.width, frame.height)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(holder)
    return () => ro.disconnect()
  }, [frame.width, frame.height, frame.radius, booted])

  /* ---------------- reactive updates ---------------- */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !booted) return
    let cancelled = false
    ;(async () => {
      useStore.getState().setStatus('Loading device…')
      await stage.loadDevice(device)
      if (cancelled) return
      const m = useStore.getState().manifest
      if (m) await stage.device.applyVariant(m, useStore.getState().variant)
      await softly('the screen content', () => stage.device.setScreen(useStore.getState().screen))
      useStore.getState().setStatus(null)
    })()
    return () => { cancelled = true }
  }, [device, booted])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !manifest || !booted) return
    void stage.device.applyVariant(manifest, variant)
  }, [variant, manifest, booted, device])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !booted) return
    void stage.device.setScreen(screen)
  }, [screen, booted, device])

  /* the display follows the colourway unless the user has uploaded something */
  useEffect(() => {
    if (!manifest || !screen.followVariant) return
    const file = manifest[device]?.variants[variant]?.materials?.KSynYqGGNGMUJti?.maps?.emissiveMap
    if (!file) return
    const url = `/textures/${file}`
    if (screen.url === url) return
    // Derived from the colourway, so it rides along with that undo step rather
    // than becoming one of its own.
    useStore.getState().silently(() => useStore.getState().setScreen(
      { kind: 'image', url, name: `${manifest[device].variants[variant].label} wallpaper`, followVariant: true },
      null,
    ))
  }, [manifest, device, variant, screen.followVariant, screen.url])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !booted) return
    void stage.applyBackground(background)
      .then(() => useStore.getState().setBackgroundDuration(stage.background.mediaDuration))
      .catch((e) => useStore.getState().setError(e instanceof Error ? e.message : String(e)))
  }, [background, booted])

  useEffect(() => {
    stageRef.current?.applyStage(stageState)
  }, [stageState, booted])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !booted) return
    void stage.applyLighting(lighting).catch((e) =>
      useStore.getState().setError(e instanceof Error ? e.message : String(e)))
  }, [lighting, booted])

  const exporting = useStore((s) => s.exporting)
  useEffect(() => {
    stageRef.current?.lighting.setHelpersVisible(showLightHelpers && !exporting)
  }, [showLightHelpers, exporting, booted])

  useEffect(() => {
    timelineRef.current?.build(composition)
  }, [composition])

  /* ---------------- render loop ---------------- */
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const stage = stageRef.current
      const tl = timelineRef.current
      if (!stage || !tl) return

      const st = useStore.getState()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      // The exporter owns the canvas while it runs: it resizes the drawing
      // buffer and drives the clock itself, and a preview frame in between
      // would both waste work and race the background rasteriser.
      if (st.exporting) return

      let t = st.playhead
      if (st.playing) {
        const dur = compositionDuration(st.composition, st.backgroundDuration)
        t = st.playhead + dt
        if (t > dur) {
          if (st.loop) {
            t = t % dur
          } else {
            // Run to the end and stop there, holding the final frame.
            t = dur
            st.setPlaying(false)
          }
        }
        st.setPlayhead(t)
      }

      // The scene is the project's own values with any animated track over the
      // top, every frame. Nothing a track does not drive is touched, and a
      // track that is removed simply stops overriding.
      const sample = tl.animated ? tl.sample(t) : null
      stage.applySample(st, sample)
      // Publish it so the panels show what is on screen rather than the
      // project's own values. It compares before writing, so an idle playhead
      // costs nothing.
      st.setSampled(sample)

      // While playing the timeline owns the pose and writes it back so the
      // dials animate too. Silent, because the timeline writing its own result
      // back is not an edit and must not key on every frame.
      if (st.playing && sample) {
        st.setTransform(mergeTransform(st.transform, sample), { silent: true })
      }

      stage.render(t)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ---------------- pointer: drag to rotate, shift-drag to pan ------------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mode: 'none' | 'rotate' | 'pan' = 'none'
    let lastX = 0
    let lastY = 0

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return
      mode = e.shiftKey || e.button === 1 ? 'pan' : 'rotate'
      lastX = e.clientX; lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = mode === 'pan' ? 'grabbing' : 'grabbing'
    }

    const move = (e: PointerEvent) => {
      if (mode === 'none') return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX; lastY = e.clientY
      const s = useStore.getState()
      if (mode === 'rotate') {
        s.setTransform({
          rotY: s.transform.rotY + dx * 0.35,
          rotX: clamp(s.transform.rotX + dy * 0.35, -89, 89),
        })
      } else {
        const unitsPerPx = (s.stage.distance * 16) / canvas.clientHeight
        s.setTransform({
          posX: s.transform.posX + dx * unitsPerPx,
          posY: s.transform.posY - dy * unitsPerPx,
        })
      }
    }

    const up = (e: PointerEvent) => {
      mode = 'none'
      canvas.style.cursor = 'grab'
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = useStore.getState()
      const next = clamp(s.transform.scale * (1 - e.deltaY * 0.0012), 0.1, 6)
      s.setTransform({ scale: Math.round(next * 1000) / 1000 })
    }

    canvas.style.cursor = 'grab'
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
    }
  }, [])

  return (
    <div className="viewport" ref={holderRef}>
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="viewport-hint">
        drag to rotate · shift-drag to pan · scroll to scale
      </div>
      {children}
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}
