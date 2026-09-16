import * as THREE from 'three'
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light'

/**
 * A Lottie animation rasterised into a canvas and bound as a texture.
 *
 * Lottie suits a designed background better than video: it is vector, so it
 * stays clean at any export size, and `goToAndStop(frame, true)` is exactly
 * frame-accurate — none of the off-by-one seeking that makes an
 * `HTMLVideoElement` unusable for deterministic export.
 *
 * It is rendered through the SVG renderer and then drawn into a canvas, rather
 * than through lottie-web's canvas renderer directly. The canvas renderer does
 * not apply the opacity stops on a gradient fill: a radial gradient that should
 * fade to nothing at its rim stays fully opaque instead, so soft blended blobs
 * come out as hard-edged ellipses. The SVG renderer honours them, and
 * rasterising its output costs about 3ms a frame at 1920x1080.
 */
export class LottieLayer {
  private readonly anim: AnimationItem
  private readonly container: HTMLDivElement
  private readonly svg: SVGSVGElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly serialiser = new XMLSerializer()

  private lastDrawnFrame = -1
  private inFlight: Promise<void> | null = null
  private queuedFrame: number | null = null

  readonly texture: THREE.CanvasTexture
  readonly duration: number
  readonly aspect: number
  readonly frameRate: number
  readonly totalFrames: number

  private constructor(
    anim: AnimationItem,
    container: HTMLDivElement,
    svg: SVGSVGElement,
    ctx: CanvasRenderingContext2D,
    texture: THREE.CanvasTexture,
    width: number,
    height: number,
  ) {
    this.anim = anim
    this.container = container
    this.svg = svg
    this.ctx = ctx
    this.texture = texture
    this.frameRate = anim.frameRate
    this.totalFrames = anim.totalFrames
    this.duration = anim.totalFrames / anim.frameRate
    this.aspect = width / height
  }

  static async create(url: string): Promise<LottieLayer> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not load the animation (${res.status})`)
    return LottieLayer.fromData(await res.json())
  }

  static async fromData(data: unknown): Promise<LottieLayer> {
    const meta = data as { w?: number; h?: number }
    const width = meta.w || 1920
    const height = meta.h || 1080

    const container = document.createElement('div')
    container.setAttribute('aria-hidden', 'true')
    container.style.cssText =
      `position:fixed;left:-99999px;top:0;pointer-events:none;width:${width}px;height:${height}px;`
    document.body.appendChild(container)

    const anim = lottie.loadAnimation<'svg'>({
      container,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      animationData: data,
    })

    const svg = container.querySelector('svg')
    if (!svg) {
      anim.destroy()
      container.remove()
      throw new Error('The animation renderer produced no output')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      anim.destroy()
      container.remove()
      throw new Error('Could not create a 2D context for the animation')
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping

    const layer = new LottieLayer(anim, container, svg, ctx, texture, width, height)
    await layer.prepare(0)
    return layer
  }

  private frameAt(t: number) {
    const clamped = Math.min(Math.max(t, 0), this.duration)
    return Math.min(Math.round(clamped * this.frameRate), this.totalFrames - 1)
  }

  /**
   * Request the frame at `t` seconds without waiting for it. Used for the live
   * preview, where being a few milliseconds behind is invisible. Requests that
   * arrive while a raster is in flight collapse to the most recent one.
   */
  seek(t: number) {
    const frame = this.frameAt(t)
    if (frame === this.lastDrawnFrame) return
    if (this.inFlight) { this.queuedFrame = frame; return }
    void this.drawFrame(frame)
  }

  /**
   * Draw the frame at `t` seconds and wait for it. Used for export, where the
   * texture has to be correct before the frame is rendered.
   */
  async prepare(t: number): Promise<void> {
    const frame = this.frameAt(t)
    if (frame === this.lastDrawnFrame) return
    while (this.inFlight) await this.inFlight
    if (frame === this.lastDrawnFrame) return
    await this.drawFrame(frame)
  }

  private drawFrame(frame: number): Promise<void> {
    const job = (async () => {
      this.anim.goToAndStop(frame, true)
      const markup = this.serialiser.serializeToString(this.svg)
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
      try {
        const img = new Image()
        img.src = url
        // Chrome cannot build an ImageBitmap from an SVG blob, so this goes
        // through an <img> and decode() rather than createImageBitmap().
        await img.decode()
        const { width, height } = this.ctx.canvas
        this.ctx.clearRect(0, 0, width, height)
        this.ctx.drawImage(img, 0, 0, width, height)
        this.lastDrawnFrame = frame
        this.texture.needsUpdate = true
      } finally {
        URL.revokeObjectURL(url)
      }
    })()

    this.inFlight = job.finally(() => {
      this.inFlight = null
      const next = this.queuedFrame
      this.queuedFrame = null
      if (next !== null && next !== this.lastDrawnFrame) void this.drawFrame(next)
    })
    return this.inFlight
  }

  dispose() {
    this.anim.destroy()
    this.texture.dispose()
    this.container.remove()
  }
}
