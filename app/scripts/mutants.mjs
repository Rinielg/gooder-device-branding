/**
 * Mutation check for the characterisation tests.
 *
 * Tests written after the code pass the moment they are written, so "watch it
 * fail" cannot be the proof that they test the right thing. This is the
 * substitute: break the code on purpose and confirm the suite notices.
 *
 * A survivor means either a gap in the tests or an equivalent mutant — code
 * that cannot behave differently. Work out which before adding a test.
 *
 *   node scripts/mutants.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const MUTANTS = [
  ['nearestAngle: drop the wrap', 'src/engine/presets.ts',
    '  let a = target\n  while (a - from > 180) a -= 360\n  while (a - from < -180) a += 360\n  return Math.round(a * 1000) / 1000',
    '  return Math.round(target * 1000) / 1000'],
  ['isPresetActive: compare rotation without the wrap', 'src/engine/presets.ts',
    '        ? near(((w - h) % 360 + 540) % 360 - 180, 0, 0.5)', '        ? near(w, h, 0.5)'],
  ['sanitisePreset: walk the input, not the registry', 'src/engine/presets.ts',
    "  for (const id of TRACK_ORDER) {\n    const def = TRACKS[id]\n    const v = rawValue[id]\n    if (!def || typeof v !== 'object' || v === null) continue",
    "  for (const id of Object.keys(rawValue) as TrackId[]) {\n    const def = TRACKS[id]\n    const v = rawValue[id]\n    if (typeof v !== 'object' || v === null) continue\n    if (!def) { value[id] = {}; tracks.push(id); continue }"],
  ['shiftKeys: clamp each key, not the delta', 'src/engine/tracks.ts',
    '  const shift = Math.max(delta, -earliest)\n  return keys.map((k) => (moving.has(k.id) ? { ...k, time: quantise(k.time + shift) } : k))',
    '  return keys.map((k) => (moving.has(k.id) ? { ...k, time: quantise(Math.max(0, k.time + delta)) } : k))'],
  ['shiftKeys: drop quantise', 'src/engine/tracks.ts',
    'time: quantise(k.time + shift)', 'time: k.time + shift'],
  ['mergeTransform: ignore the sample', 'src/engine/tracks.ts',
    '    if (def?.write && v) def.write(out, v)', '    if (false && def?.write && v) def.write(out, v)'],
  ['hasAnimation: require two keys', 'src/engine/tracks.ts',
    'export const hasAnimation = (c: Composition) => liveTracks(c).some((t) => t.enabled)',
    'export const hasAnimation = (c: Composition) => liveTracks(c).some((t) => t.enabled && t.keys.length > 1)'],
  ['lastKeyTime: skip muted tracks', 'src/engine/tracks.ts',
    '  for (const t of liveTracks(c)) out = Math.max(out, t.keys[t.keys.length - 1].time)',
    '  for (const t of liveTracks(c)) if (t.enabled) out = Math.max(out, t.keys[t.keys.length - 1].time)'],
  ['evaluate: allow trailing junk', 'src/ui/expr.ts',
    '  return i === s.length && out !== null && Number.isFinite(out) ? out : null',
    '  return out !== null && Number.isFinite(out) ? out : null'],
  ['Timeline: ease from the wrong key', 'src/engine/Timeline.ts',
    'ease: easeOf(cur)', 'ease: easeOf(prev)'],
  ['applySampled: skip the base when a sample exists', 'src/engine/tracks.ts',
    '    def.apply(target, sample?.[id] ?? def.read(source))',
    '    if (sample?.[id]) def.apply(target, sample[id])'],
  ['applySampled: commit per slice instead of once', 'src/engine/tracks.ts',
    '    def.apply(target, sample?.[id] ?? def.read(source))',
    '    def.apply(target, sample?.[id] ?? def.read(source))\n    target.commit()'],
  ['applySampled: send every light to the key light', 'src/engine/tracks.ts',
    '  apply: (t, v) => t.setLightSample(id, v),', "  apply: (t, v) => t.setLightSample('key', v),"],
  ['compositionDuration: background beats an explicit length', 'src/state/store.ts',
    '  if (c.duration > 0) return Math.max(c.duration, lastKeyTime(c))',
    '  if (c.duration > 0) return Math.max(c.duration, lastKeyTime(c), backgroundDuration)'],
  ['compositionDuration: clip ignores the keys once explicit', 'src/state/store.ts',
    '  if (c.duration > 0) return Math.max(c.duration, lastKeyTime(c))', '  if (c.duration > 0) return c.duration'],
  ['compositionDuration: drop the headroom past the last key', 'src/state/store.ts',
    '    ? Math.max(keys + 1, MIN_COMPOSITION)', '    ? Math.max(keys, MIN_COMPOSITION)'],
  ['autoKey: stop backfilling zero', 'src/state/store.ts',
    '      const keys = time > 1e-3\n        ? [makeTrackKey(0, was), makeTrackKey(time, value)]\n        : [makeTrackKey(0, value)]',
    '      const keys = [makeTrackKey(time, value)]'],
  ['keyTrack: stop giving a clip when armed mid-way', 'src/state/store.ts',
    '        ?? makeTrack(id, time > 1e-3 ? [makeTrackKey(0, value)] : [])', '        ?? makeTrack(id, [])'],
  ['springEase: drop the settle-time normalisation', 'src/ui/spring.ts',
    '    return position(p * settle)', '    return position(p)'],
  ['springEase: do not floor a negative damping', 'src/ui/spring.ts',
    '  const c = Math.max(damping, 0.01)', '  const c = damping'],
  ['starters: end somewhere other than the pose', 'src/engine/starters.ts',
    "        position: [at(0, pos(t.posX - 2.2, t.posY, t.posZ)), at(1.1, pos(t.posX, t.posY, t.posZ), 'power3.out')],",
    "        position: [at(0, pos(t.posX - 2.2, t.posY, t.posZ)), at(1.1, pos(0, 0, 0), 'power3.out')],"],
  ['removeTrack: stop handing the property back', 'src/state/store.ts',
    "      if (sampled) writeSample(get(), { [id]: sampled }, [id], 'hand back')", '      void sampled'],
  ['silently: record history anyway', 'src/state/store.ts',
    '      restoring = true\n      try { run() } finally { restoring = false }', '      run()'],
  ['curveBox: measure the curve without the unit box', 'src/ui/ease.ts',
    '  let lo = 0\n  let hi = 1\n  for (let i = 0; i <= steps; i++) {',
    '  let lo = Infinity\n  let hi = -Infinity\n  for (let i = 0; i <= steps; i++) {'],
  ['curveBox: sample only the ends', 'src/ui/ease.ts',
    'export function curveBox(ease: (x: number) => number, steps = 64)',
    'export function curveBox(ease: (x: number) => number, steps = 1)'],
  ['bezierHandles: measure from the far end of the segment', 'src/ui/ease.ts',
    '    value: v0 + (v1 - v0) * b[i * 2 + 1],', '    value: v1 + (v1 - v0) * b[i * 2 + 1],'],
  ['bezierFromHandle: let a handle leave its segment', 'src/ui/ease.ts',
    '  next[which * 2] = round(clamp((point.time - t0) / dt, 0, 1))',
    '  next[which * 2] = round((point.time - t0) / dt)'],
  ['bezierFromHandle: shape a segment with no value axis', 'src/ui/ease.ts',
    '  if (Math.abs(dt) < 1e-9 || Math.abs(dv) < 1e-9) return null',
    '  if (Math.abs(dt) < 1e-9) return null'],
  ['bezierFromHandle: keep the raw pointer precision', 'src/ui/ease.ts',
    '  next[which * 2 + 1] = round((point.value - v0) / dv)',
    '  next[which * 2 + 1] = (point.value - v0) / dv'],
  ['segmentPaths: start each segment at its own key', 'src/ui/curvePaths.ts',
    '    const parts = [`M${xFor(prev.time)},${yFor(from)}`]',
    '    const parts = [`M${xFor(cur.time)},${yFor(to)}`]'],
  ['segmentPaths: name a segment after the key it leaves', 'src/ui/curvePaths.ts',
    '    out.push({ keyId: cur.id, d: parts.join(\' \') })',
    '    out.push({ keyId: prev.id, d: parts.join(\' \') })'],
  ['segmentPaths: draw a chord instead of the ease', 'src/ui/curvePaths.ts',
    'yFor(from + (to - from) * ease(p)).toFixed(2)', 'yFor(from + (to - from) * p).toFixed(2)'],

  ['sanitiseProject: trust the device id in the file', 'src/state/project.ts',
    "    device: typeof raw.device === 'string' && Object.hasOwn(DEVICES, raw.device)\n      ? (raw.device as DeviceId)\n      : base.device,",
    "    device: typeof raw.device === 'string' ? (raw.device as DeviceId) : base.device,"],
  ['sanitiseProject: drop the frame clamp', 'src/state/project.ts',
    '      width: clampSize(out.frame.width),\n      height: clampSize(out.frame.height),',
    '      width: out.frame.width,\n      height: out.frame.height,'],
  ['acceptsLeaf: take any number, finite or not', 'src/state/project.ts',
    "  if (typeof base === 'number') return typeof raw === 'number' && Number.isFinite(raw)",
    "  if (typeof base === 'number') return typeof raw === 'number'"],
  ['acceptsLeaf: stop checking the type at all', 'src/state/project.ts',
    '  return typeof raw === typeof base', '  return true'],
  ['coerceShape: take an array element by element', 'src/state/project.ts',
    '    return ok ? (raw.map((v, i) => coerceShape(base[i], v)) as T) : base',
    '    return raw.map((v, i) => coerceShape(base[i], v)) as T'],
  ['coerceShape: keep keys the default does not have', 'src/state/project.ts',
    '    const out: Plain = {}\n    for (const [k, v] of Object.entries(base)) out[k] = coerceShape(v, raw[k])',
    '    const out: Plain = { ...raw }\n    for (const [k, v] of Object.entries(base)) out[k] = coerceShape(v, raw[k])'],
  ['store: validate a loaded file against the defaults, not the current state', 'src/state/store.ts',
    '      ...shell(p, pickShell(s)),', '      ...shell(p, DEFAULT_SHELL),'],
  ['store: validate before migrating', 'src/state/store.ts',
    '  sanitiseProject({ ...raw, lighting: migrateLighting(raw) }, base)',
    '  sanitiseProject(raw, base)'],

  ['shiftSelected: clamp per track instead of across the group', 'src/engine/tracks.ts',
    '  let earliest = Infinity\n  for (const [id, ids] of moving) {\n    for (const k of c.tracks[id]!.keys) if (ids.has(k.id)) earliest = Math.min(earliest, k.time)\n  }\n  const shift = Math.max(delta, -earliest)',
    '  const shift = delta'],
  ['shiftSelected: leave the keys unsorted', 'src/engine/tracks.ts',
    '      .sort((a, b) => a.time - b.time)\n    tracks[id] = { ...track, keys }',
    '    tracks[id] = { ...track, keys }'],
  ['shiftSelected: drop quantise', 'src/engine/tracks.ts',
    '      .map((k) => (ids.has(k.id) ? { ...k, time: quantise(k.time + shift) } : k))',
    '      .map((k) => (ids.has(k.id) ? { ...k, time: k.time + shift } : k))'],
  ['dropKeys: keep a track with no keys left', 'src/engine/tracks.ts',
    '    if (keys.length === 0) delete tracks[id]\n    else tracks[id] = { ...track, keys }',
    '    tracks[id] = { ...track, keys }'],
  ['toggleRef: drop the key being edited instead of promoting another', 'src/state/selection.ts',
    '  if (without.length === 0) return null\n  const [first, ...rest] = without\n  return { ...first, kind: \'key\', more: rest.length ? rest : undefined }',
    '  return null'],
  ['toggleRef: let the same key be added twice', 'src/state/selection.ts',
    '  if (without.length === refs.length) {',
    '  if (true) {'],
  ['toggleRef: keep a segment selection when a key joins it', 'src/state/selection.ts',
    "    return { ...sel, kind: 'key', more: [...(sel.more ?? []), ref] }",
    '    return { ...sel, more: [...(sel.more ?? []), ref] }'],
  ['selectedRefs: forget the key being edited', 'src/state/selection.ts',
    '  return [{ track: sel.track, key: sel.key }, ...(sel.more ?? [])]',
    '  return [...(sel.more ?? [])]'],
  ['matchShortcuts: let one character search the prose too', 'src/ui/shortcuts.ts',
    '  const keysOnly = q.length === 1', '  const keysOnly = false'],
  ['matchShortcuts: keep groups that matched nothing', 'src/ui/shortcuts.ts',
    '    .filter((g) => g.items.length > 0)', '    .filter(() => true)'],

  ['rulerTime: clamp even when no limit was asked for', 'src/ui/ruler.ts',
    '  return limit === undefined ? t : Math.min(t, limit)',
    '  return Math.min(t, limit ?? 4)'],
  ['rulerTime: ignore the limit', 'src/ui/ruler.ts',
    '  return limit === undefined ? t : Math.min(t, limit)', '  return t'],
  ['rulerTime: forget the gutter', 'src/ui/ruler.ts',
    '  const t = quantise((offsetX - gutter) / pxPerSec)',
    '  const t = quantise(offsetX / pxPerSec)'],
  ['rulerTime: drop quantise', 'src/ui/ruler.ts',
    '  const t = quantise((offsetX - gutter) / pxPerSec)',
    '  const t = Math.max(0, (offsetX - gutter) / pxPerSec)'],

  ['screenCrop: cover-crop the sides again', 'src/engine/screen.ts',
    '  const rx = 1 / z', '  const rx = (aspect > screenAspect ? screenAspect / aspect : 1) / z'],
  ['screenCrop: centre the image vertically', 'src/engine/screen.ts',
    '      TOP_V - offsetY,', '      (1 - ry) / 2 - offsetY,'],
  ['screenCrop: leave height out of the zoom', 'src/engine/screen.ts',
    '  const ry = aspect / screenAspect / z', '  const ry = aspect / screenAspect'],
  ['screenCrop: stop recentring x when zoomed', 'src/engine/screen.ts',
    '      (1 - rx) / 2 + offsetX,', '      offsetX,'],
  ['screenCrop: divide by a zoom of zero', 'src/engine/screen.ts',
    '  const z = Math.max(zoom, 0.05)', '  const z = zoom'],
  ['padHeight: pad a tall image as well', 'src/engine/screen.ts',
    '  return needed > texH ? needed : null', '  return needed'],
  ['padHeight: pad against the wrong axis', 'src/engine/screen.ts',
    '  const needed = Math.round(texW / screenAspect)',
    '  const needed = Math.round(texW * screenAspect)'],

  ['describeChanges: drop the "and N more" tail', 'src/state/changes.ts',
    '  return `${first.detail}, ${second.detail} and ${changes.length - 2} more`',
    '  return `${first.detail}, ${second.detail}`'],
  ['describeChanges: call no changes something', 'src/state/changes.ts',
    "  if (changes.length === 0) return 'No changes'", "  if (false) return 'No changes'"],
  ['describeChanges: compare floats exactly', 'src/state/changes.ts',
    'const near = (a: number, b: number) => Math.abs(a - b) < 1e-4',
    'const near = (a: number, b: number) => a === b'],
  ['describeChanges: split the pose into three rows', 'src/state/changes.ts',
    "    const joined = parts.length === 1 ? parts[0]\n      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`",
    '    const joined = parts[0]'],
  ['describeChanges: count tracks instead of keyframes', 'src/state/changes.ts',
    '    const countB = [...tb.values()].reduce((n, t) => n + t.keys.length, 0)',
    '    const countB = tb.size'],
  ['describeChanges: let a resolved url read as an edit', 'src/state/changes.ts',
    '    if (a.screen.name !== b.screen.name || a.screen.assetId !== b.screen.assetId) {',
    '    if (a.screen.name !== b.screen.name || a.screen.url !== b.screen.url) {'],
  ['describeChanges: miss a track that started animating', 'src/state/changes.ts',
    '    for (const id of tb.keys()) {\n      if (!ta.has(id)) add(out, \'Timeline\', `${labelOf(id)} animated`)\n    }',
    '    for (const id of tb.keys()) {\n      if (false) add(out, \'Timeline\', `${labelOf(id)} animated`)\n    }'],

]

let caught = 0
const problems = []
for (const [name, file, from, to] of MUTANTS) {
  const original = readFileSync(file, 'utf8')
  if (!original.includes(from)) {
    problems.push([name, 'STALE — the source it targets has changed'])
    continue
  }
  writeFileSync(file, original.replace(from, to))
  try {
    const { status } = spawnSync('npx', ['vitest', 'run'], { encoding: 'utf8' })
    if (status !== 0) caught++
    else problems.push([name, 'SURVIVED — a gap, or an equivalent mutant'])
  } finally {
    writeFileSync(file, original)
  }
}

for (const [name, why] of problems) console.log(`  ${name}\n    ${why}`)
console.log(`\n${caught}/${MUTANTS.length} mutations caught`)
process.exit(problems.length === 0 ? 0 : 1)
