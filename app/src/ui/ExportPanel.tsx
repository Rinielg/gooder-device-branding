import { useRef, useState } from 'react'
import { useStore, compositionDuration } from '../state/store'
import { hasAnimation } from '../engine/tracks'
import { engine } from '../engine/handle'
import { evenSize } from '../engine/size'
import { Row, Section, Segmented, Slider, NumberInput } from './kit'

type Busy = { kind: 'still' | 'video'; done: number; total: number } | null

export function ExportPanel() {
  const frame = useStore((s) => s.frame)
  const composition = useStore((s) => s.composition)
  const playhead = useStore((s) => s.playhead)
  const bgBlob = useStore((s) => s.backgroundVideoBlob)
  const screenBlob = useStore((s) => s.screenVideoBlob)
  const background = useStore((s) => s.background)
  const keepShadowInAlpha = useStore((s) => s.lighting.shadows.keepInTransparentExport)
  const backgroundDuration = useStore((s) => s.backgroundDuration)

  const [scale, setScale] = useState(1)
  const [transparent, setTransparent] = useState(false)
  const [fps, setFps] = useState(30)
  const [bitrate, setBitrate] = useState(12)
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4')
  // Derived rather than stored: the export length follows the composition until
  // the user types one of their own, and then it is theirs.
  const suggestedDuration = compositionDuration(composition, backgroundDuration)
  const [customDuration, setCustomDuration] = useState<number | null>(null)
  const duration = customDuration ?? suggestedDuration
  const [busy, setBusy] = useState<Busy>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const out = evenSize(frame.width, frame.height, scale)
  const megapixels = (out.width * out.height) / 1e6
  const tooBig = megapixels > 33
  const canTransparent = background.kind === 'transparent'

  const ctx = () => ({
    stage: engine.stage!,
    timeline: engine.timeline!,
    source: useStore.getState(),
    backgroundVideoBlob: background.kind === 'video' ? bgBlob : null,
    screenVideoBlob: screenBlob,
  })

  const doStill = async () => {
    if (!engine.stage || !engine.timeline) return
    setMsg(null)
    setBusy({ kind: 'still', done: 0, total: 1 })
    useStore.getState().setExporting(true)
    try {
      // Loaded on demand: the encoder and muxer are a large dependency that
      // nothing needs until the moment someone exports.
      const { exportStill, downloadBlob } = await import('../engine/Exporter')
      const blob = await exportStill(
        ctx(),
        { ...frame, scale, transparent: transparent && canTransparent, keepShadowInAlpha },
        playhead,
      )
      downloadBlob(blob, `mockup-${out.width}x${out.height}.png`)
      setMsg(`Exported PNG at ${out.width} × ${out.height}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      useStore.getState().setExporting(false)
      setBusy(null)
    }
  }

  const doVideo = async () => {
    if (!engine.stage || !engine.timeline) return
    setMsg(null)
    abort.current = new AbortController()
    setBusy({ kind: 'video', done: 0, total: Math.round(duration * fps) })
    useStore.getState().setPlaying(false)
    useStore.getState().setExporting(true)
    try {
      const { exportVideo, downloadBlob } = await import('../engine/Exporter')
      const res = await exportVideo(ctx(), {
        ...frame, scale, transparent: false,
        fps, duration, bitrateMbps: bitrate, format,
        signal: abort.current.signal,
        onProgress: (done, total) => setBusy({ kind: 'video', done, total }),
      })
      downloadBlob(res.blob, `mockup-${out.width}x${out.height}.${res.extension}`)
      setMsg(`Exported ${res.frames} frames · ${res.codec.toUpperCase()} · ${(res.blob.size / 1e6).toFixed(1)} MB`)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setMsg('Export cancelled')
      else setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      useStore.getState().setExporting(false)
      setBusy(null)
      abort.current = null
    }
  }

  return (
    <Section title="Export">
      <Row label="Resolution">
        <Segmented<string>
          value={String(scale)}
          options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '3', label: '3×' }]}
          onChange={(v) => setScale(Number(v))}
        />
      </Row>
      <p className={tooBig ? 'note warn' : 'note'}>
        Output {out.width} × {out.height} · {megapixels.toFixed(1)} MP
        {tooBig && ' — above the browser canvas limit, drop to a lower multiplier'}
      </p>

      <div className="btnrow">
        <button type="button" className="btn primary" disabled={!!busy || tooBig} onClick={doStill}>
          {busy?.kind === 'still' ? 'Rendering…' : 'Export PNG'}
        </button>
        <label className={canTransparent ? 'check' : 'check disabled'}>
          <input type="checkbox" checked={transparent && canTransparent} disabled={!canTransparent}
            onChange={(e) => setTransparent(e.target.checked)} />
          Transparent
        </label>
      </div>
      {!canTransparent && (
        <p className="note">Set the background to <strong>None</strong> to enable a transparent PNG.</p>
      )}

      <hr className="rule" />

      <Row label="Duration" hint="s">
        <NumberInput value={duration} min={0.2} max={120} step={0.5}
          onChange={setCustomDuration} />
      </Row>
      <Row label="Frame rate">
        <Segmented<string>
          value={String(fps)}
          options={[{ value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }]}
          onChange={(v) => setFps(Number(v))}
        />
      </Row>
      <Row label="Bitrate" hint="Mb/s">
        <Slider value={bitrate} min={2} max={60} step={1} onChange={setBitrate} />
      </Row>
      <Row label="Container">
        <Segmented<'mp4' | 'webm'>
          value={format}
          options={[{ value: 'mp4', label: 'MP4 / H.264' }, { value: 'webm', label: 'WebM / VP9' }]}
          onChange={setFormat}
        />
      </Row>

      <div className="btnrow">
        <button type="button" className="btn primary" disabled={!!busy || tooBig} onClick={doVideo}>
          {busy?.kind === 'video' ? 'Encoding…' : 'Export video'}
        </button>
        {busy?.kind === 'video' && (
          <button type="button" className="btn ghost" onClick={() => abort.current?.abort()}>Cancel</button>
        )}
      </div>

      {busy?.kind === 'video' && (
        <div className="progress">
          <div style={{ width: `${(busy.done / busy.total) * 100}%` }} />
          <span>{busy.done} / {busy.total} frames</span>
        </div>
      )}

      {msg && <p className="note ok">{msg}</p>}

      <p className="note">
        Every layer — background, device and screen content — is rendered into the same
        canvas, so the export is exactly what the frame shows. Video is encoded
        frame-by-frame rather than screen-recorded, so it never drops frames.
        {!hasAnimation(composition) && ' With nothing keyed the pose holds still and only the background animates.'}
      </p>
    </Section>
  )
}
