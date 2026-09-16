import * as THREE from 'three'
import {
  Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, Quality,
  getFirstEncodableVideoCodec, Input, BlobSource, ALL_FORMATS, CanvasSink,
  type VideoCodec,
} from 'mediabunny'
import type { Stage } from './Stage'
import type { KeyframeTimeline } from './Timeline'
import type { Transform } from './types'
import { evenSize } from './size'

export { evenSize }

export interface ExportSizeOpts {
  width: number
  height: number
  /** Multiplier on the frame size, e.g. 2 for a retina still. */
  scale: number
  transparent: boolean
}

export interface VideoExportOpts extends ExportSizeOpts {
  fps: number
  duration: number
  bitrateMbps: number
  format: 'mp4' | 'webm'
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}



/**
 * Decodes a user-supplied video frame-accurately.
 *
 * A plain <video> element is not usable here: seeking with `currentTime` lands
 * on the wrong frame often enough to matter, and `requestVideoFrameCallback`
 * does not fire at all on a paused element, so the usual
 * "seek then wait for a frame" recipe hangs during an offline export. Decoding
 * the container directly sidesteps both problems.
 */
class DeterministicVideo {
  private readonly input: Input
  private readonly sink: CanvasSink
  private readonly ctx: CanvasRenderingContext2D
  readonly duration: number
  readonly texture: THREE.CanvasTexture

  private constructor(
    input: Input,
    sink: CanvasSink,
    duration: number,
    ctx: CanvasRenderingContext2D,
    texture: THREE.CanvasTexture,
  ) {
    this.input = input
    this.sink = sink
    this.duration = duration
    this.ctx = ctx
    this.texture = texture
  }

  static async create(blob: Blob): Promise<DeterministicVideo | null> {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
    const track = await input.getPrimaryVideoTrack()
    if (!track) return null
    const duration = await track.computeDuration()
    const sink = new CanvasSink(track, { poolSize: 2 })

    const canvas = document.createElement('canvas')
    canvas.width = track.displayWidth
    canvas.height = track.displayHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    return new DeterministicVideo(input, sink, duration || 0, ctx, texture)
  }

  get aspect() { return this.ctx.canvas.width / this.ctx.canvas.height }

  /** Draw the frame that is on screen at `t`, looping past the end. */
  async seek(t: number) {
    const d = this.duration
    const at = d > 0 ? t % d : 0
    const wrapped = await this.sink.getCanvas(at)
    if (!wrapped) return
    this.ctx.drawImage(wrapped.canvas as CanvasImageSource, 0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
    this.texture.needsUpdate = true
  }

  async dispose() {
    this.texture.dispose()
    await this.input.dispose?.()
  }
}

interface ExportContext {
  stage: Stage
  timeline: KeyframeTimeline
  /** Transform used when the timeline is empty. */
  staticTransform: Transform
  backgroundVideoBlob: Blob | null
  screenVideoBlob: Blob | null
}

/** Render a single frame at `t` into the (already resized) drawing buffer. */
async function renderFrame(
  ctx: ExportContext,
  t: number,
  bg: DeterministicVideo | null,
  screen: DeterministicVideo | null,
  animated: boolean,
) {
  if (bg) await bg.seek(t)
  if (screen) await screen.seek(t)
  const transform = animated ? ctx.timeline.sample(t) : ctx.staticTransform
  ctx.stage.applyTransform(transform)
  await ctx.stage.renderPrepared(t)
}

export async function exportStill(ctx: ExportContext, opts: ExportSizeOpts, atTime: number): Promise<Blob> {
  const { width, height } = evenSize(opts.width, opts.height, opts.scale)
  const { stage } = ctx
  const prev = stage.beginExportSize(width, height)
  const prevAlpha = stage.renderer.getClearAlpha()

  let bg: DeterministicVideo | null = null
  let screen: DeterministicVideo | null = null
  try {
    if (opts.transparent) {
      stage.renderer.setClearAlpha(0)
      stage.background.enabled = false
    }
    stage.setFrame(width, height)

    if (ctx.backgroundVideoBlob && !opts.transparent) {
      bg = await DeterministicVideo.create(ctx.backgroundVideoBlob)
      if (bg) { stage.background.overrideTexture(bg.texture); stage.background.setTextureAspect(bg.aspect) }
    }
    if (ctx.screenVideoBlob) {
      screen = await DeterministicVideo.create(ctx.screenVideoBlob)
      if (screen) stage.device.overrideScreenTexture(screen.texture)
    }

    await renderFrame(ctx, atTime, bg, screen, ctx.timeline.duration > 0)

    // Captured in the same task as the render, so the drawing buffer is still
    // intact without paying for preserveDrawingBuffer all session.
    const blob = await new Promise<Blob | null>((res) =>
      stage.renderer.domElement.toBlob(res, 'image/png'),
    )
    if (!blob) throw new Error('The browser returned no image data')
    return blob
  } finally {
    stage.background.overrideTexture(null)
    stage.device.overrideScreenTexture(null)
    await bg?.dispose()
    await screen?.dispose()
    stage.renderer.setClearAlpha(prevAlpha)
    stage.background.enabled = !opts.transparent ? stage.background.enabled : true
    stage.endExportSize(prev)
    stage.setFrame(opts.width, opts.height)
  }
}

export interface VideoExportResult {
  blob: Blob
  codec: VideoCodec
  extension: string
  frames: number
  /** What the browser's encoder was actually configured with. */
  encoderConfig?: VideoEncoderConfig
}

export async function exportVideo(ctx: ExportContext, opts: VideoExportOpts): Promise<VideoExportResult> {
  const { width, height } = evenSize(opts.width, opts.height, opts.scale)
  const { stage } = ctx

  const format = opts.format === 'webm'
    ? new WebMOutputFormat()
    : new Mp4OutputFormat({ fastStart: 'in-memory' })

  // The object form matters: `new Quality(12_000_000)` is read as a QUANTIZER,
  // not a bitrate, and silently encodes at maximum quality — roughly 15x the
  // requested rate. Only `{ bitrate }` puts the encoder in bitrate mode.
  const quality = new Quality({ bitrate: opts.bitrateMbps * 1_000_000, bitrateMode: 'variable' })
  const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
    width, height, quality,
  })
  if (!codec) {
    throw new Error(
      'This browser cannot encode video at that size. Try a smaller frame, or use Chrome, Edge or Safari.',
    )
  }

  const prev = stage.beginExportSize(width, height)
  let bg: DeterministicVideo | null = null
  let screen: DeterministicVideo | null = null
  let lastEncoderConfig: VideoEncoderConfig | undefined

  try {
    stage.setFrame(width, height)
    if (ctx.backgroundVideoBlob) {
      bg = await DeterministicVideo.create(ctx.backgroundVideoBlob)
      if (bg) { stage.background.overrideTexture(bg.texture); stage.background.setTextureAspect(bg.aspect) }
    }
    if (ctx.screenVideoBlob) {
      screen = await DeterministicVideo.create(ctx.screenVideoBlob)
      if (screen) stage.device.overrideScreenTexture(screen.texture)
    }

    const output = new Output({ format, target: new BufferTarget() })
    const source = new CanvasSource(stage.renderer.domElement, {
      codec,
      // `quality` is the current field; the older `bitrate` option is silently
      // ignored, which produces a correct file at roughly 15x the asked-for size.
      quality,
      keyFrameInterval: 2,
      // 'quality' rather than 'realtime': a realtime encoder is allowed to drop
      // frames to keep up, which is the opposite of what an offline export wants.
      latencyMode: 'quality',
      onEncoderConfig: (cfg) => { lastEncoderConfig = cfg },
    })
    output.addVideoTrack(source, { frameRate: opts.fps })
    await output.start()

    const total = Math.max(1, Math.round(opts.duration * opts.fps))
    const animated = ctx.timeline.duration > 0
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      const t = i / opts.fps
      await renderFrame(ctx, t, bg, screen, animated)
      // Awaiting `add` is the backpressure mechanism; without it the encoder
      // queue grows without bound and long exports run out of memory.
      await source.add(t, 1 / opts.fps)
      opts.onProgress?.(i + 1, total)
    }

    source.close()
    await output.finalize()

    const buffer = (output.target as BufferTarget).buffer
    if (!buffer) throw new Error('Encoding produced no data')
    return {
      blob: new Blob([buffer], { type: format.mimeType }),
      codec,
      extension: format.fileExtension.replace(/^\./, ''),
      frames: total,
      encoderConfig: lastEncoderConfig,
    }
  } finally {
    stage.background.overrideTexture(null)
    stage.device.overrideScreenTexture(null)
    await bg?.dispose()
    await screen?.dispose()
    stage.endExportSize(prev)
    stage.setFrame(opts.width, opts.height)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
