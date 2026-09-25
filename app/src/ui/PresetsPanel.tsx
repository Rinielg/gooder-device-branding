import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { engine } from '../engine/handle'
import { trackDef } from '../engine/tracks'
import {
  BUILT_INS, SCOPES, isPresetActive, scopeOf, type Preset, type PresetScope,
} from '../engine/presets'
import { Section } from './kit'

/**
 * Named parameter sets: six built-in elevations plus whatever you save.
 *
 * Applying one goes through the ordinary setters, so with a property already
 * animated it lands as a key at the playhead — which is what makes "select a
 * key, pick an angle" work without the timeline knowing presets exist.
 */
export function PresetsPanel() {
  const presets = useStore((s) => s.presets)
  const savePreset = useStore((s) => s.savePreset)
  const playhead = useStore((s) => s.playhead)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<PresetScope>('pose')

  const save = () => {
    const thumb = engine.thumbnail?.(playhead) ?? ''
    savePreset(name.trim() || `Preset ${presets.length + 1}`, description.trim(), scope, thumb)
    setName(''); setDescription(''); setOpen(false)
  }

  return (
    <>
      <Section title="Angles">
        <div className="angle-grid">
          {BUILT_INS.map((p) => <PresetCard key={p.id} preset={p} density="compact" />)}
        </div>
        <p className="note">
          Each one centres and unscales the device as well as turning it.
          Hold <strong>alt</strong> to turn it without touching the framing.
        </p>
      </Section>

      <Section title="Saved" aside={<span className="count">{presets.length}</span>}>
        {open ? (
          <div className="angle-save">
            <input
              className="textfield" placeholder="Name" value={name} autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            />
            <textarea
              className="textfield" rows={2} value={description}
              placeholder="What does this angle show? e.g. tight on the lower third of the display, for bottom navigation"
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="segmented">
              {SCOPES.map((o) => (
                <button
                  key={o.value} type="button" title={o.hint}
                  className={o.value === scope ? 'on' : ''}
                  onClick={() => setScope(o.value)}
                >{o.label}</button>
              ))}
            </div>
            <p className="note">{SCOPES.find((o) => o.value === scope)?.hint}</p>
            <div className="btnrow">
              <button type="button" className="btn primary" onClick={save}>Save</button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setOpen(true)}>Save current…</button>
        )}

        {presets.length === 0 && !open && (
          <p className="note">
            Frame the device, then save it here. The description is what a future
            automation matches against, so describe the shot rather than the numbers.
          </p>
        )}

        <div className="angle-grid wide">
          {presets.map((p) => <PresetCard key={p.id} preset={p} />)}
        </div>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ */

export type PresetDensity = 'card' | 'mini' | 'compact'

export function PresetCard(
  { preset, density = 'card' }: { preset: Preset; density?: PresetDensity },
) {
  const compact = density !== 'card'
  const applyPreset = useStore((s) => s.applyPreset)
  const applyPresetAsKeys = useStore((s) => s.applyPresetAsKeys)
  const deletePreset = useStore((s) => s.deletePreset)
  const updatePreset = useStore((s) => s.updatePreset)
  const recapturePreset = useStore((s) => s.recapturePreset)
  const playhead = useStore((s) => s.playhead)
  // Selected slice by slice and composed here, not built inside the selector:
  // a selector that returns a fresh object never compares equal, so zustand
  // re-renders forever. Cheap mistake, loud symptom.
  const transform = useStore((s) => s.transform)
  const stage = useStore((s) => s.stage)
  const lighting = useStore((s) => s.lighting)
  const screen = useStore((s) => s.screen)
  const background = useStore((s) => s.background)
  const source = useMemo(
    () => ({ transform, stage, lighting, screen, background }),
    [transform, stage, lighting, screen, background],
  )
  const [editing, setEditing] = useState(false)

  const active = useMemo(() => isPresetActive(preset, source), [preset, source])
  const builtIn = preset.id.startsWith('builtin:')

  return (
    <div className={`angle ${density}${active ? ' on' : ''}`}>
      <button
        type="button"
        className="angle-hit"
        title={`${preset.description}\n\nClick to apply${builtIn ? ' · alt-click for rotation only' : ''} · shift-click to key it at ${playhead.toFixed(2)}s`}
        onClick={(e) => {
          if (e.shiftKey) applyPresetAsKeys(preset.id)
          // Alt turns the device without disturbing the framing.
          else applyPreset(preset.id, e.altKey ? ['rotation'] : undefined)
        }}
      >
        {density !== 'compact' && (preset.thumb
          ? <img src={preset.thumb} alt="" />
          : <span className="angle-empty" />)}
        <span className="angle-name">{preset.name}</span>
      </button>

      {!compact && (
        <>
          <span className="angle-chips">
            {preset.tracks.map((id) => {
              const def = trackDef(id)
              return def ? <i key={id} title={def.label} style={{ background: def.channels[0].colour }} /> : null
            })}
            <em>{scopeOf(preset.tracks)}</em>
          </span>
          {editing ? (
            <textarea
              className="textfield" rows={2} autoFocus defaultValue={preset.description}
              placeholder="What does this angle show?"
              onBlur={(e) => { updatePreset(preset.id, { description: e.target.value }); setEditing(false) }}
            />
          ) : (
            <p className="note angle-desc" onDoubleClick={() => setEditing(true)}>
              {preset.description || 'No description — double-click to add one.'}
            </p>
          )}
          <div className="angle-actions">
            <button type="button" className="link" onClick={() => setEditing(true)}>Describe</button>
            <button
              type="button" className="link"
              title="Replace its values with the current scene"
              onClick={() => recapturePreset(preset.id, engine.thumbnail?.(playhead) ?? '')}
            >Update</button>
            <button type="button" className="link danger" onClick={() => deletePreset(preset.id)}>Delete</button>
          </div>
        </>
      )}
    </div>
  )
}
