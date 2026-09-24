import * as THREE from 'three'

export interface ShadowRigOptions {
  /** 'backdrop' stands the catcher behind the device, 'floor' lays it beneath. */
  mode: 'backdrop' | 'floor'
  /** Darkness of the cast shadow, 0–1. */
  opacity: number
  /** Blur radius, in shadow-map texels. Only VSM honours this. */
  radius: number
  /** Gap between the device and the catcher, in device heights. */
  distance: number
  /** World-unit depth offset, scaled by the caller to the device size. */
  normalBias: number
}

const CORNER_SIGNS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
]

/**
 * A backdrop that catches a real cast shadow.
 *
 * `ShadowMaterial` is transparent except where shadowed, so this darkens
 * whatever the background pass already drew without being visible itself.
 *
 * The hard part is not the plane, it is the light's frustum. Outside a
 * directional light's orthographic shadow camera the shadow mask is exactly
 * 1.0 with no falloff at all, so an under-sized frustum produces a
 * razor-straight cut — worse than the soft band it replaces. `update` therefore
 * fits the frustum to the device's bounds *and* to where those bounds project
 * onto the backdrop, which is the region the shadow can actually occupy.
 */
export class ShadowRig {
  readonly catcher: THREE.Mesh
  private readonly material: THREE.ShadowMaterial
  private readonly box = new THREE.Box3()
  private readonly points: THREE.Vector3[] = []
  private readonly lightView = new THREE.Matrix4()
  private readonly lightDir = new THREE.Vector3()
  private readonly centre = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()

  /**
   * Hides the catcher regardless of settings. `update` runs on every frame
   * including during export, so suppression has to be state the rig owns
   * rather than a direct poke at `visible`.
   */
  suppressed = false

  constructor() {
    this.material = new THREE.ShadowMaterial({
      opacity: 0.35,
      transparent: true,
      // ShadowMaterial does not override the `true` default. A frustum-spanning
      // depth write at renderOrder -1 would occlude the device's blended meshes.
      depthWrite: false,
    })
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.catcher.receiveShadow = true
    this.catcher.castShadow = false
    this.catcher.renderOrder = -1
    this.catcher.name = '__shadowCatcher'
    for (let i = 0; i < 16; i++) this.points.push(new THREE.Vector3())
  }

  setVisible(v: boolean) { this.catcher.visible = v }

  /**
   * Reposition the backdrop and refit the light's shadow camera.
   *
   * @param localBounds untransformed model bounds — using world bounds here
   *        would make every result depend on the current rotation.
   */
  update(
    group: THREE.Object3D,
    localBounds: THREE.Box3,
    heightUnits: number,
    light: THREE.DirectionalLight | null,
    opts: ShadowRigOptions,
  ) {
    this.material.opacity = opts.opacity
    this.catcher.visible = !this.suppressed && opts.opacity > 0.001 && !!light
    if (!light) return

    group.updateMatrixWorld(true)
    this.box.copy(localBounds).applyMatrix4(group.matrixWorld)
    this.box.getCenter(this.centre)

    const scale = group.scale.x
    const gap = Math.max(heightUnits * opts.distance * scale, heightUnits * 0.05)
    const floor = opts.mode === 'floor'
    // The catcher is a plane on one axis; everything below is written against
    // that axis so backdrop and floor share one fit.
    const axis: 'y' | 'z' = floor ? 'y' : 'z'
    const planePos = floor ? this.box.min.y - gap : this.box.min.z - gap

    // The light aims at the device, so the shadow lands behind it.
    light.target.position.copy(this.centre)
    light.target.updateMatrixWorld()
    this.lightDir.copy(this.centre).sub(light.position).normalize()

    // 8 corners of the posed device, plus where each projects onto the backdrop.
    const { min, max } = this.box
    for (let i = 0; i < 8; i++) {
      const [sx, sy, sz] = CORNER_SIGNS[i]
      const p = this.points[i].set(
        sx ? max.x : min.x,
        sy ? max.y : min.y,
        sz ? max.z : min.z,
      )
      const q = this.points[i + 8].copy(p)
      // Guard a light that grazes the catcher: the projection diverges as the
      // direction approaches parallel, so fall back to a straight drop.
      const along = this.lightDir[axis]
      if (Math.abs(along) > 0.05) {
        const t = (planePos - p[axis]) / along
        if (t > 0 && t < heightUnits * 40) {
          q.copy(this.scratch.copy(this.lightDir).multiplyScalar(t).add(p))
        } else {
          q.copy(p); q[axis] = planePos
        }
      } else {
        q.copy(p); q[axis] = planePos
      }
    }

    // Size the backdrop to the region the shadow can reach, not to the frame:
    // a plane spanning the whole view would spread any shadow-map bleed across
    // the entire image, which is very visible on a transparent export.
    // The plane's local X/Y map to different world axes in the two modes.
    const uAxis = 'x' as const
    const vAxis: 'y' | 'z' = floor ? 'z' : 'y'
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (let i = 8; i < 16; i++) {
      const q = this.points[i]
      u0 = Math.min(u0, q[uAxis]); u1 = Math.max(u1, q[uAxis])
      v0 = Math.min(v0, q[vAxis]); v1 = Math.max(v1, q[vAxis])
    }
    // Sized to where the shadow can actually land, not to the whole frame: a
    // frame-spanning plane would smear any shadow-map bleed across the entire
    // image, which is very visible on a transparent export.
    const margin = heightUnits * (0.12 + opts.radius * 0.006) * scale
    const uSize = u1 - u0 + margin * 2
    const vSize = v1 - v0 + margin * 2
    const uMid = (u0 + u1) / 2
    const vMid = (v0 + v1) / 2
    if (floor) {
      this.catcher.rotation.set(-Math.PI / 2, 0, 0)
      this.catcher.position.set(uMid, planePos, vMid)
    } else {
      this.catcher.rotation.set(0, 0, 0)
      this.catcher.position.set(uMid, vMid, planePos)
    }
    this.catcher.scale.set(uSize, vSize, 1)

    // Fit the frustum to the catcher itself, not just to the projected
    // footprint. Anything on the catcher outside the frustum reads as fully
    // unshadowed with no falloff, so the frustum must be the outer bound.
    const cu0 = uMid - uSize / 2, cu1 = uMid + uSize / 2
    const cv0 = vMid - vSize / 2, cv1 = vMid + vSize / 2
    for (let i = 0; i < 8; i++) {
      const q = this.points[8 + i]
      const u = (i % 2) ? cu1 : cu0
      const v = (i >> 1) % 2 ? cv1 : cv0
      if (floor) q.set(u, planePos, v)
      else q.set(u, v, planePos)
    }

    this.fitFrustum(light, opts, heightUnits * scale)
  }

  /** Fit the orthographic shadow camera to every point the shadow can touch. */
  private fitFrustum(light: THREE.DirectionalLight, opts: ShadowRigOptions, span: number) {
    // Let three build the shadow camera's matrices. Reconstructing the light's
    // view by hand gives bounds that do not match the frustum actually used,
    // which puts the fitted box in the wrong place.
    light.updateMatrixWorld(true)
    light.shadow.updateMatrices(light)
    this.lightView.copy(light.shadow.camera.matrixWorldInverse)

    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of this.points) {
      this.scratch.copy(p).applyMatrix4(this.lightView)
      x0 = Math.min(x0, this.scratch.x); x1 = Math.max(x1, this.scratch.x)
      y0 = Math.min(y0, this.scratch.y); y1 = Math.max(y1, this.scratch.y)
      // Light space looks down -z, so depth grows as z decreases.
      z0 = Math.min(z0, -this.scratch.z); z1 = Math.max(z1, -this.scratch.z)
    }

    // Pad by the blur radius so a softened edge cannot reach the frustum wall,
    // where the mask snaps to unshadowed with no falloff.
    const pad = span * 0.12 + opts.radius * span * 0.02
    const cam = light.shadow.camera
    cam.left = x0 - pad; cam.right = x1 + pad
    cam.bottom = y0 - pad; cam.top = y1 + pad
    cam.near = Math.max(0.01, z0 - pad)
    cam.far = z1 + pad
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)
    light.shadow.updateMatrices(light)

    // normalBias is in world units, so it has to track the device's scale.
    light.shadow.radius = opts.radius
    // normalBias is applied in world units, so it has to follow the device's
    // size and scale rather than being a constant.
    light.shadow.normalBias = span * opts.normalBias
    light.shadow.bias = 0
  }

  dispose() {
    this.material.dispose()
    this.catcher.geometry.dispose()
  }
}
