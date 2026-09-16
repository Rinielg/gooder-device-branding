import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Background } from './Background'
import { Device } from './Device'
import type { BackgroundState, DeviceId, StageState, Transform } from './types'

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SHADOW_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uOpacity;
uniform float uSoftness;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d * vec2(1.0, 0.62));
  float a = 1.0 - smoothstep(0.0, mix(0.7, 1.35, uSoftness), r);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uOpacity);
}
`

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly background = new Background()
  readonly device: Device

  private shadow: THREE.Mesh
  private shadowMat: THREE.ShaderMaterial
  private key: THREE.DirectionalLight
  private envRT: THREE.WebGLRenderTarget | null = null

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

    this.shadowMat = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VERT,
      fragmentShader: SHADOW_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uOpacity: { value: 0.35 }, uSoftness: { value: 1 } },
    })
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat)
    this.shadow.renderOrder = -1
    this.scene.add(this.shadow)

    this.key = new THREE.DirectionalLight(0xffffff, 1.6)
    this.key.position.set(-18, 26, 30)
    this.scene.add(this.key)
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.35)
    fill.position.set(24, -10, 14)
    this.scene.add(fill)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envRT.texture
    this.scene.background = null
    pmrem.dispose()
  }

  async loadDevice(id: DeviceId) {
    await this.device.load(id)
    this.layoutShadow()
  }

  setFrame(width: number, height: number) {
    this.frameAspect = width / height
    this.camera.aspect = this.frameAspect
    this.camera.updateProjectionMatrix()
    this.background.setFrameAspect(this.frameAspect)
  }

  applyStage(s: StageState) {
    this.camera.fov = s.fov
    this.camera.position.set(0, 0, s.distance * this.device.heightUnits)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.scene.environmentIntensity = s.envIntensity
    this.scene.environmentRotation = new THREE.Euler(0, THREE.MathUtils.degToRad(s.envRotation), 0)
    this.key.intensity = s.keyIntensity
    this.shadowMat.uniforms.uOpacity.value = s.shadow
    this.shadowMat.uniforms.uSoftness.value = s.shadowBlur
    this.shadow.visible = s.shadow > 0.001
  }

  applyTransform(t: Transform) {
    this.device.applyTransform(t)
    this.layoutShadow(t)
  }

  private layoutShadow(t?: Transform) {
    const h = this.device.heightUnits
    const s = t?.scale ?? this.device.group.scale.x
    this.shadow.scale.set(h * 0.95 * s, h * 0.95 * s, 1)
    this.shadow.position.set(
      (t?.posX ?? this.device.group.position.x) + h * 0.035 * s,
      (t?.posY ?? this.device.group.position.y) - h * 0.06 * s,
      (t?.posZ ?? this.device.group.position.z) - h * 0.35,
    )
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
    this.shadowMat.dispose()
    this.shadow.geometry.dispose()
    this.envRT?.dispose()
    this.renderer.dispose()
  }
}
