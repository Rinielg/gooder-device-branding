import { useState } from 'react'
import { useStore } from '../state/store'
import {
  LIGHT_IDS, LIGHT_LABELS, TONE_MAPPINGS,
  type EnvMode, type GroundMode, type LightId, type LightType,
  type ShadowQuality, type ToneMappingName, type TrackId,
} from '../engine/types'
import { ColorField, FileButton, Row, Section, Segmented, Slider } from './kit'
import { attach } from '../state/assetSync'
import { useAnimated, useChannel } from './sampled'

const ENV_MODES: { value: EnvMode; label: string }[] = [
  { value: 'studio', label: 'Studio' },
  { value: 'hdri', label: 'HDRI' },
  { value: 'sky', label: 'Sky' },
  { value: 'none', label: 'None' },
]

export function EnvironmentPanel() {
  const env = useStore((s) => s.lighting.environment)
  const setLighting = useStore((s) => s.setLighting)
  const set = (v: Partial<typeof env>) => setLighting({ environment: v })

  // While the timeline drives a property it owns it, so the control reads the
  // sampled value. Editing still writes to the project, and auto-key turns that
  // into a key at the playhead.
  const envAnimated = useAnimated('environment')
  const envIntensity = useChannel('environment', 'intensity', env.intensity)
  const envRotationY = useChannel('environment', 'rotationY', env.rotationY)
  const envExposure = useChannel('environment', 'exposure', env.exposure)

  return (
    <Section title="Environment">
      <Row label="Source" stack>
        <Segmented<EnvMode> value={env.mode} options={ENV_MODES} onChange={(mode) => set({ mode })} />
      </Row>

      {env.mode === 'hdri' && (
        <>
          <Row label="File" stack>
            <span className="filerow">
              <FileButton
                accept=".hdr,.exr,image/vnd.radiance" label={env.hdriName ? 'Replace' : 'Upload HDRI'} compact
                onFile={(f) => void attach('environment.hdri', f)}
              />
              <em className="filename">{env.hdriName ?? 'none'}</em>
            </span>
          </Row>
          {!env.hdriUrl && <p className="note">Upload an equirectangular .hdr to light the device from it.</p>}
        </>
      )}

      {env.mode === 'sky' && (
        <>
          <Row label="Sun height" hint="°">
            <Slider value={env.sunElevation} min={-10} max={90} step={1}
              onChange={(sunElevation) => set({ sunElevation })} />
          </Row>
          <Row label="Sun angle" hint="°">
            <Slider value={env.sunAzimuth} min={0} max={360} step={1}
              onChange={(sunAzimuth) => set({ sunAzimuth })} />
          </Row>
        </>
      )}

      {env.mode !== 'none' && (
        <>
          <Row label="Intensity" animated={envAnimated}>
            <Slider value={envIntensity} min={0} max={4} step={0.01}
              onChange={(intensity) => set({ intensity })} />
          </Row>
          <Row label="Rotation" hint="°" animated={envAnimated}>
            <Slider value={envRotationY} min={-180} max={180} step={1}
              onChange={(rotationY) => set({ rotationY })} />
          </Row>
        </>
      )}

      <Row label="Ambient">
        <ColorField value={env.ambientColor} onChange={(ambientColor) => set({ ambientColor })} />
      </Row>
      <Row label="Ambient level">
        <Slider value={env.ambientIntensity} min={0} max={3} step={0.01}
          onChange={(ambientIntensity) => set({ ambientIntensity })} />
      </Row>

      <hr className="rule" />

      <Row label="Exposure" animated={envAnimated}>
        <Slider value={envExposure} min={0} max={3} step={0.01}
          onChange={(exposure) => set({ exposure })} />
      </Row>
      <Row label="Tone map" stack>
        <Segmented<ToneMappingName> value={env.toneMapping} options={TONE_MAPPINGS}
          onChange={(toneMapping) => set({ toneMapping })} />
      </Row>
      <label className="check">
        <input type="checkbox" checked={env.toneMapBackground}
          onChange={(e) => set({ toneMapBackground: e.target.checked })} />
        Tone map the background too
      </label>
      <p className="note">
        Exposure and tone mapping apply to the device and its reflections. The
        background is a 2D pass and stays as composed unless you switch this on.
      </p>
    </Section>
  )
}

const LIGHT_TYPES: { value: LightType; label: string }[] = [
  { value: 'directional', label: 'Directional' },
  { value: 'point', label: 'Point' },
  { value: 'spot', label: 'Spot' },
]

export function LightsPanel() {
  const lights = useStore((s) => s.lighting.lights)
  const setLight = useStore((s) => s.setLight)
  // In the store so a selected keyframe can bring its own light forward.
  const selected = useStore((s) => s.inspectorLight)
  const setSelected = useStore((s) => s.setInspectorLight)
  const l = lights[selected]

  const track = `${selected}Light` as TrackId
  const lightAnimated = useAnimated(track)
  const lightIntensity = useChannel(track, 'intensity', l.intensity)
  const lightX = useChannel(track, 'x', l.position[0])
  const lightY = useChannel(track, 'y', l.position[1])
  const lightZ = useChannel(track, 'z', l.position[2])

  const axis = (i: 0 | 1 | 2) => (v: number) => {
    // Start from what is on screen: with the light animated, the other two axes
    // are showing sampled values and must not snap back to the project's.
    const position: [number, number, number] = [lightX, lightY, lightZ]
    position[i] = v
    setLight(selected, { position })
  }

  return (
    <Section title="Lights">
      <Row label="Light" stack>
        <Segmented<LightId>
          value={selected}
          options={LIGHT_IDS.map((id) => ({
            value: id,
            label: lights[id].enabled ? LIGHT_LABELS[id] : `${LIGHT_LABELS[id]} ·`,
          }))}
          onChange={setSelected}
        />
      </Row>

      <label className="check">
        <input type="checkbox" checked={l.enabled}
          onChange={(e) => setLight(selected, { enabled: e.target.checked })} />
        {LIGHT_LABELS[selected]} light on
      </label>

      <Row label="Type" stack>
        <Segmented<LightType> value={l.type} options={LIGHT_TYPES}
          onChange={(type) => setLight(selected, { type })} />
      </Row>
      <Row label="Colour">
        <ColorField value={l.color} onChange={(color) => setLight(selected, { color })} />
      </Row>
      <Row label="Intensity" animated={lightAnimated}>
        <Slider value={lightIntensity} min={0} max={8} step={0.01}
          onChange={(intensity) => setLight(selected, { intensity })} />
      </Row>

      <Row label="X" animated={lightAnimated}><Slider value={lightX} min={-4} max={4} step={0.01} onChange={axis(0)} /></Row>
      <Row label="Y" animated={lightAnimated}><Slider value={lightY} min={-4} max={4} step={0.01} onChange={axis(1)} /></Row>
      <Row label="Z" animated={lightAnimated}><Slider value={lightZ} min={-4} max={4} step={0.01} onChange={axis(2)} /></Row>

      {l.type === 'spot' && (
        <>
          <Row label="Cone" hint="°">
            <Slider value={l.angle} min={5} max={89} step={1}
              onChange={(angle) => setLight(selected, { angle })} />
          </Row>
          <Row label="Edge">
            <Slider value={l.penumbra} min={0} max={1} step={0.01}
              onChange={(penumbra) => setLight(selected, { penumbra })} />
          </Row>
        </>
      )}
      {l.type !== 'directional' && (
        <Row label="Range" hint="0 = ∞">
          <Slider value={l.distance} min={0} max={12} step={0.1}
            onChange={(distance) => setLight(selected, { distance })} />
        </Row>
      )}

      <label className={l.type === 'directional' ? 'check' : 'check disabled'}>
        <input type="checkbox" checked={l.castShadow} disabled={l.type !== 'directional'}
          onChange={(e) => setLight(selected, { castShadow: e.target.checked })} />
        Casts the shadow
      </label>
      <p className="note">
        Positions are in device heights, so the rig keeps its shape across both
        models. Only one directional light casts — a second would lay a
        contradictory shadow over the same surface.
      </p>
    </Section>
  )
}

const GROUND_MODES: { value: GroundMode; label: string }[] = [
  { value: 'backdrop', label: 'Backdrop' },
  { value: 'floor', label: 'Floor' },
  { value: 'none', label: 'None' },
]

export function ShadowPanel() {
  const shadows = useStore((s) => s.lighting.shadows)
  const ground = useStore((s) => s.lighting.ground)
  const setLighting = useStore((s) => s.setLighting)
  const [advanced, setAdvanced] = useState(false)

  const shadowAnimated = useAnimated('shadow')
  const shadowOpacity = useChannel('shadow', 'opacity', shadows.opacity)
  const shadowSoftness = useChannel('shadow', 'softness', shadows.softness)

  return (
    <Section title="Shadow">
      <label className="check">
        <input type="checkbox" checked={shadows.enabled}
          onChange={(e) => setLighting({ shadows: { enabled: e.target.checked } })} />
        Cast shadows
      </label>

      <Row label="Catches on" stack>
        <Segmented<GroundMode> value={ground.mode} options={GROUND_MODES}
          onChange={(mode) => setLighting({ ground: { mode } })} />
      </Row>
      <Row label="Quality" stack>
        <Segmented<ShadowQuality>
          value={shadows.quality}
          options={[{ value: 'soft', label: 'Soft' }, { value: 'hard', label: 'Hard' }]}
          onChange={(quality) => setLighting({ shadows: { quality } })}
        />
      </Row>
      <Row label="Opacity" animated={shadowAnimated}>
        <Slider value={shadowOpacity} min={0} max={1} step={0.01}
          onChange={(opacity) => setLighting({ shadows: { opacity } })} />
      </Row>
      {shadows.quality === 'soft' && (
        <Row label="Softness" animated={shadowAnimated}>
          <Slider value={shadowSoftness} min={0} max={2} step={0.01}
            onChange={(softness) => setLighting({ shadows: { softness } })} />
        </Row>
      )}
      <Row label="Distance" hint="heights">
        <Slider value={shadows.distance} min={0.05} max={3} step={0.01}
          onChange={(distance) => setLighting({ shadows: { distance } })} />
      </Row>

      <button type="button" className="link" onClick={() => setAdvanced(!advanced)}>
        {advanced ? '− Advanced' : '+ Advanced'}
      </button>
      {advanced && (
        <>
          <Row label="Resolution" stack>
            <Segmented<string>
              value={String(shadows.mapSize)}
              options={[512, 1024, 2048, 4096].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => setLighting({ shadows: { mapSize: Number(v) as 512 | 1024 | 2048 | 4096 } })}
            />
          </Row>
          <Row label="Normal bias">
            <Slider value={shadows.normalBias} min={0} max={0.05} step={0.001}
              format={(v) => v.toFixed(3)}
              onChange={(normalBias) => setLighting({ shadows: { normalBias } })} />
          </Row>
          <label className="check">
            <input type="checkbox" checked={shadows.keepInTransparentExport}
              onChange={(e) => setLighting({ shadows: { keepInTransparentExport: e.target.checked } })} />
            Keep the shadow in transparent exports
          </label>
          <p className="note">
            Raise the normal bias if striping appears on the glossy body; too
            much detaches the shadow from its contact points.
          </p>
        </>
      )}
    </Section>
  )
}

export function LightingHelpersPanel() {
  const showHelpers = useStore((s) => s.showLightHelpers)
  const setShowHelpers = useStore((s) => s.setShowLightHelpers)
  const resetLighting = useStore((s) => s.resetLighting)
  return (
    <Section title="Rig" aside={
      <button type="button" className="btn small ghost" onClick={resetLighting}>Reset</button>
    }>
      <label className="check">
        <input type="checkbox" checked={showHelpers}
          onChange={(e) => setShowHelpers(e.target.checked)} />
        Show light gizmos
      </label>
      <p className="note">Gizmos are for placing lights and never appear in an export or a saved view.</p>
    </Section>
  )
}
