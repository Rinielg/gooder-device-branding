import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import {
  DEFAULT_MESH_NAME, DEFAULT_MESH_URL, DEVICES, FRAME_PRESETS,
  type BackgroundKind, type DeviceId,
} from '../engine/types'
import { ColorField, FileButton, Row, Section, Segmented, Slider, NumberInput } from './kit'
import { useAnimated, useChannel } from './sampled'

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

export function FramePanel() {
  const frame = useStore((s) => s.frame)
  const setFrame = useStore((s) => s.setFrame)
  const activePreset = FRAME_PRESETS.find((p) => p.width === frame.width && p.height === frame.height)

  return (
    <Section title="Frame">
      <div className="preset-grid">
        {FRAME_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={activePreset?.label === p.label ? 'preset on' : 'preset'}
            onClick={() => setFrame({ width: p.width, height: p.height })}
          >
            <span className="preset-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <Row label="Width" hint="px">
        <NumberInput value={frame.width} min={64} max={7680} step={2}
          onChange={(v) => setFrame({ width: Math.round(v) })} />
      </Row>
      <Row label="Height" hint="px">
        <NumberInput value={frame.height} min={64} max={7680} step={2}
          onChange={(v) => setFrame({ height: Math.round(v) })} />
      </Row>
      <Row label="Corner radius" hint="px">
        <Slider value={frame.radius} min={0} max={160} step={1}
          onChange={(v) => setFrame({ radius: v })} />
      </Row>
      <p className="note">
        {frame.width} × {frame.height} · {(frame.width / frame.height).toFixed(3)}:1 ·{' '}
        {((frame.width * frame.height) / 1e6).toFixed(1)} MP
      </p>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Device + colourway                                                  */
/* ------------------------------------------------------------------ */

export function DevicePanel() {
  const device = useStore((s) => s.device)
  const setDevice = useStore((s) => s.setDevice)
  const variant = useStore((s) => s.variant)
  const setVariant = useStore((s) => s.setVariant)
  const manifest = useStore((s) => s.manifest)

  const variants = manifest?.[device]?.variants
  const meta = DEVICES[device]

  return (
    <Section title="Device">
      <Row label="Model">
        <Segmented<DeviceId>
          value={device}
          onChange={setDevice}
          options={Object.values(DEVICES).map((d) => ({ value: d.id, label: d.label.replace('iPhone 18 ', '') }))}
        />
      </Row>
      <div className="swatches">
        {variants
          ? Object.values(variants).map((v) => (
              <button
                key={v.id}
                type="button"
                className={v.id === variant ? 'swatch on' : 'swatch'}
                onClick={() => setVariant(v.id)}
                title={v.label}
              >
                <span style={{ background: v.swatch }} />
                <em>{v.label}</em>
              </button>
            ))
          : <p className="note">Loading colourways…</p>}
      </div>
      <p className="note">
        {meta.label} · body {meta.bodyMm[0]} × {meta.bodyMm[1]} × {meta.bodyMm[2]} mm ·
        {' '}display {meta.screenMm[0]} × {meta.screenMm[1]} mm
      </p>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

const BG_OPTIONS: { value: BackgroundKind; label: string }[] = [
  { value: 'mesh', label: 'Mesh' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'color', label: 'Colour' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'transparent', label: 'None' },
]

export function BackgroundPanel() {
  const bg = useStore((s) => s.background)
  const setBackground = useStore((s) => s.setBackground)
  const backgroundDuration = useStore((s) => s.backgroundDuration)

  const bgAnimated = useAnimated('background')
  const bgSpeed = useChannel('background', 'speed', bg.gradient.speed)
  const bgVignette = useChannel('background', 'vignette', bg.vignette)

  return (
    <Section title="Background">
      <Row label="Type" stack>
        <Segmented<BackgroundKind> value={bg.kind} options={BG_OPTIONS}
          onChange={(kind) => setBackground({ kind })} />
      </Row>

      {(bg.kind === 'color' || bg.kind === 'transparent' || bg.fit === 'contain') && (
        <Row label={bg.kind === 'transparent' ? 'Preview colour' : 'Colour'}>
          <ColorField value={bg.color} onChange={(color) => setBackground({ color })} />
        </Row>
      )}

      {bg.kind === 'mesh' && (
        <>
          <Row label="Animation" stack>
            <span className="filerow">
              <FileButton
                accept="application/json,.json" label="Replace" compact
                onFile={async (f) => {
                  try {
                    JSON.parse(await f.text())
                  } catch {
                    useStore.getState().setError(`${f.name} is not a readable Lottie JSON file`)
                    return
                  }
                  if (bg.meshUrl.startsWith('blob:')) URL.revokeObjectURL(bg.meshUrl)
                  setBackground({ meshUrl: URL.createObjectURL(f), meshName: f.name })
                }}
              />
              {bg.meshUrl !== DEFAULT_MESH_URL && (
                <button
                  type="button" className="btn small ghost"
                  onClick={() => {
                    if (bg.meshUrl.startsWith('blob:')) URL.revokeObjectURL(bg.meshUrl)
                    setBackground({ meshUrl: DEFAULT_MESH_URL, meshName: DEFAULT_MESH_NAME })
                  }}
                >
                  Default
                </button>
              )}
            </span>
          </Row>
          <p className="note filename">{bg.meshName}</p>
          <p className="note">
            {backgroundDuration > 0
              ? <>Runs for <strong>{backgroundDuration.toFixed(1)}s</strong> and holds on the last frame — it does not loop. The timeline and the export default to that length.</>
              : 'Loading animation…'}
          </p>
        </>
      )}

      {bg.kind === 'gradient' && (
        <>
          <div className="gradient-stops">
            {bg.gradient.colors.map((c, i) => (
              <input
                key={i} type="color" value={c}
                onChange={(e) => {
                  const colors = [...bg.gradient.colors] as typeof bg.gradient.colors
                  colors[i] = e.target.value
                  setBackground({ gradient: { ...bg.gradient, colors } })
                }}
              />
            ))}
            <button type="button" className="btn small" onClick={() => setBackground({ gradient: { ...bg.gradient, colors: randomPalette() } })}>
              Shuffle
            </button>
          </div>
          <Row label="Speed" hint="0 freezes" animated={bgAnimated}>
            <Slider value={bgSpeed} min={0} max={2} step={0.01}
              onChange={(speed) => setBackground({ gradient: { ...bg.gradient, speed } })} />
          </Row>
          <Row label="Scale">
            <Slider value={bg.gradient.scale} min={0.2} max={4} step={0.01}
              onChange={(scale) => setBackground({ gradient: { ...bg.gradient, scale } })} />
          </Row>
          <Row label="Warp">
            <Slider value={bg.gradient.warp} min={0} max={2} step={0.01}
              onChange={(warp) => setBackground({ gradient: { ...bg.gradient, warp } })} />
          </Row>
          <Row label="Grain">
            <Slider value={bg.gradient.grain} min={0} max={0.2} step={0.001}
              onChange={(grain) => setBackground({ gradient: { ...bg.gradient, grain } })} />
          </Row>
        </>
      )}

      {bg.kind === 'image' && (
        <>
          <Row label="File">
            <span className="filerow">
              <FileButton accept="image/*" label={bg.imageName ? 'Replace' : 'Upload image'} compact
                onFile={(f) => {
                  if (bg.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(bg.imageUrl)
                  setBackground({ imageUrl: URL.createObjectURL(f), imageName: f.name })
                }} />
              <em className="filename">{bg.imageName ?? 'none'}</em>
            </span>
          </Row>
          <p className="note">A mesh-gradient export, a photo, or any still. Upload it here.</p>
        </>
      )}

      {bg.kind === 'video' && (
        <>
          <Row label="File">
            <span className="filerow">
              <FileButton accept="video/*" label={bg.videoName ? 'Replace' : 'Upload video'} compact
                onFile={(f) => {
                  if (bg.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(bg.videoUrl)
                  setBackground({ videoUrl: URL.createObjectURL(f), videoName: f.name }, f)
                }} />
              <em className="filename">{bg.videoName ?? 'none'}</em>
            </span>
          </Row>
          <p className="note">Decoded frame-by-frame on export, so the video stays in sync with the animation.</p>
        </>
      )}

      {(bg.kind === 'image' || bg.kind === 'video' || bg.kind === 'mesh') && (
        <>
          <Row label="Fit">
            <Segmented value={bg.fit} options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }]}
              onChange={(fit) => setBackground({ fit })} />
          </Row>
          <Row label="Zoom">
            <Slider value={bg.zoom} min={0.2} max={4} step={0.01} onChange={(zoom) => setBackground({ zoom })} />
          </Row>
          <Row label="Offset X">
            <Slider value={bg.offsetX} min={-0.5} max={0.5} step={0.001} onChange={(offsetX) => setBackground({ offsetX })} />
          </Row>
          <Row label="Offset Y">
            <Slider value={bg.offsetY} min={-0.5} max={0.5} step={0.001} onChange={(offsetY) => setBackground({ offsetY })} />
          </Row>
        </>
      )}

      {bg.kind !== 'transparent' && (
        <Row label="Vignette" animated={bgAnimated}>
          <Slider value={bgVignette} min={0} max={1} step={0.01} onChange={(vignette) => setBackground({ vignette })} />
        </Row>
      )}
    </Section>
  )
}

function randomPalette(): [string, string, string, string] {
  const h = Math.random() * 360
  const mk = (dh: number, s: number, l: number) => hslHex((h + dh + 360) % 360, s, l)
  return [mk(0, 55, 22), mk(28, 62, 48), mk(-24, 48, 72), mk(12, 60, 12)]
}

function hslHex(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/* ------------------------------------------------------------------ */
/* Screen content                                                      */
/* ------------------------------------------------------------------ */

export function ScreenPanel() {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const device = useStore((s) => s.device)
  const meta = DEVICES[device]

  const screenAnimated = useAnimated('screen')
  const screenBrightness = useChannel('screen', 'brightness', screen.brightness)

  const recommended = useMemo(() => {
    const w = 1206
    return { w, h: Math.round(w / meta.screenAspect / 2) * 2 }
  }, [meta.screenAspect])

  return (
    <Section title="Screen">
      <Row label="Content" stack>
        <span className="filerow">
          <FileButton accept="image/*" label="Image" compact
            onFile={(f) => {
              if (screen.url.startsWith('blob:')) URL.revokeObjectURL(screen.url)
              setScreen({ kind: 'image', url: URL.createObjectURL(f), name: f.name, followVariant: false }, null)
            }} />
          <FileButton accept="video/*" label="Video" compact
            onFile={(f) => {
              if (screen.url.startsWith('blob:')) URL.revokeObjectURL(screen.url)
              setScreen({ kind: 'video', url: URL.createObjectURL(f), name: f.name, followVariant: false }, f)
            }} />
          {!screen.followVariant && (
            <button
              type="button" className="btn small ghost"
              onClick={() => {
                if (screen.url.startsWith('blob:')) URL.revokeObjectURL(screen.url)
                setScreen({ kind: 'image', followVariant: true }, null)
              }}
            >
              Stock
            </button>
          )}
        </span>
      </Row>
      <p className="note filename">{screen.name}</p>
      <Row label="Brightness" animated={screenAnimated}>
        <Slider value={screenBrightness} min={0} max={4} step={0.01}
          onChange={(brightness) => setScreen({ brightness })} />
      </Row>
      <Row label="Zoom">
        <Slider value={screen.zoom} min={0.5} max={3} step={0.005} onChange={(zoom) => setScreen({ zoom })} />
      </Row>
      <Row label="Offset X">
        <Slider value={screen.offsetX} min={-0.5} max={0.5} step={0.001} onChange={(offsetX) => setScreen({ offsetX })} />
      </Row>
      <Row label="Offset Y">
        <Slider value={screen.offsetY} min={-0.5} max={0.5} step={0.001} onChange={(offsetY) => setScreen({ offsetY })} />
      </Row>
      <p className="note">
        Display is {meta.screenMm[0]} × {meta.screenMm[1]} mm, aspect {meta.screenAspect.toFixed(4)}.
        Author at <strong>{recommended.w} × {recommended.h}</strong> for a pixel-exact fit.
        Anything else is cover-cropped from the centre rather than squashed.
      </p>
    </Section>
  )
}

/* ------------------------------------------------------------------ */

export function ProjectPanel() {
  const exportProject = useStore((s) => s.exportProject)
  const importProject = useStore((s) => s.importProject)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!msg) return
    const id = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(id)
  }, [msg])

  return (
    <Section title="Project">
      <div className="btnrow">
        <button
          type="button" className="btn"
          onClick={() => {
            const blob = new Blob([JSON.stringify(exportProject(), null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'mockup-project.json'
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 5000)
            setMsg('Saved mockup-project.json')
          }}
        >
          Save project
        </button>
        <FileButton
          accept="application/json" label="Load project"
          onFile={async (f) => {
            try {
              importProject(JSON.parse(await f.text()))
              setMsg('Project loaded')
            } catch {
              setMsg('That file could not be read as a project')
            }
          }}
        />
      </div>
      <p className="note">
        Keyframes, saved views, colourway, frame and lighting travel with the file.
        Uploaded media does not — re-attach images and video after loading.
      </p>
      {msg && <p className="note ok">{msg}</p>}
    </Section>
  )
}
