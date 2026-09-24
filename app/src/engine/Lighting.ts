import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { LIGHT_IDS, type LightId, type LightSettings, type LightingState, type ToneMappingName } from './types'

const TONE_MAPPING: Record<ToneMappingName, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  cineon: THREE.CineonToneMapping,
  linear: THREE.LinearToneMapping,
  none: THREE.NoToneMapping,
}

type AnyLight = THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight

/**
 * Owns the scene-level environment and the light rig, in the shape Spline
 * splits them: an environment that supplies image-based lighting and
 * reflections, plus individually addressable light objects.
 *
 * The shadow *geometry* lives in ShadowRig; this class only configures the
 * lights and the renderer state those shadows depend on.
 */
export class LightingController {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly pmrem: THREE.PMREMGenerator

  readonly ambient = new THREE.AmbientLight(0xffffff, 0)
  private readonly lights = new Map<LightId, AnyLight>()
  private readonly helpers = new Map<LightId, THREE.Object3D>()
  /** Which light each helper was built for, so it is only rebuilt on a type change. */
  private readonly helperFor = new Map<LightId, AnyLight>()

  private envRT: THREE.WebGLRenderTarget | null = null
  private envSourceTexture: THREE.Texture | null = null
  private envSignature = ''
  private helpersVisible = false

  /** The equirectangular environment texture, when one should be shown. */
  environmentTexture: THREE.Texture | null = null

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer
    this.scene = scene
    this.pmrem = new THREE.PMREMGenerator(renderer)
    scene.add(this.ambient)
  }

  /** The light currently designated as the shadow caster, if any. */
  get shadowCaster(): THREE.DirectionalLight | null {
    for (const id of LIGHT_IDS) {
      const l = this.lights.get(id)
      if (l && l.castShadow && l.visible && (l as THREE.DirectionalLight).isDirectionalLight) {
        return l as THREE.DirectionalLight
      }
    }
    return null
  }

  getLight(id: LightId) { return this.lights.get(id) ?? null }

  async apply(state: LightingState, heightUnits: number) {
    await this.applyEnvironment(state)
    this.applyLights(state, heightUnits)
    this.applyRenderer(state)
  }

  private applyRenderer(state: LightingState) {
    const { environment, shadows } = state
    this.renderer.toneMapping = TONE_MAPPING[environment.toneMapping]
    this.renderer.toneMappingExposure = environment.exposure
    this.renderer.shadowMap.enabled = shadows.enabled
    // Only VSM honours shadow.radius in r186 — PCFSoftShadowMap is deprecated
    // and silently downgraded to plain PCF, which has no adjustable softness.
    const type = shadows.quality === 'soft' ? THREE.VSMShadowMap : THREE.PCFShadowMap
    if (this.renderer.shadowMap.type !== type) {
      this.renderer.shadowMap.type = type
      // Changing the type recompiles every material in the scene.
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!m) return
        for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true
      })
    }
    this.renderer.shadowMap.needsUpdate = true
  }

  private applyLights(state: LightingState, heightUnits: number) {
    for (const id of LIGHT_IDS) {
      const s = state.lights[id]
      let light = this.lights.get(id)

      if (!light || !matchesType(light, s.type)) {
        if (light) this.removeLight(id, light)
        light = createLight(s.type)
        light.name = `light:${id}`
        this.lights.set(id, light)
        this.scene.add(light)
        if ('target' in light) this.scene.add((light as THREE.DirectionalLight).target)
      }

      light.visible = s.enabled
      light.color.set(s.color)
      light.intensity = s.intensity
      // Positions are stored in device heights so the rig holds its shape
      // across the two models and any device scale.
      light.position.set(
        s.position[0] * heightUnits,
        s.position[1] * heightUnits,
        s.position[2] * heightUnits,
      )
      light.castShadow = s.enabled && s.castShadow && state.shadows.enabled

      if (isPointOrSpot(light)) {
        light.distance = s.distance * heightUnits
        light.decay = s.decay
      }
      if ((light as THREE.SpotLight).isSpotLight) {
        const spot = light as THREE.SpotLight
        spot.angle = THREE.MathUtils.degToRad(s.angle)
        spot.penumbra = s.penumbra
      }

      const shadow = light.shadow
      if (shadow) {
        if (shadow.mapSize.x !== state.shadows.mapSize) {
          shadow.mapSize.set(state.shadows.mapSize, state.shadows.mapSize)
          // Directional and spot maps auto-resize in r186, but a point light's
          // cube target does not and has to be dropped for reallocation.
          if ((light as THREE.PointLight).isPointLight && shadow.map) {
            shadow.dispose()
            shadow.map = null
          }
        }
        shadow.blurSamples = 16
      }

      this.syncHelper(id, light)
    }

    this.ambient.color.set(state.environment.ambientColor)
    this.ambient.intensity = state.environment.ambientIntensity
  }

  private async applyEnvironment(state: LightingState) {
    const e = state.environment
    // Rebuilding a PMREM is a GPU stall, so only do it when the inputs move.
    const signature = [e.mode, e.hdriUrl ?? '', e.sunElevation, e.sunAzimuth].join('|')
    if (signature !== this.envSignature) {
      this.envSignature = signature
      this.disposeEnvironment()

      if (e.mode === 'studio') {
        const room = new RoomEnvironment()
        this.envRT = this.pmrem.fromScene(room, 0.04)
        room.dispose()
        this.environmentTexture = this.envRT.texture
      } else if (e.mode === 'hdri' && e.hdriUrl) {
        const hdr = await new HDRLoader().loadAsync(e.hdriUrl)
        hdr.mapping = THREE.EquirectangularReflectionMapping
        this.envRT = this.pmrem.fromEquirectangular(hdr)
        // Kept alive: this is what a background pass samples for a sharp sky.
        this.envSourceTexture = hdr
        this.environmentTexture = hdr
      } else if (e.mode === 'sky') {
        const sky = new Sky()
        // fromScene defaults to far = 100 while the Sky example scales its box
        // to 10000, which bakes a black environment.
        sky.scale.setScalar(20)
        const sun = new THREE.Vector3().setFromSphericalCoords(
          1,
          THREE.MathUtils.degToRad(90 - e.sunElevation),
          THREE.MathUtils.degToRad(e.sunAzimuth),
        )
        sky.material.uniforms.sunPosition.value.copy(sun)
        const skyScene = new THREE.Scene()
        skyScene.add(sky)
        this.envRT = this.pmrem.fromScene(skyScene, 0, 0.1, 1000)
        sky.geometry.dispose()
        sky.material.dispose()
        this.environmentTexture = this.envRT.texture
      } else {
        this.environmentTexture = null
      }

      this.scene.environment = this.envRT ? this.envRT.texture : null
    }

    this.scene.environmentIntensity = e.intensity
    this.scene.environmentRotation.set(0, THREE.MathUtils.degToRad(e.rotationY), 0)
    // scene.background is deliberately never used: a Color there sets
    // forceClear, which bypasses autoClear and wipes the background pass.
    this.scene.background = null
  }

  setHelpersVisible(visible: boolean) {
    this.helpersVisible = visible
    for (const h of this.helpers.values()) h.visible = visible
  }

  /**
   * Rebuild a light's gizmo only when the light it describes is a different
   * object — which is to say, when its type changed.
   *
   * It used to dispose and recreate on every call. That was invisible while
   * lighting only moved on user input, but lighting is now sampled per frame,
   * and allocating three helpers sixty times a second is not.
   */
  private syncHelper(id: LightId, light: AnyLight) {
    const existing = this.helpers.get(id)
    if (existing && this.helperFor.get(id) === light) {
      ;(existing as THREE.DirectionalLightHelper).update?.()
      return
    }
    if (existing) {
      this.scene.remove(existing)
      disposeHelper(existing)
      this.helpers.delete(id)
      this.helperFor.delete(id)
    }
    const helper = makeHelper(light)
    if (!helper) return
    helper.visible = this.helpersVisible
    this.helpers.set(id, helper)
    this.helperFor.set(id, light)
    this.scene.add(helper)
  }

  /* ---------------- per-frame setters ----------------
   * Plain property writes, safe to call every frame. Nothing here rebuilds a
   * PMREM, reallocates a shadow map or touches a helper.
   */

  setLightSample(id: LightId, intensity: number, x: number, y: number, z: number, heightUnits: number) {
    const light = this.lights.get(id)
    if (!light) return
    light.intensity = intensity
    light.position.set(x * heightUnits, y * heightUnits, z * heightUnits)
  }

  setEnvironmentSample(intensity: number, rotationY: number, exposure: number) {
    this.scene.environmentIntensity = intensity
    this.scene.environmentRotation.set(0, THREE.MathUtils.degToRad(rotationY), 0)
    this.renderer.toneMappingExposure = exposure
  }

  /** Gizmos track the lights they describe, which the sampler may have moved. */
  refreshHelpers() {
    if (!this.helpersVisible) return
    for (const h of this.helpers.values()) (h as THREE.DirectionalLightHelper).update?.()
  }

  private removeLight(id: LightId, light: AnyLight) {
    this.scene.remove(light)
    if ('target' in light) this.scene.remove((light as THREE.DirectionalLight).target)
    light.shadow?.dispose()
    light.dispose?.()
    this.lights.delete(id)
    const helper = this.helpers.get(id)
    if (helper) { this.scene.remove(helper); disposeHelper(helper); this.helpers.delete(id) }
  }

  private disposeEnvironment() {
    this.envRT?.dispose()
    this.envRT = null
    // Disposing the source texture is what releases the renderer's cached
    // cube and PMREM copies, via its dispose listener.
    this.envSourceTexture?.dispose()
    this.envSourceTexture = null
    this.environmentTexture = null
  }

  dispose() {
    this.disposeEnvironment()
    this.pmrem.dispose()
    for (const [id, light] of [...this.lights]) this.removeLight(id, light)
  }
}

function createLight(type: LightSettings['type']): AnyLight {
  if (type === 'point') return new THREE.PointLight()
  if (type === 'spot') return new THREE.SpotLight()
  return new THREE.DirectionalLight()
}

function matchesType(light: AnyLight, type: LightSettings['type']) {
  if (type === 'point') return (light as THREE.PointLight).isPointLight === true
  if (type === 'spot') return (light as THREE.SpotLight).isSpotLight === true
  return (light as THREE.DirectionalLight).isDirectionalLight === true
}

function isPointOrSpot(light: AnyLight): light is THREE.PointLight | THREE.SpotLight {
  return (light as THREE.PointLight).isPointLight === true
    || (light as THREE.SpotLight).isSpotLight === true
}

function makeHelper(light: AnyLight): THREE.Object3D | null {
  if ((light as THREE.DirectionalLight).isDirectionalLight) {
    return new THREE.DirectionalLightHelper(light as THREE.DirectionalLight, 2)
  }
  if ((light as THREE.PointLight).isPointLight) {
    return new THREE.PointLightHelper(light as THREE.PointLight, 1)
  }
  if ((light as THREE.SpotLight).isSpotLight) {
    return new THREE.SpotLightHelper(light as THREE.SpotLight)
  }
  return null
}

function disposeHelper(helper: THREE.Object3D) {
  ;(helper as unknown as { dispose?: () => void }).dispose?.()
}
