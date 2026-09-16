import { useEffect, useRef, useState } from 'react'
import { Stage } from '../engine/Stage'
import { KeyframeTimeline } from '../engine/Timeline'
import { engine } from '../engine/handle'
import { useStore, compositionDuration } from '../state/store'
import type { VariantManifest } from '../engine/types'

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const timelineRef = useRef<KeyframeTimeline | null>(null)
  const [booted, setBooted] = useState(false)

  const device = useStore((s) => s.device)
  const variant = useStore((s) => s.variant)
  const manifest = useStore((s) => s.manifest)
  const frame = useStore((s) => s.frame)
  const stageState = useStore((s) => s.stage)
  const background = useStore((s) => s.background)
  const screen = useStore((s) => s.screen)
  const transform = useStore((s) => s.transform)
  const keyframes = useStore((s) => s.keyframes)

  /* ---------------- boot ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false

    const stage = new Stage(canvas, useStore.getState().device)
    const timeline = new KeyframeTimeline()
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
      stage.render(t)
      const src = stage.renderer.domElement
      const c = document.createElement('canvas')
      const w = 132
      c.width = w
      c.height = Math.round((w * src.height) / src.width)
      c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height)
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
        await stage.device.applyVariant(m, useStore.getState().variant)
        await stage.device.setScreen(useStore.getState().screen)
        await stage.applyBackground(useStore.getState().background)
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
      await stage.device.setScreen(useStore.getState().screen)
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
    useStore.getState().setScreen(
      { kind: 'image', url, name: `${manifest[device].variants[variant].label} wallpaper`, followVariant: true },
      null,
    )
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
    timelineRef.current?.build(keyframes)
  }, [keyframes])

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
        const dur = compositionDuration(st.keyframes, st.backgroundDuration)
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

      // While playing, the timeline owns the pose and writes it back to the
      // store so the dials animate too. While paused the store owns it, so
      // dragging and dialling still work with keyframes present.
      if (st.playing && st.keyframes.length > 0) {
        const sampled = tl.sample(t)
        stage.applyTransform(sampled)
        st.setTransform(sampled)
      } else {
        stage.applyTransform(st.transform)
      }

      stage.render(t)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* apply transform immediately when edited while paused */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    if (useStore.getState().keyframes.length === 0) stage.applyTransform(transform)
  }, [transform])

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
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}
