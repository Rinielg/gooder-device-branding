import * as THREE from 'three'
import { Background } from './Background'
import { Device } from './Device'
import { ShadowRig } from './ShadowRig'
import { LightingController } from './Lighting'
import {
  DEFAULT_LIGHTING, DEFAULT_STAGE,
  type BackgroundState, type DeviceId, type LightingState, type StageState, type Transform,
} from './types'

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly background = new Background()
  readonly device: Device

  private readonly shadowRig = new ShadowRig()
  readonly lighting: LightingController
  /** Last applied settings, so anything derived can be recomputed. */
  private stageState: StageState = DEFAULT_STAGE
  private lightingState: LightingState = DEFAULT_LIGHTING

  /** Frame aspect currently being composed for. */
  frameAspect = 1

  constructor(canvas: HTMLCanvasElement, deviceId: DeviceId) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      // Left false deliberately: capture happens in the same task as render(),
      // which is cheaper than forcing the driver to keep a second copy of every
      // frame for the whole session.
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.autoClear = false
    this.renderer.setClearColor(0x000000, 0)

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 2000)
    this.camera.position.set(0, 0, 50)

    this.device = new Device(deviceId)
    this.scene.add(this.device.group)

    this.scene.add(this.shadowRig.catcher)

    this.lighting = new LightingController(this.renderer, this.scene)
    this.renderer.shadowMap.autoUpdate = false
  }

  async loadDevice(id: DeviceId) {
    await this.device.load(id)
    // Camera distance is a multiple of the device height, and the two models
    // differ by 13mm, so the stage has to be re-applied or the framing keeps
    // the previous device's distance.
    this.applyStage(this.stageState)
  }

  setFrame(width: number, height: number) {
    this.frameAspect = width / height
    this.camera.aspect = this.frameAspect
    this.camera.updateProjectionMatrix()
    this.background.setFrameAspect(this.frameAspect)
    this.relayout()
  }

  applyStage(s: StageState) {
    this.stageState = s
    this.camera.fov = s.fov
    this.camera.position.set(0, 0, s.distance * this.device.heightUnits)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.relayout()
  }

  applyTransform(t: Transform) {
    this.device.applyTransform(t)
    this.relayout()
  }

  /**
   * Recompute everything derived from the device transform, the camera and the
   * frame. Called from applyStage, applyTransform, setFrame and loadDevice —
   * export drives applyTransform per frame but never applyStage, so anything
   * that lives only in applyStage goes stale during an animated export.
   */
  /** Apply the lighting rig. Async because an HDRI has to be fetched. */
  async applyLighting(l: LightingState) {
    this.lightingState = l
    await this.lighting.apply(l, this.device.heightUnits)
    this.relayout()
  }

  private relayout() {
    const { shadows, ground } = this.lightingState
    this.shadowRig.update(
      this.device.group,
      this.device.localBounds,
      this.device.heightUnits,
      ground.mode === 'none' || !shadows.enabled ? null : this.lighting.shadowCaster,
      {
        mode: ground.mode === 'floor' ? 'floor' : 'backdrop',
        opacity: shadows.opacity,
        // VSM's blur is measured in shadow-map TEXELS, not world units, and the
        // frustum is fitted tightly (~0.012 units per texel at 2048), so the
        // 0-2 UI range has to open out a long way before it reads as softness.
        // Single digits are indistinguishable from a hard shadow here.
        radius: shadows.quality === 'soft' ? 4 + shadows.softness * 16 : 0,
        distance: shadows.distance,
        normalBias: shadows.normalBias,
      },
    )
    this.renderer.shadowMap.needsUpdate = true
  }

  async applyBackground(b: BackgroundState) {
    await this.background.apply(b)
  }

  /**
   * Render one frame. `time` drives the procedural background so that a still
   * exported at t and a video frame at t are byte-identical.
   */
  render(time: number) {
    this.background.setTime(time)
    const r = this.renderer
    r.clear(true, true, true)
    if (this.background.enabled) {
      r.render(this.background.scene, this.background.camera)
      r.clearDepth()
    }
    r.render(this.scene, this.camera)
  }

  /**
   * Wait for any background media that rasterises asynchronously, then render.
   * Export goes through this so a frame is never captured half-updated.
   */
  async renderPrepared(time: number) {
    await this.background.prepare(time)
    this.render(time)
  }

  /** Suppresses the shadow catcher for as long as it is set. */
  get shadowSuppressed() { return this.shadowRig.suppressed }
  set shadowSuppressed(v: boolean) {
    this.shadowRig.suppressed = v
    this.relayout()
  }

  /** Size the drawing buffer for on-screen preview. */
  setViewportSize(cssWidth: number, cssHeight: number, dpr: number) {
    this.renderer.setPixelRatio(Math.min(dpr, 2))
    this.renderer.setSize(cssWidth, cssHeight, false)
  }

  /**
   * Size the drawing buffer for export. Chrome silently clamps the canvas
   * backing store to roughly 33 megapixels while `getDrawingBufferSize()` keeps
   * reporting what you asked for, so the real GL dimensions are checked here.
   */
  beginExportSize(width: number, height: number) {
    const prev = {
      pixelRatio: this.renderer.getPixelRatio(),
      size: this.renderer.getSize(new THREE.Vector2()),
    }
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)
    const gl = this.renderer.getContext()
    if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) {
      this.renderer.setPixelRatio(prev.pixelRatio)
      this.renderer.setSize(prev.size.x, prev.size.y, false)
      throw new Error(
        `The browser clamped the canvas to ${gl.drawingBufferWidth}x${gl.drawingBufferHeight} ` +
        `(asked for ${width}x${height}, ${(width * height / 1e6).toFixed(1)} megapixels). ` +
        `Export at a smaller size.`,
      )
    }
    return prev
  }

  endExportSize(prev: { pixelRatio: number; size: THREE.Vector2 }) {
    this.renderer.setPixelRatio(prev.pixelRatio)
    this.renderer.setSize(prev.size.x, prev.size.y, false)
  }

  dispose() {
    this.background.dispose()
    this.device.dispose()
    this.shadowRig.dispose()
    this.lighting.dispose()
    this.renderer.dispose()
  }
}
