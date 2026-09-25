import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { mergeTransform } from './tracks'
import { DEFAULT_SPRING, springEase } from '../ui/spring'
import type { Composition, Sample, Track, TrackId, TrackKey, TrackValue, Transform } from './types'

gsap.registerPlugin(CustomEase)

/**
 * One paused GSAP timeline per track, seeked rather than played.
 *
 * Paused-and-seeked is what makes export reproducible: playing would tie the
 * result to wall-clock time, whereas seeking to `frame / fps` gives the same
 * pixels on a fast machine, a slow machine and a backgrounded tab.
 *
 * One timeline *per track* is what makes properties independent. A single
 * timeline over a shared proxy would force every property to share a key
 * schedule, which is the limitation this replaces.
 */
interface TrackRunner {
  tl: gsap.core.Timeline
  proxy: TrackValue
  enabled: boolean
  /** Time of the last key; seeking past it holds. */
  end: number
  /**
   * The Track this was built from. Store edits replace only the track they
   * touch, so identity here lets a rebuild skip the untouched ones — which
   * matters while a key is being dragged and the composition changes on every
   * pointermove.
   */
  src: Track
}

export class CompositionTimeline {
  private readonly runners = new Map<TrackId, TrackRunner>()

  /** Longest track, in seconds. Not the composition length — that is the store's. */
  duration = 0

  build(composition: Composition) {
    const next = new Map<TrackId, TrackRunner>()
    let longest = 0

    for (const track of Object.values(composition.tracks)) {
      if (!track || track.keys.length === 0) continue
      const existing = this.runners.get(track.id)
      const runner = existing?.src === track ? existing : buildTrack(track)
      if (existing && existing !== runner) existing.tl.kill()
      next.set(track.id, runner)
      if (track.enabled) longest = Math.max(longest, runner.end)
    }

    for (const [id, r] of this.runners) if (next.get(id) !== r) r.tl.kill()
    this.runners.clear()
    for (const [id, r] of next) this.runners.set(id, r)
    this.duration = longest
  }

  /** True when at least one enabled track drives something. */
  get animated() {
    for (const r of this.runners.values()) if (r.enabled) return true
    return false
  }

  has(id: TrackId) {
    return this.runners.get(id)?.enabled === true
  }

  /** Evaluate every enabled track at `t` seconds. */
  sample(t: number): Sample {
    const out: Sample = {}
    for (const [id, runner] of this.runners) {
      if (!runner.enabled) continue
      // suppressEvents = true: a scrub must not fire callbacks.
      runner.tl.time(Math.min(Math.max(t, 0), runner.end), true)
      out[id] = { ...runner.proxy }
    }
    return out
  }

  /**
   * The pose at `t`, with anything unanimated held at `base`.
   *
   * Holding rather than defaulting is the point: rotation can be keyed on its
   * own while position stays wherever the user last put it.
   */
  sampleTransform(t: number, base: Transform): Transform {
    return mergeTransform(base, this.sample(t))
  }

  dispose() {
    this.disposeRunners()
    this.duration = 0
  }

  private disposeRunners() {
    for (const r of this.runners.values()) r.tl.kill()
    this.runners.clear()
  }
}

function buildTrack(track: Track): TrackRunner {
  const keys = [...track.keys].sort((a, b) => a.time - b.time)
  const proxy: TrackValue = { ...keys[0].value }

  const tl = gsap.timeline({ paused: true })
  tl.set(proxy, { ...keys[0].value }, 0)

  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1]
    const cur = keys[i]
    // A zero-length tween is a step, but GSAP treats duration 0 as "set now",
    // which would land it at the wrong time. A sub-frame duration steps cleanly.
    const duration = Math.max(cur.time - prev.time, 1e-4)
    tl.to(proxy, { ...cur.value, duration, ease: easeOf(cur) }, prev.time)
  }

  return { tl, proxy, enabled: track.enabled, end: keys[keys.length - 1].time, src: track }
}

function easeOf(key: TrackKey): string | gsap.EaseFunction {
  // A spring is a function, not a curve GSAP knows the name of. Handing it the
  // same function the preview draws is what stops the two disagreeing.
  if (key.ease === 'spring') return springEase(key.spring ?? DEFAULT_SPRING)
  if (key.ease !== 'custom') return key.ease
  const b = key.bezier
  if (!b) return 'power2.inOut'
  // CustomEase's path format IS a cubic bezier from (0,0) to (1,1); the id is
  // derived from the control points so repeats reuse one registration.
  const id = `cb_${b.map((n) => n.toFixed(4)).join('_')}`.replace(/[.-]/g, '')
  return CustomEase.create(id, `M0,0 C${b[0]},${b[1]} ${b[2]},${b[3]} 1,1`)
}
