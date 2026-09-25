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
