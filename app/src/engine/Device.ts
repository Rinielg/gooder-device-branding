import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { padHeight, screenCrop } from './screen'
import {
  DEVICES, SCREEN_MATERIAL,
  type DeviceId, type Transform, type Variant, type VariantManifest, type ScreenState,
} from './types'

type StdMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial

/** Snapshot of a material's shipped state, so variant switches are reversible. */
interface Pristine {
  color: THREE.Color
  metalness: number
  roughness: number
  map: THREE.Texture | null
  emissiveMap: THREE.Texture | null
  normalMap: THREE.Texture | null
  roughnessMap: THREE.Texture | null
  metalnessMap: THREE.Texture | null
  aoMap: THREE.Texture | null
  emissiveIntensity: number
}

const MAP_COLORSPACE: Record<string, boolean> = {
  map: true, emissiveMap: true,
  normalMap: false, roughnessMap: false, metalnessMap: false, aoMap: false,
}

/**
 * glTF textures use a flipped V convention relative to the browser default, so
 * every texture bound to this model must be loaded with `flipY = false` or the
 * screen content comes out upside down.
 */
function loadModelTexture(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.flipY = false
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      t.anisotropy = 8
      resolve(t)
    }, undefined, reject)
  })
}

/**
 * Load an image for the display, extended downward if it falls short of the
 * display's shape.
 *
 * Fitting the width is what keeps an uploaded UI whole, and the price is that
 * an image proportionally shorter than the display runs out before the bottom.
 * Clamp-to-edge would repeat its last row of pixels down the gap: the shipped
 * wallpaper's last row runs from #000000 to #341719, so that streaks. The
 * row's mean reads as the image continuing instead.
 */
async function loadScreenTexture(url: string, screenAspect: number): Promise<THREE.Texture> {
  let img: HTMLImageElement
  try {
    img = await loadImage(url)
  } catch {
    // Unreadable here does not mean unloadable there; let the loader try.
    return loadModelTexture(url, true)
  }

  const w = img.naturalWidth
  const padded = padHeight(w, img.naturalHeight, screenAspect)
  if (!padded) return loadModelTexture(url, true)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = padded
    const ctx = canvas.getContext('2d')
    if (!ctx) return loadModelTexture(url, true)
    ctx.drawImage(img, 0, 0)
    ctx.fillStyle = meanRow(ctx, w, img.naturalHeight - 1)
    ctx.fillRect(0, img.naturalHeight, w, padded - img.naturalHeight)

    const tex = new THREE.CanvasTexture(canvas)
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.anisotropy = 8
    return tex
  } catch {
    // A cross-origin image taints the canvas and getImageData throws. The
    // unpadded texture is still better than no screen at all.
    return loadModelTexture(url, true)
  }
}

/**
 * An image, by its load event rather than by `decode()`.
 *
 * `decode()` waits until the image is ready to *paint*, which a background tab
 * is in no hurry to be — it can stay pending for as long as the document is
 * hidden, and the await never returns. `onload` fires on bytes and parsing,
 * which happens regardless. A screen that stays blank because the tab was in
 * the background is not a screen anybody would report accurately.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${url}`))
    img.src = url
  })
}

/** The mean of one row of pixels, as a CSS colour. */
function meanRow(ctx: CanvasRenderingContext2D, w: number, y: number): string {
  const d = ctx.getImageData(0, y, w, 1).data
  let r = 0, g = 0, b = 0
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
  const n = d.length / 4
  return `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`
}

export class Device {
  readonly group = new THREE.Group()
  /** Inner node carries the model; `group` carries the user transform. */
  private readonly inner = new THREE.Group()

  id: DeviceId
  private root: THREE.Object3D | null = null
  private materials = new Map<string, StdMaterial>()
  private pristine = new Map<string, Pristine>()
  private textureCache = new Map<string, THREE.Texture>()
  private screenTexture: THREE.Texture | null = null
  private screenVideo: HTMLVideoElement | null = null
  private screenUrl: string | null = null

  /** Height of the device in world units, used to place the camera. */
  heightUnits = 16.34
  /** The display's material. Unlit, so an upload renders as authored. */
  private screenMat: THREE.MeshBasicMaterial | null = null

  /** Untransformed bounds of the model, for fitting shadow frustums. */
  localBounds = new THREE.Box3(new THREE.Vector3(-4, -8, -0.7), new THREE.Vector3(4, 8, 0.7))

  constructor(id: DeviceId) {
    this.id = id
    this.group.add(this.inner)
  }

  get screenVideoElement() { return this.screenVideo }
  get screenMaterial() { return this.screenMat }

  /** Per-frame setter for the animated screen track. A single property write. */
  setScreenBrightness(brightness: number) {
    this.screenMat?.color.setScalar(brightness)
  }

  async load(id: DeviceId) {
    this.id = id
    const meta = DEVICES[id]
    const gltf = await new GLTFLoader().loadAsync(meta.url)

    if (this.root) {
      this.inner.remove(this.root)
      disposeTree(this.root)
    }
    this.materials.clear()
    this.pristine.clear()

    this.root = gltf.scene
    this.inner.add(this.root)

    // Measured with the user transform neutralised. Box3.setFromObject uses
    // world matrices, so measuring in place makes the device's "height" grow
    // with its rotation — which then feeds camera distance and the shadow fit.
    this.localBounds = measureLocal(this.root, this.group)
    this.heightUnits = this.localBounds.max.y - this.localBounds.min.y

    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

      // Shadow casting is opt-out, not blanket. three's depth material copies
      // alphaMap/alphaTest/map but never `opacity` or `transparent`, so the
      // eight blended coating meshes on these models (down to 0.10 opacity)
      // would otherwise throw fully solid shadows. The display is excluded too:
      // it is coplanar with the cover glass, adds nothing to the silhouette,
      // and coplanar casters are a classic source of shadow acne.
      const isSheer = mats.some((m) => {
        const mat = m as StdMaterial | null
        return !!mat && mat.transparent === true && mat.opacity < 0.95
      })
      const isDisplay = mats.some((m) => (m as StdMaterial | null)?.name === SCREEN_MATERIAL)
      mesh.castShadow = !isSheer && !isDisplay
      mesh.receiveShadow = true

      // Pin the side used for the depth pass. VSM uses material.side as-is
      // while PCF flips it, so without this the silhouette changes when the
      // shadow quality is switched rather than just its softness.
      for (const m of mats) {
        const mat = m as StdMaterial | null
        if (mat) mat.shadowSide = THREE.FrontSide
      }

      for (const m of mats) {
        const mat = m as StdMaterial
        if (!mat || !mat.name) continue
        if (this.materials.has(mat.name)) continue
        this.materials.set(mat.name, mat)
        this.pristine.set(mat.name, {
          color: mat.color.clone(),
          metalness: mat.metalness,
          roughness: mat.roughness,
          map: mat.map, emissiveMap: mat.emissiveMap, normalMap: mat.normalMap,
          roughnessMap: mat.roughnessMap, metalnessMap: mat.metalnessMap, aoMap: mat.aoMap,
          emissiveIntensity: mat.emissiveIntensity,
        })
      }
    })

    // The display is unlit, so an upload arrives as the thing that was
    // uploaded.
    //
    // Measured on a flat #3366cc test image: as a lit material it rendered
    // #4e7bcf. Turning off tone mapping gave #4a72d0, clearing the scene
    // environment gave #3767cc, and only silencing the lights as well gave
    // #3366cb — the source. An emissive map on a standard material cannot
    // avoid either contribution, because a dielectric reflects about 4% of
    // whatever is in front of it however rough it is. A basic material is the
    // only one that ignores both.
    //
    // The cost is honest: the display no longer catches a reflection. That is
    // the trade for a mockup showing the design rather than the studio.
    const lit = this.materials.get(SCREEN_MATERIAL)
    if (lit) {
      const basic = new THREE.MeshBasicMaterial({
        name: SCREEN_MATERIAL,
        toneMapped: false,
        side: lit.side,
      })
      this.screenMat = basic
      // Out of the map as well: a lookup by name returning a material that is
      // no longer on any mesh is a write that silently goes nowhere, which is
      // exactly how this landed as a white screen the first time.
      this.materials.delete(SCREEN_MATERIAL)
      this.root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => (m === lit ? basic : m))
        } else if (mesh.material === lit) {
          mesh.material = basic
        }
      })
    }
  }

  /**
   * Apply a colourway. Values come from `variants.json`, which is generated
   * from the variant set inside the source USDZ rather than hand-authored.
   */
  async applyVariant(manifest: VariantManifest, variantId: string) {
    const dv = manifest[this.id]
    if (!dv) return
    const variant: Variant | undefined = dv.variants[variantId]
    if (!variant) return

    // Reset everything that any variant touches, so switching is not cumulative.
    for (const name of dv.changingMaterials) {
      if (name === SCREEN_MATERIAL) continue
      const mat = this.materials.get(name)
      const p = this.pristine.get(name)
      if (!mat || !p) continue
      mat.color.copy(p.color)
      mat.metalness = p.metalness
      mat.roughness = p.roughness
      mat.emissiveIntensity = p.emissiveIntensity
    }

    const jobs: Promise<void>[] = []
    for (const [name, spec] of Object.entries(variant.materials)) {
      // The display is driven by `setScreen`; a colourway must not touch it.
      if (name === SCREEN_MATERIAL) continue
      const mat = this.materials.get(name)
      if (!mat) continue
      if (spec.color) mat.color.setRGB(spec.color[0], spec.color[1], spec.color[2], THREE.LinearSRGBColorSpace)
      if (spec.metalness !== undefined) mat.metalness = spec.metalness
      if (spec.roughness !== undefined) mat.roughness = spec.roughness
      if (spec.clearcoat !== undefined && 'clearcoat' in mat) {
        (mat as THREE.MeshPhysicalMaterial).clearcoat = spec.clearcoat
      }
      if (spec.clearcoatRoughness !== undefined && 'clearcoatRoughness' in mat) {
        (mat as THREE.MeshPhysicalMaterial).clearcoatRoughness = spec.clearcoatRoughness
      }
      if (spec.maps) {
        for (const [slot, file] of Object.entries(spec.maps)) {
          jobs.push(this.bindMap(mat, slot, file))
        }
      }
      mat.needsUpdate = true
    }
    await Promise.all(jobs)
  }

  private async bindMap(mat: StdMaterial, slot: string, file: string) {
    const url = `/textures/${file}`
    let tex = this.textureCache.get(url)
    if (!tex) {
      tex = await loadModelTexture(url, MAP_COLORSPACE[slot] ?? false)
      this.textureCache.set(url, tex)
    }
    ;(mat as unknown as Record<string, unknown>)[slot] = tex
    mat.needsUpdate = true
  }

  /** Put an image or video on the display. */
  async setScreen(state: ScreenState) {
    const mat = this.screenMat
    if (!mat) return

    if (this.screenUrl !== state.url || (state.kind === 'video') !== !!this.screenVideo) {
      this.releaseScreen()
      if (state.kind === 'video') {
        const video = document.createElement('video')
        video.src = state.url
        video.loop = true; video.muted = true; video.playsInline = true; video.preload = 'auto'
        await new Promise<void>((res, rej) => {
          video.addEventListener('loadeddata', () => res(), { once: true })
          video.addEventListener('error', () => rej(new Error('Could not load screen video')), { once: true })
        })
        const tex = new THREE.VideoTexture(video)
        tex.flipY = false
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = false
        video.play().catch(() => {})
        this.screenVideo = video
        this.screenTexture = tex
      } else {
        this.screenTexture = await loadScreenTexture(state.url, DEVICES[this.id].screenAspect)
      }
      this.screenUrl = state.url
    }

    const tex = this.screenTexture
    if (!tex) return

    // Fitted by aspect rather than by texture dimensions, so an upload is
    // never squashed to the display's shape.
    const w = (tex.image as { width?: number; videoWidth?: number }).width
      ?? (tex.image as { videoWidth?: number }).videoWidth ?? 1
    const h = (tex.image as { height?: number; videoHeight?: number }).height
      ?? (tex.image as { videoHeight?: number }).videoHeight ?? 1
    const texAspect = w / h
    const target = DEVICES[this.id].screenAspect

    const { repeat, offset } = screenCrop(texAspect, target, state.zoom, state.offsetX, state.offsetY)
    tex.repeat.set(repeat[0], repeat[1])
    tex.offset.set(offset[0], offset[1])
    tex.needsUpdate = true

    mat.map = tex
    // White is the image untouched; brightness scales it either way.
    mat.color.setScalar(state.brightness)
    mat.needsUpdate = true
  }

  /**
   * Swap in a frame-accurate screen texture during export, carrying over the
   * crop that `setScreen` computed so the framing does not shift.
   */
  overrideScreenTexture(tex: THREE.Texture | null) {
    const mat = this.screenMat
    if (!mat) return
    const target = tex ?? this.screenTexture
    if (tex && this.screenTexture) {
      tex.flipY = false
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.repeat.copy(this.screenTexture.repeat)
      tex.offset.copy(this.screenTexture.offset)
      tex.needsUpdate = true
    }
    mat.map = target
    mat.needsUpdate = true
  }

  private releaseScreen() {
    if (this.screenVideo) { this.screenVideo.pause(); this.screenVideo.src = ''; this.screenVideo = null }
    if (this.screenTexture) { this.screenTexture.dispose(); this.screenTexture = null }
    this.screenUrl = null
  }

  applyTransform(t: Transform) {
    const g = this.group
    g.position.set(t.posX, t.posY, t.posZ)
    g.rotation.set(
      THREE.MathUtils.degToRad(t.rotX),
      THREE.MathUtils.degToRad(t.rotY),
      THREE.MathUtils.degToRad(t.rotZ),
      'YXZ',
    )
    g.scale.setScalar(t.scale)
  }

  dispose() {
    this.releaseScreen()
    for (const t of this.textureCache.values()) t.dispose()
    this.textureCache.clear()
    if (this.root) disposeTree(this.root)
  }
}

/**
 * Bounding box of `root` with `carrier`'s transform temporarily reset, so the
 * result describes the model rather than its current pose.
 */
function measureLocal(root: THREE.Object3D, carrier: THREE.Object3D): THREE.Box3 {
  const position = carrier.position.clone()
  const quaternion = carrier.quaternion.clone()
  const scale = carrier.scale.clone()
  carrier.position.set(0, 0, 0)
  carrier.quaternion.identity()
  carrier.scale.set(1, 1, 1)
  carrier.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  carrier.position.copy(position)
  carrier.quaternion.copy(quaternion)
  carrier.scale.copy(scale)
  carrier.updateMatrixWorld(true)
  return box
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) m?.dispose()
  })
}
