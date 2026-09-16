import * as THREE from 'three'
import { LottieLayer } from './LottieLayer'
import type { BackgroundState } from './types'

/**
 * The background is drawn as a full-screen pass INSIDE the WebGL canvas rather
 * than as a DOM layer behind it. That is deliberate: a CSS gradient or an
 * <img>/<video> sitting behind the canvas cannot be read back by
 * `canvas.toBlob()` or captured by a WebCodecs `VideoFrame`, so an export would
 * silently lose it. Keeping every layer in the same drawing buffer means what
 * you see is exactly what is encoded.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform int   uMode;          // 1 = solid, 2 = gradient, 3 = texture
uniform vec3  uColor;
uniform vec3  uColors[4];
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uWarp;
uniform float uGrain;
uniform float uVignette;
uniform float uFrameAspect;   // width / height of the frame

uniform sampler2D uTex;
uniform float uTexAspect;     // width / height of the source media
uniform int   uFit;           // 0 = cover, 1 = contain
uniform float uZoom;
uniform vec2  uOffset;

/* --- Ashima simplex noise (2D) ------------------------------------- */
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* A domain-warped 4-colour mesh gradient. */
vec3 meshGradient(vec2 uv) {
  vec2 p = (uv - 0.5) * uScale * 2.0;
  p.x *= uFrameAspect;
  float t = uTime * uSpeed;

  vec2 q = vec2(snoise(p + vec2(0.0, t)),
                snoise(p + vec2(5.2, 1.3) - t * 0.7));
  vec2 r = vec2(snoise(p + uWarp * q + vec2(1.7, 9.2) + t * 0.5),
                snoise(p + uWarp * q + vec2(8.3, 2.8) - t * 0.4));

  float f1 = snoise(p + uWarp * r) * 0.5 + 0.5;
  float f2 = snoise(p * 0.7 + uWarp * r.yx + 3.7) * 0.5 + 0.5;

  f1 = smoothstep(0.08, 0.92, f1);
  f2 = smoothstep(0.08, 0.92, f2);

  vec3 a = mix(uColors[0], uColors[1], f1);
  vec3 b = mix(uColors[2], uColors[3], f1);
  return mix(a, b, f2);
}

/* Map frame UV -> texture UV with cover/contain fitting. */
vec2 fitUv(vec2 uv) {
  vec2 c = uv - 0.5;
  float fa = uFrameAspect;
  float ta = uTexAspect;
  float s = (uFit == 0)
    ? ((fa > ta) ? 1.0 : ta / fa)      // cover
    : ((fa > ta) ? ta / fa : 1.0);     // contain
  // scale the frame into the texture's space on the constrained axis
  if (uFit == 0) {
    if (fa > ta) { c.y *= (fa / ta); } else { c.x *= (ta / fa); }
  } else {
    if (fa > ta) { c.x *= (fa / ta); } else { c.y *= (ta / fa); }
  }
  c /= max(uZoom, 0.001);
  c -= uOffset;
  return c + 0.5;
}

void main() {
  vec3 col;
  float alpha = 1.0;

  if (uMode == 1) {
    col = uColor;
  } else if (uMode == 2) {
    col = meshGradient(vUv);
  } else {
    vec2 uv = fitUv(vUv);
    if (uFit == 1 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) {
      col = uColor;                      // letterbox fill
    } else {
      vec4 t = texture2D(uTex, clamp(uv, 0.0, 1.0));
      col = mix(uColor, t.rgb, t.a);
    }
  }

  if (uGrain > 0.0) {
    float g = hash12(vUv * 2048.0 + fract(uTime) * 91.7) - 0.5;
    col += g * uGrain;
  }

  if (uVignette > 0.0) {
    vec2 d = (vUv - 0.5) * vec2(max(uFrameAspect, 1.0), max(1.0 / uFrameAspect, 1.0));
    float v = smoothstep(0.85, 0.15, length(d));
    col *= mix(1.0, v, uVignette);
  }

  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`

export class Background {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: THREE.ShaderMaterial
  private readonly mesh: THREE.Mesh

  /** Currently bound media, if any. */
  private texture: THREE.Texture | null = null
  private video: HTMLVideoElement | null = null
  private videoUrl: string | null = null
  private imageUrl: string | null = null
  private meshGradient: LottieLayer | null = null
  private meshUrl: string | null = null

  /** Length of the current background animation in seconds, 0 when it is static. */
  mediaDuration = 0

  /** True when the current mode draws nothing (transparent background). */
  enabled = true

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uMode: { value: 2 },
        uColor: { value: new THREE.Color('#101014') },
        uColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
        uTime: { value: 0 },
        uSpeed: { value: 0.25 },
        uScale: { value: 1.1 },
        uWarp: { value: 0.55 },
        uGrain: { value: 0.035 },
        uVignette: { value: 0.25 },
        uFrameAspect: { value: 1 },
        uTex: { value: null },
        uTexAspect: { value: 1 },
        uFit: { value: 0 },
        uZoom: { value: 1 },
        uOffset: { value: new THREE.Vector2(0, 0) },
      },
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  setFrameAspect(a: number) {
    this.material.uniforms.uFrameAspect.value = a
  }

  /** Animation clock, in seconds. Driven explicitly so exports are deterministic. */
  setTime(t: number) {
    this.material.uniforms.uTime.value = t
    this.meshGradient?.seek(t)
  }

  /**
   * Same as `setTime`, but waits for any asynchronously rasterised media to be
   * ready. Export uses this; the live preview does not need to wait.
   */
  async prepare(t: number): Promise<void> {
    this.material.uniforms.uTime.value = t
    await this.meshGradient?.prepare(t)
  }

  async apply(state: BackgroundState) {
    const u = this.material.uniforms
    this.enabled = state.kind !== 'transparent'

    u.uColor.value.set(state.color)
    u.uVignette.value = state.vignette
    u.uZoom.value = state.zoom
    u.uOffset.value.set(state.offsetX, state.offsetY)
    u.uFit.value = state.fit === 'cover' ? 0 : 1

    if (state.kind === 'mesh') {
      if (this.meshUrl !== state.meshUrl) {
        this.releaseMedia()
        const layer = await LottieLayer.create(state.meshUrl)
        this.meshGradient = layer
        this.meshUrl = state.meshUrl
        this.mediaDuration = layer.duration
        u.uTexAspect.value = layer.aspect
      }
      u.uMode.value = 3
      u.uGrain.value = 0
      u.uTex.value = this.meshGradient!.texture
      return
    }

    if (state.kind === 'gradient') {
      u.uMode.value = 2
      const cols = u.uColors.value as THREE.Color[]
      state.gradient.colors.forEach((c, i) => cols[i].set(c))
      u.uSpeed.value = state.gradient.speed
      u.uScale.value = state.gradient.scale
      u.uWarp.value = state.gradient.warp
      u.uGrain.value = state.gradient.grain
      this.releaseMedia()
      return
    }

    u.uGrain.value = 0

    if (state.kind === 'color' || state.kind === 'transparent') {
      u.uMode.value = 1
      this.releaseMedia()
      return
    }

    if (state.kind === 'image' && state.imageUrl) {
      if (this.imageUrl !== state.imageUrl) {
        this.releaseMedia()
        const tex = await loadTexture(state.imageUrl)
        this.texture = tex
        this.imageUrl = state.imageUrl
        const img = tex.image as { width: number; height: number }
        u.uTexAspect.value = img.width / img.height
      }
      u.uMode.value = 3
      u.uTex.value = this.texture
      return
    }

    if (state.kind === 'video' && state.videoUrl) {
      if (this.videoUrl !== state.videoUrl) {
        this.releaseMedia()
        const { video, texture } = await loadVideoTexture(state.videoUrl)
        this.video = video
        this.texture = texture
        this.videoUrl = state.videoUrl
        u.uTexAspect.value = video.videoWidth / video.videoHeight
      }
      u.uMode.value = 3
      u.uTex.value = this.texture
      return
    }

    // Asked for media we do not have — fall back to the solid colour.
    u.uMode.value = 1
    this.releaseMedia()
  }

  /**
   * Swap in a texture decoded frame-accurately by the exporter. Passing null
   * restores the live one. Used only during export.
   */
  overrideTexture(tex: THREE.Texture | null) {
    this.material.uniforms.uTex.value = tex ?? this.meshGradient?.texture ?? this.texture
  }

  /** Aspect of whatever media is currently bound. */
  setTextureAspect(a: number) {
    this.material.uniforms.uTexAspect.value = a
  }

  /** The <video> currently used as the background, if any. */
  get backgroundVideo() { return this.video }

  private releaseMedia() {
    if (this.meshGradient) { this.meshGradient.dispose(); this.meshGradient = null }
    this.meshUrl = null
    this.mediaDuration = 0
    if (this.texture) { this.texture.dispose(); this.texture = null }
    if (this.video) { this.video.pause(); this.video.src = ''; this.video = null }
    this.videoUrl = null
    this.imageUrl = null
    this.material.uniforms.uTex.value = null
  }

  dispose() {
    this.releaseMedia()
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}

export function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
        t.minFilter = THREE.LinearMipmapLinearFilter
        t.magFilter = THREE.LinearFilter
        t.generateMipmaps = true
        t.anisotropy = 8
        resolve(t)
      },
      undefined,
      reject,
    )
  })
}

export function loadVideoTexture(url: string): Promise<{ video: HTMLVideoElement; texture: THREE.VideoTexture }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = url
    video.crossOrigin = 'anonymous'
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const onReady = () => {
      const texture = new THREE.VideoTexture(video)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = false
      video.play().catch(() => { /* autoplay may be blocked; scrubbing still works */ })
      resolve({ video, texture })
    }
    video.addEventListener('loadeddata', onReady, { once: true })
    video.addEventListener('error', () => reject(new Error('Could not load video')), { once: true })
  })
}
