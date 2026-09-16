import gsap from 'gsap'
import { DEFAULT_TRANSFORM, TRANSFORM_KEYS, type Keyframe, type Transform } from './types'

/**
 * A GSAP timeline built from an explicit keyframe list.
 *
 * The timeline is always `paused` and is only ever moved with `.time()`. That
 * matters for export: playing the timeline would tie it to wall-clock time and
 * make frames non-reproducible, whereas seeking to `frame / fps` gives the same
 * result on a fast machine, a slow machine, and a background tab.
 */
export class KeyframeTimeline {
  private tl: gsap.core.Timeline | null = null
  private readonly proxy: Transform = { ...DEFAULT_TRANSFORM }

  duration = 0

  build(keyframes: Keyframe[]) {
    this.tl?.kill()
    this.tl = null

    const keys = [...keyframes].sort((a, b) => a.time - b.time)
    if (keys.length === 0) {
      this.duration = 0
      return
    }

    const tl = gsap.timeline({ paused: true })
    Object.assign(this.proxy, keys[0].transform)
    tl.set(this.proxy, { ...keys[0].transform }, 0)

    for (let i = 1; i < keys.length; i++) {
      const prev = keys[i - 1]
      const cur = keys[i]
      const duration = Math.max(cur.time - prev.time, 1e-4)
      tl.to(
        this.proxy,
        { ...cur.transform, duration, ease: cur.ease === 'none' ? 'none' : cur.ease },
        prev.time,
      )
    }

    this.tl = tl
    this.duration = keys[keys.length - 1].time
  }

  /** Evaluate the animated transform at `t` seconds. */
  sample(t: number): Transform {
    if (this.tl) {
      const clamped = Math.min(Math.max(t, 0), this.duration)
      // suppressEvents = true: a scrub should not fire callbacks.
      this.tl.time(clamped, true)
    }
    const out = {} as Transform
    for (const k of TRANSFORM_KEYS) out[k] = this.proxy[k]
    return out
  }

  dispose() {
    this.tl?.kill()
    this.tl = null
  }
}

export function makeKeyframe(time: number, transform: Transform): Keyframe {
  return {
    id: `kf_${Math.random().toString(36).slice(2, 10)}`,
    time: Math.max(0, Math.round(time * 1000) / 1000),
    ease: 'power2.inOut',
    transform: { ...transform },
  }
}
