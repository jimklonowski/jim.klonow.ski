<script setup lang="ts">
import type { DexaEntry } from '~/composables/useDexaEntries'
import { hexChannels } from '#shared/utils/oklch'
import { scanTag } from '#shared/utils/scanTag'
import { DEXA_NOISE, deltaInfo, type Delta } from '~/utils/dexaDeltas'

// The scan on a body: public/models/body.glb (a CC0 MakeHuman mesh sized to Jim's numbers, built
// by scripts/body/build-body-glb.mjs) rendered with a phosphor scan-line shader — a screen-space
// raster whose brightness carries each DEXA region's fat %, a green rim, the scanner's ROI lines
// (band edges and the shoulder, chin and hip cuts) as green rules, and a sweeping beam. Regions
// are classified per fragment from the cut planes the mesh carries in its extras, so their edges
// follow the planes rather than the triangles. Two modes share everything but the camera:
//
//   turn  — perspective, drag to rotate, view buttons; labels hide as their region turns away
//   flat  — orthographic front view, no rotation: the body map, with the callouts the hand-drawn
//           SVG map used to carry (arms and legs on leaders in the margins, trunk and the two
//           bands on the body, R/L lean at the hands and feet)
//
// `compact` is the home page's thumbnail of either mode: no view buttons, no THEN/NOW slider, no
// legend, no standing callouts or R/L figures — at 130–230 px wide there is no margin for them —
// only the hovered region's name and fat % on a plate over the body. Everything else (the
// shader, the hover pick, the beam) is the same component.
//
// Hovering a region lights it and reports it through `highlight`, the same contract as BodyMap,
// so the regional table stays in step either way; clicking one pins it through `pinned`, and the
// pin outranks the hover until it, the background or Escape clears it. When the mesh carries an
// earlier body as a morph target for the previous scan, a THEN/NOW slider blends shape and fat %,
// tweens the callout figures and shows each region's move once it leaves NOW.
//
// three.js is imported lazily inside onMounted, so it is a separate chunk only this page pays for.

type Regions = DexaEntry['regions']
type RegionFigures = { fat_pct?: number, fat_lbs?: number, lean_lbs?: number }

const props = withDefaults(defineProps<{
  regions: Regions
  previousRegions?: Regions | null
  symmetry?: DexaEntry['symmetry']
  previousSymmetry?: DexaEntry['symmetry']
  /** Scan dates, matched against the mesh's own base/alt dates before the morph slider shows. */
  dates: { latest: string, previous?: string | null }
  mode?: 'turn' | 'flat'
  /** The home-page thumbnail: figure and hover only, no controls, slider, legend or standing labels. */
  compact?: boolean
}>(), { previousRegions: null, symmetry: undefined, previousSymmetry: undefined, mode: 'turn', compact: false })
const emit = defineEmits<{ unsupported: [] }>()
const highlight = defineModel<string | null>('highlight', { default: null })
/** A region clicked on the body (or, on the DEXA page, in the table) stays lit until it, the background or Escape clears it. */
const pinned = defineModel<string | null>('pinned', { default: null })
/** What the shader and the callouts light: the pin when there is one, else whatever is hovered. */
const lit = computed(() => pinned.value ?? highlight.value)

const stage = ref<HTMLDivElement>()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const size = ref({ w: 300, h: 400 })
const yaw = ref(0.55)
/** Turning on load; a drag or a view button takes over. Reduced motion shows the front view, still. */
const auto = ref(true)
/** 0 = the latest body, 1 = the previous one. */
const morph = ref(0)
const meshDates = ref<{ base: string, alt: string | null } | null>(null)
// The mesh names the scans it was built from by tag (shared/utils/scanTag.ts), not by date: the
// GLB is a public asset. The slider appears only when the tags match the scans on screen.
const canMorph = computed(() =>
  !!meshDates.value?.alt
  && meshDates.value.base === scanTag(props.dates.latest)
  && !!props.dates.previous && meshDates.value.alt === scanTag(props.dates.previous)
)
// The slider runs in time order, THEN on the left and NOW on the right, so its value is the inverse
// of the morph weight.
const morphPct = computed({
  get: () => Math.round((1 - morph.value) * 100),
  set: (v: number) => {
    morph.value = 1 - v / 100
  }
})
const flat = computed(() => props.mode === 'flat')

// --- turning --------------------------------------------------------------------------------------
/** The yaw a view button or a table row asked for; the frame loop eases toward it, a drag cancels it. */
let turnTarget: number | null = null
const reducedMotion = ref(false)
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
function turnTo(target: number) {
  auto.value = false
  if (flat.value) return
  // The short way round: the current yaw re-expressed within half a turn of the target.
  yaw.value = target + wrapAngle(yaw.value - target)
  if (reducedMotion.value) {
    yaw.value = target
    return
  }
  turnTarget = target
}
function toggleAuto() {
  turnTarget = null
  auto.value = !auto.value
}
// The view that shows a region best: the trunk and its bands straight on; the arms a three-quarter
// turn that brings the subject's right arm (the one the callout points at) forward; the legs the
// same turn the other way, for the left leg.
const REGION_YAW: Record<string, number> = { arms: 0.55, legs: -0.55, trunk: 0, android: 0, gynoid: 0 }
/** Turns the body to show a region; the regional table calls this when a row is clicked. */
function focusRegion(key: string) {
  turnTo(REGION_YAW[key] ?? 0)
}
defineExpose({ focusRegion })

const REGION_IDS: Record<string, number> = { arms: 1, legs: 2, trunk: 3, android: 4, gynoid: 5 }

// --- callout overlay -----------------------------------------------------------------------------
interface Callout {
  key: string
  name: string
  side: 'left' | 'right' | 'inside'
  /** Anchor on the body, metres, found from the mesh on load. */
  anchor: [number, number, number]
}
interface Placed extends Callout {
  x: number
  y: number
  ax: number
  ay: number
  pct: string
  fat: string
  lean: string
  /** The fat % move since the previous scan, carried while the slider is off NOW. */
  delta: Delta | null
  visible: boolean
}
interface LimbFigure {
  text: string
  x: number
  y: number
  visible: boolean
}
const placed = ref<Placed[]>([])
const limbFigures = ref<LimbFigure[]>([])
const MARGIN = 10

const fmt = (v: number | undefined, decimals = 1) => (v == null ? '—' : v.toFixed(decimals))
/** The slider's weight on the previous scan: 0 at NOW, 1 at THEN, and 0 whenever there is nothing to morph to. */
const blend = computed(() => (canMorph.value ? morph.value : 0))
// A figure at the slider's position tweens between the two scans, so the callouts count along with
// the body instead of jumping at the halfway point. With the figure missing on one side, the side
// nearer the thumb stands in.
const tween = (now: number | undefined, then: number | undefined) =>
  (now == null || then == null ? (blend.value >= 0.5 ? then : now) : now + (then - now) * blend.value)
type RegionTable = Record<string, RegionFigures | undefined>
const figures = (key: string): RegionFigures | undefined => {
  const now = (props.regions as RegionTable)[key]
  const then = (props.previousRegions as RegionTable | null)?.[key]
  if (!now && !then) return undefined
  return { fat_pct: tween(now?.fat_pct, then?.fat_pct), fat_lbs: tween(now?.fat_lbs, then?.fat_lbs), lean_lbs: tween(now?.lean_lbs, then?.lean_lbs) }
}
/** The fat % move since the previous scan, for the callouts once the slider has left NOW. */
const regionDelta = (key: string): Delta | null => {
  if (blend.value <= 0) return null
  const now = (props.regions as RegionTable)[key]
  const then = (props.previousRegions as RegionTable | null)?.[key]
  return deltaInfo(now?.fat_pct, then?.fat_pct, 1, 'down', DEXA_NOISE.regionPct)
}
/** A region's fat % for the shader; -1 when the scan has no figure for it, which the shader draws as "no data", not as 0 % (the darkest wash). */
const fatPct = (regions: Regions | null | undefined, key: string) => ((regions as Record<string, RegionFigures | undefined> | null | undefined)?.[key]?.fat_pct ?? -1)

const VERTEX = /* glsl */ `
  #include <common>
  #include <morphtarget_pars_vertex>
  varying vec3 vPosLocal;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec4 vColor;
  void main() {
    vColor = color;
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    vPosLocal = transformed;
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vNormalV = normalize(normalMatrix * objectNormal);
    vViewDir = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT = /* glsl */ `
  uniform float uFat[4];
  uniform float uBandFat[3];
  uniform vec2 uAndroid;
  uniform vec2 uGynoid;
  uniform float uChin;
  uniform float uArmpit;
  uniform float uCrotch;
  uniform float uShoulder;
  uniform float uHighlight;
  uniform float uTime;
  uniform float uBeam;
  uniform float uDpr;
  uniform float uOrtho;
  // The raster's colors as the page's theme tokens (inset, warn, accent) — see applyPalette().
  uniform vec3 uSurface;
  uniform vec3 uWarn;
  uniform vec3 uAccent;
  varying vec3 vPosLocal;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec4 vColor;

  float wash(float fat) { return 0.18 + 0.72 * clamp((fat - 8.0) / 27.0, 0.0, 1.0); }

  // A line about one device pixel wide, plus a pixel of anti-aliasing, wherever f crosses zero —
  // the same width at any zoom, since |f| / fwidth(f) is the distance to the crossing in pixels.
  // Called in uniform control flow only: derivatives inside a branch are undefined.
  float rule(float f) { return 1.0 - smoothstep(0.5 * uDpr, 0.5 * uDpr + 1.0, abs(f) / max(fwidth(f), 1e-6)); }

  void main() {
    vec3 p = vPosLocal;
    float ax = abs(p.x);
    // The scanner's cut lines as signed functions of position, zero on the line, mirroring
    // scripts/body/build-body-glb.mjs: the chin plane; above the armpit the arm line angling
    // inward through the shoulder joint; the leg line running from the crotch out to the hips.
    // Classifying each fragment by these puts every boundary exactly where the plane meets the
    // skin. Reading the per-vertex label instead, blended across each triangle, followed the
    // mesh edges — a staircase on the sparsely meshed torso — and halfway between an arm vertex
    // (1) and a trunk vertex (3) it even rounded to legs (2).
    float head = p.y - uChin;
    float shoulder = ax - max(uShoulder - 0.06, uShoulder - 0.5 * (p.y - uArmpit));
    float leg = p.y - (uCrotch + max(0.0, ax - 0.03));
    bool aboveArmpit = p.y >= uArmpit;
    // Below the armpit, arm or trunk is a question of which surface the point is on, and that
    // still comes from the vertex label: the two surfaces run a centimetre apart there and never
    // share a triangle, so the blend is exact. The threshold sits between arms (1) and legs (2),
    // not on 2.0 — the legs' own value lands either side of that per pixel and speckled them.
    bool armSurface = vColor.r * 255.0 < 1.5;
    float region = 3.0;
    if (head > 0.0) region = 0.0;
    else if (aboveArmpit ? shoulder > 0.0 : armSurface) region = 1.0;
    else if (leg < 0.0) region = 2.0;
    float band = 0.0;
    if (region > 2.5 && p.y >= uAndroid.x && p.y < uAndroid.y) band = 1.0;
    else if (region > 1.5 && p.y >= uGynoid.x && p.y < uGynoid.y) band = 2.0;
    float fat = region < 0.5 ? -1.0 : uFat[int(region)];
    // A band the scan has no figure for (-1) keeps its trunk's wash instead of reading as 0 %.
    if (band > 0.5 && uBandFat[int(band)] >= 0.0) fat = uBandFat[int(band)];

    // Every rule is evaluated here, before any branch, for the derivatives' sake.
    float rShoulder = rule(shoulder);
    float rHead = rule(head);
    float rLeg = rule(leg);
    float rAndroid = max(rule(p.y - uAndroid.x), rule(p.y - uAndroid.y));
    float rGynoid = max(rule(p.y - uGynoid.x), rule(p.y - uGynoid.y));

    vec3 n = normalize(vNormalV);
    // An orthographic view has one view direction for every fragment.
    vec3 v = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(vViewDir);
    float lambert = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    // A screen-space raster — a 1.4-device-pixel line every 3, like the flat scan variant. Fixed
    // to the screen, so it can't alias into moiré the way a surface-space pattern does on a
    // curved body, and lit per fragment so the form still reads. A faint fill between the lines
    // keeps the silhouette solid.
    float period = 3.0 * uDpr;
    float line = step(mod(gl_FragCoord.y, period), 1.4 * uDpr);
    // The theme's inset, warn and accent tokens (applyPalette), not literals.
    vec3 surface = uSurface;
    vec3 amber = uWarn;
    vec3 green = uAccent;
    float w = (region < 0.5 || fat < 0.0) ? 0.10 : wash(fat);
    float shade = 0.55 + 0.45 * lambert;
    vec3 col = surface + amber * (w * shade) * (0.14 + 0.86 * line);

    bool lit = (uHighlight > 0.5 && uHighlight < 3.5 && abs(region - uHighlight) < 0.5)
      || (uHighlight > 3.5 && abs(band - (uHighlight - 3.0)) < 0.5);
    float hl = lit ? 1.0 : 0.0;
    col += green * 0.16 * hl;
    col += green * fresnel * (0.32 + 0.4 * hl);

    // The ROI lines, as the report draws them on its own figure: the band edges across the
    // trunk and legs, the three cuts — each where it actually separates two regions — and the
    // lit region's own boundary at full strength, which also covers the hard edge of its fill.
    float h = uHighlight;
    bool bounds = (h > 0.5 && h < 1.5) || (h > 2.5 && h < 3.5);
    float grid = 0.0;
    float outline = 0.0;
    float on = (aboveArmpit && head <= 0.0) ? rShoulder : 0.0;
    grid = max(grid, on);
    outline = max(outline, bounds ? on : 0.0);
    on = shoulder <= 0.0 ? rHead : 0.0;
    grid = max(grid, on);
    outline = max(outline, (h > 2.5 && h < 3.5) ? on : 0.0);
    on = (!aboveArmpit && !armSurface) ? rLeg : 0.0;
    grid = max(grid, on);
    outline = max(outline, (h > 1.5 && h < 3.5) ? on : 0.0);
    on = region > 2.5 ? rAndroid : 0.0;
    grid = max(grid, on);
    outline = max(outline, (h > 3.5 && h < 4.5) ? on : 0.0);
    on = (region > 1.5 && region < 3.5) ? rGynoid : 0.0;
    grid = max(grid, on);
    outline = max(outline, h > 4.5 ? on : 0.0);
    col = mix(col, green * 0.85, grid * 0.6);
    col = mix(col, green, outline * 0.95);

    float beamY = mod(uTime * 0.32, 1.0) * 2.1 - 0.1;
    float beam = smoothstep(0.035, 0.0, abs(vPosLocal.y - beamY)) * uBeam;
    col += green * beam * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`

// Teardown is incremental: each resource registers its own release the moment it exists, and an
// unmount runs whatever has been registered so far. The setup below awaits twice (the three.js
// chunk, then the 644 KB GLB), and the DEXA page's 3D/FLAT toggle remounts this component while
// the home row can be navigated away from mid-load — with one `dispose` assigned at the very end,
// an unmount during the GLB download left the renderer, its canvas and a requestAnimationFrame
// loop drawing to a detached element for the life of the tab, and every such unmount held
// another WebGL context toward the browser's cap. `cancelled` stops the continuation after each
// await from building on what the unmount has already released.
const cleanups: Array<() => void> = []
let cancelled = false
function teardown() {
  while (cleanups.length) cleanups.pop()!()
}
onBeforeUnmount(() => {
  cancelled = true
  teardown()
})

onMounted(async () => {
  const host = stage.value
  if (!host) return
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Reduced motion: no turning, and a straight-on front view rather than the three-quarter one.
  if (reducedMotion.value) {
    auto.value = false
    yaw.value = 0
  }
  try {
    const THREE = await import('three')
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    if (cancelled) return

    // Without WebGL 2 the constructor throws, and the catch below hands the page to the SVG map.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    const el = renderer.domElement
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.display = 'block'
    // A drag turns the body sideways only, so vertical touches stay the page's scroll.
    el.style.touchAction = 'pan-y'
    host.appendChild(el)
    cleanups.push(() => {
      // dispose() alone leaves the context to the garbage collector; losing it frees it now.
      renderer.forceContextLoss()
      renderer.dispose()
      el.remove()
    })

    const gltf = await new GLTFLoader().loadAsync('/models/body.glb')
    if (cancelled) return
    gltf.scene.updateMatrixWorld(true)
    const source = gltf.scene.getObjectByProperty('type', 'Mesh') as InstanceType<typeof THREE.Mesh> | undefined
    if (!source) throw new Error('body.glb has no mesh')
    const geometry = source.geometry

    // The GLB is quantized (KHR_mesh_quantization): positions are 16-bit integers and the node
    // carries the transform that puts them back in metres. Taking the geometry on its own would
    // render the body about twice life-size and off-centre, so bake that transform into float
    // positions — and its scale into the morph deltas — before anything measures it in metres.
    const toMetres = source.matrixWorld.clone()
    const scaleOnly = new THREE.Matrix3().setFromMatrix4(toMetres)
    const bake = (attr: InstanceType<typeof THREE.BufferAttribute> | InstanceType<typeof THREE.InterleavedBufferAttribute>, full: boolean) => {
      const out = new THREE.Float32BufferAttribute(attr.count * 3, 3)
      const v = new THREE.Vector3()
      for (let i = 0; i < attr.count; i++) {
        v.fromBufferAttribute(attr, i)
        if (full) v.applyMatrix4(toMetres)
        else v.applyMatrix3(scaleOnly)
        out.setXYZ(i, v.x, v.y, v.z)
      }
      return out
    }
    const position = bake(geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>, true)
    geometry.setAttribute('position', position)
    if (geometry.morphAttributes.position) {
      geometry.morphAttributes.position = geometry.morphAttributes.position.map(a => bake(a as InstanceType<typeof THREE.BufferAttribute>, false))
    }
    // Both bounds, not just the sphere: the loader's box is in the quantized space and the
    // raycaster tests it before any triangle, so a stale one makes every hover miss.
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    const extras = (source.userData ?? {}) as { base?: string, alt?: string | null, height?: number, bands?: { android: number[], gynoid: number[] }, landmarks?: { armpit?: number, crotch?: number, chin?: number, torsoHalfWidth?: number } }
    meshDates.value = { base: extras.base ?? '', alt: extras.alt ?? null }
    const height = extras.height ?? 1.87
    const bands = extras.bands ?? { android: [1.1, 1.21], gynoid: [0.72, 0.94] }
    const armpit = extras.landmarks?.armpit ?? 1.43
    const crotch = extras.landmarks?.crotch ?? 0.93
    const chin = extras.landmarks?.chin ?? 1.64
    const shoulder = extras.landmarks?.torsoHalfWidth ?? 0.18

    // Callout anchors read off the labelled mesh: the outer edge of the subject's right arm and
    // left leg at mid-height, the hands' and feet's lowest points, the bands' centres.
    const colorAttr = geometry.getAttribute('color')
    const regionOf = (i: number) => Math.round(colorAttr.getX(i) * 255)
    const extreme = (want: number, test: (x: number, y: number) => boolean, pickX: 'min' | 'max') => {
      let best: [number, number, number] | null = null
      for (let i = 0; i < position.count; i++) {
        if (regionOf(i) !== want) continue
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
        if (!test(x, y)) continue
        if (!best || (pickX === 'min' ? x < best[0] : x > best[0])) best = [x, y, z]
      }
      return best
    }
    const lowest = (want: number, side: 'left' | 'right') => {
      let best: [number, number, number] | null = null
      for (let i = 0; i < position.count; i++) {
        if (regionOf(i) !== want) continue
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
        if (side === 'right' ? x > 0 : x < 0) continue
        if (!best || y < best[1]) best = [x, y, z]
      }
      return best
    }
    // The arms callout points at the upper arm: there the body is narrow enough to leave the margin
    // free, while at the hands an A-pose reaches into it and the block landed on the hand itself.
    const armY = armpit - 0.07
    const legY = crotch * 0.5
    const callouts: Callout[] = [
      { key: 'arms', name: 'ARMS', side: 'left', anchor: extreme(1, (x, y) => x < 0 && Math.abs(y - armY) < 0.03, 'min') ?? [-0.3, armY, 0] },
      { key: 'legs', name: 'LEGS', side: 'right', anchor: extreme(2, (x, y) => x > 0 && Math.abs(y - legY) < 0.03, 'max') ?? [0.18, legY, 0] },
      // The trunk plate sits high enough on the chest for its delta line to clear the android plate.
      { key: 'trunk', name: 'TRUNK', side: 'inside', anchor: [0, (armpit + bands.android[1]!) / 2 + 0.04, 0.12] },
      { key: 'android', name: 'ANDROID', side: 'inside', anchor: [0, (bands.android[0]! + bands.android[1]!) / 2, 0.13] },
      { key: 'gynoid', name: 'GYNOID', side: 'inside', anchor: [0, (bands.gynoid[0]! + bands.gynoid[1]!) / 2, 0.13] }
    ]
    const limbs = {
      rightHand: lowest(1, 'right') ?? [-0.33, 0.78, 0],
      leftHand: lowest(1, 'left') ?? [0.33, 0.78, 0],
      rightFoot: lowest(2, 'right') ?? [-0.11, 0, 0],
      leftFoot: lowest(2, 'left') ?? [0.11, 0, 0]
    }

    const uniforms = {
      uFat: { value: [0, fatPct(props.regions, 'arms'), fatPct(props.regions, 'legs'), fatPct(props.regions, 'trunk')] },
      uBandFat: { value: [0, fatPct(props.regions, 'android'), fatPct(props.regions, 'gynoid')] },
      uAndroid: { value: new THREE.Vector2(bands.android[0], bands.android[1]) },
      uGynoid: { value: new THREE.Vector2(bands.gynoid[0], bands.gynoid[1]) },
      uChin: { value: chin },
      uArmpit: { value: armpit },
      uCrotch: { value: crotch },
      uShoulder: { value: shoulder },
      uHighlight: { value: -1 },
      uTime: { value: 0 },
      uBeam: { value: reducedMotion.value ? 0 : 1 },
      uDpr: { value: renderer.getPixelRatio() },
      uOrtho: { value: flat.value ? 1 : 0 },
      uSurface: { value: new THREE.Vector3() },
      uWarn: { value: new THREE.Vector3() },
      uAccent: { value: new THREE.Vector3() }
    }
    // The shader has no CSS to resolve a token, so its three colors are read off <html>'s computed
    // style — as raw sRGB channels, which is what the literals they replace were, not through
    // THREE.Color's color management — and read again whenever the display preset changes
    // `data-theme` (app.vue), so a theme switch reaches the mesh along with everything else.
    const token = (name: string) => {
      const [r, g, b] = hexChannels(getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim())
      return new THREE.Vector3(r / 255, g / 255, b / 255)
    }
    const applyPalette = () => {
      uniforms.uSurface.value = token('inset')
      uniforms.uWarn.value = token('warn')
      uniforms.uAccent.value = token('accent')
    }
    applyPalette()
    const themeObserver = new MutationObserver(applyPalette)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, vertexColors: true })
    const mesh = new THREE.Mesh(geometry, material)
    cleanups.push(() => {
      themeObserver.disconnect()
      material.dispose()
      geometry.dispose()
    })
    mesh.position.y = -height / 2
    const pivot = new THREE.Group()
    pivot.add(mesh)
    const scene = new THREE.Scene()
    scene.add(pivot)

    // Turn mode looks slightly down from in front; flat mode is a straight-on orthographic front.
    const halfHeight = (height / 2) * 1.1
    const perspective = new THREE.PerspectiveCamera(26, 1, 0.1, 20)
    perspective.position.set(0, 0.55, 4.6)
    perspective.lookAt(0, 0, 0)
    const ortho = new THREE.OrthographicCamera(-1, 1, halfHeight, -halfHeight, 0.1, 20)
    ortho.position.set(0, 0, 5)
    ortho.lookAt(0, 0, 0)
    const camera = flat.value ? ortho : perspective
    if (flat.value) yaw.value = 0

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      size.value = { w, h }
      renderer.setSize(w, h, false)
      perspective.aspect = w / h
      perspective.updateProjectionMatrix()
      ortho.left = -halfHeight * (w / h)
      ortho.right = halfHeight * (w / h)
      ortho.updateProjectionMatrix()
      placeLabels()
    }

    // Project the anchors into stage pixels; a label whose anchor has turned behind the body's
    // axis is hidden in turn mode.
    const v3 = new THREE.Vector3()
    const axis = new THREE.Vector3()
    const toStage = (p: [number, number, number]) => {
      v3.set(p[0], p[1] - height / 2, p[2]).applyMatrix4(pivot.matrixWorld).project(camera)
      return { x: ((v3.x + 1) / 2) * size.value.w, y: ((1 - v3.y) / 2) * size.value.h, z: v3.z }
    }
    const facing = (p: [number, number, number]) => {
      if (flat.value) return true
      const a = toStage(p)
      axis.set(0, p[1] - height / 2, 0).applyMatrix4(pivot.matrixWorld).project(camera)
      return a.z <= axis.z + 0.002
    }
    const placeLabels = () => {
      // Apply the turn here as well: a view button changes yaw before the next frame has, and
      // projecting against the frame's old rotation left every callout where the last view put it.
      pivot.rotation.y = flat.value ? 0 : yaw.value
      pivot.updateMatrixWorld(true)
      camera.updateMatrixWorld(true)
      placed.value = callouts.map((c) => {
        const a = toStage(c.anchor)
        const f = figures(c.key)
        // A margin callout keeps to its anchor's side of the body as it turns — seen from behind,
        // the subject's left leg is on the viewer's left — so the leader never crosses the figure.
        const side = c.side === 'inside' || flat.value ? c.side : a.x < toStage([0, c.anchor[1], 0]).x ? 'left' : 'right'
        const x = side === 'left' ? MARGIN : side === 'right' ? size.value.w - MARGIN : a.x
        return {
          ...c,
          side,
          ax: a.x,
          ay: a.y,
          x,
          y: a.y,
          pct: f?.fat_pct != null ? `${fmt(f.fat_pct)}%` : '—',
          fat: f?.fat_lbs != null ? `${fmt(f.fat_lbs)} fat` : '',
          lean: f?.lean_lbs != null ? `${fmt(f.lean_lbs)} lean` : '',
          delta: regionDelta(c.key),
          // An on-body plate for a band the scan has no figure for would read "ANDROID —".
          visible: facing(c.anchor) && (c.side !== 'inside' || f?.fat_pct != null)
        }
      })
      // The R/L lean figures tween with the slider like the regions do.
      const sNow = props.symmetry
      const sThen = props.previousSymmetry
      const lean = (k: 'right_arm_lean' | 'left_arm_lean' | 'right_leg_lean' | 'left_leg_lean') => tween(sNow?.[k], sThen?.[k])
      limbFigures.value = sNow || sThen
        ? ([
            ['rightHand', `R ${fmt(lean('right_arm_lean'))}`],
            ['leftHand', `L ${fmt(lean('left_arm_lean'))}`],
            ['rightFoot', `R ${fmt(lean('right_leg_lean'))}`],
            ['leftFoot', `L ${fmt(lean('left_leg_lean'))}`]
          ] as const).map(([k, text]) => {
            const p = limbs[k]
            const a = toStage([p[0], p[1] - 0.045, p[2]])
            return { text, x: a.x, y: a.y, visible: facing(p) }
          })
        : []
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    cleanups.push(() => ro.disconnect())

    // Pointer: in turn mode a drag turns the body; a still pointer picks the region under it.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const local = new THREE.Vector3()
    let drag: { x: number, yaw: number } | null = null
    // The shader's classification, for the pointer: the hit point in body space against the cut
    // lines, with the face's blended vertex label settling arm-or-trunk below the armpit. Going
    // by the face's first vertex alone put the pick boundary a triangle off the drawn line.
    const regionAt = (p: { x: number, y: number }, armSurface: boolean) => {
      const ax = Math.abs(p.x)
      if (p.y > chin) return null
      if (p.y >= armpit ? ax > Math.max(shoulder - 0.06, shoulder - 0.5 * (p.y - armpit)) : armSurface) return 'arms'
      if (p.y < crotch + Math.max(0, ax - 0.03)) return 'legs'
      return 'trunk'
    }
    const bandAt = (region: string | null, y: number) => {
      if (region === 'trunk' && y >= bands.android[0]! && y < bands.android[1]!) return 'android'
      if ((region === 'trunk' || region === 'legs') && y >= bands.gynoid[0]! && y < bands.gynoid[1]!) return 'gynoid'
      return null
    }
    const pickAt = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(mesh, false)[0]
      if (!hit?.face) return null
      // face.a/b/c are vertex indices (the raycaster resolves the index buffer); the barycentric
      // weights blend their labels the way the rasteriser blends the colour attribute.
      const { a, b, c } = hit.face
      const w = hit.barycoord ?? new THREE.Vector3(1, 0, 0)
      const armSurface = w.x * regionOf(a) + w.y * regionOf(b) + w.z * regionOf(c) < 1.5
      mesh.worldToLocal(local.copy(hit.point))
      const region = regionAt(local, armSurface)
      const band = bandAt(region, local.y)
      // A band the scan has no figure for reads as its region, which the table does have a row for.
      return band && figures(band)?.fat_pct != null ? band : region
    }
    const pick = (e: PointerEvent) => pickAt(e.clientX, e.clientY)
    if (import.meta.dev) {
      // Lets a headless check ask the viewer what sits under a point, and where the body is.
      (window as unknown as Record<string, unknown>).__bodyMeshDebug = {
        pickAt,
        bounds: () => ({ sphere: geometry.boundingSphere, box: geometry.boundingBox, yaw: yaw.value, mode: props.mode, camera: camera.type }),
        hits: (x: number, y: number) => {
          const r = el.getBoundingClientRect()
          pointer.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
          raycaster.setFromCamera(pointer, camera)
          return raycaster.intersectObject(mesh, false).length
        }
      }
    }
    let down: { x: number, y: number } | null = null
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
      if (flat.value) return
      el.setPointerCapture(e.pointerId)
      drag = { x: e.clientX, yaw: yaw.value }
      turnTarget = null
      auto.value = false
    }
    const onMove = (e: PointerEvent) => {
      if (drag) {
        yaw.value = drag.yaw + (e.clientX - drag.x) * 0.012
        return
      }
      highlight.value = pick(e)
    }
    // A press that never moved is a click: it pins the region under it, and clicking the pinned
    // region again or the background releases it. On touch, where nothing hovers, this is how a
    // region lights at all.
    const onUp = (e: PointerEvent) => {
      const tap = !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4
      down = null
      drag = null
      if (!tap) return
      const key = pickAt(e.clientX, e.clientY)
      pinned.value = key && key !== pinned.value ? key : null
    }
    const onCancel = () => {
      down = null
      drag = null
    }
    const onLeave = () => {
      onCancel()
      highlight.value = null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('pointerleave', onLeave)
    cleanups.push(() => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('pointerleave', onLeave)
    })

    const stopHighlight = watch(lit, (key) => {
      uniforms.uHighlight.value = key ? REGION_IDS[key] ?? -1 : -1
    }, { immediate: true })
    const stopLabels = watch([yaw, morph, () => props.regions, () => props.previousRegions, () => props.symmetry, () => props.previousSymmetry], placeLabels)
    cleanups.push(() => {
      stopHighlight()
      stopLabels()
    })

    const timer = new THREE.Timer()
    let raf = 0
    cleanups.push(() => cancelAnimationFrame(raf))
    const loop = () => {
      timer.update()
      const dt = timer.getDelta()
      if (!drag && !flat.value) {
        if (turnTarget != null) {
          // Easing toward the view a button or a table row asked for, settling in about half a second.
          const d = turnTarget - yaw.value
          if (Math.abs(d) < 0.002) {
            yaw.value = turnTarget
            turnTarget = null
          }
          else {
            yaw.value += d * Math.min(1, dt * 8)
          }
        }
        else if (auto.value) {
          // About twelve seconds per turn.
          yaw.value += dt * 0.5
        }
      }
      pivot.rotation.y = flat.value ? 0 : yaw.value
      const m = canMorph.value ? morph.value : 0
      if (mesh.morphTargetInfluences?.length) mesh.morphTargetInfluences[0] = m
      const lerp = (a: number, b: number) => a + (b - a) * m
      uniforms.uFat.value = [0,
        lerp(fatPct(props.regions, 'arms'), fatPct(props.previousRegions, 'arms')),
        lerp(fatPct(props.regions, 'legs'), fatPct(props.previousRegions, 'legs')),
        lerp(fatPct(props.regions, 'trunk'), fatPct(props.previousRegions, 'trunk'))]
      uniforms.uBandFat.value = [0,
        lerp(fatPct(props.regions, 'android'), fatPct(props.previousRegions, 'android')),
        lerp(fatPct(props.regions, 'gynoid'), fatPct(props.previousRegions, 'gynoid'))]
      uniforms.uTime.value = timer.getElapsed()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    status.value = 'ready'
    placeLabels()
  }
  catch (err) {
    console.error('[body mesh]', err)
    // Whatever was built before the failure (a renderer waiting on a GLB that 404'd) goes too.
    teardown()
    status.value = 'error'
    emit('unsupported')
  }
})

const VIEWS = [
  { label: 'FRONT', yaw: 0 },
  { label: '¾', yaw: 0.55 },
  { label: 'SIDE', yaw: Math.PI / 2 },
  { label: 'BACK', yaw: Math.PI }
]
function view(v: number) {
  turnTo(v)
}

// --- keyboard and assistive access ------------------------------------------------------------
// The canvas is pixels and the overlay is decoration (aria-hidden), so the stage itself carries
// what the hand-drawn map's focusable regions used to: one description of the whole figure, and
// a live readout of the lit region. ↑ ↓ walk the regions, Enter or Space pins the lit one, ← →
// turn the body (turn mode), Escape clears — the same highlight and pin the pointer sets, so the
// table lights up in step.
const REGION_NAMES: Record<string, string> = { arms: 'Arms', legs: 'Legs', trunk: 'Trunk', android: 'Android (abdomen)', gynoid: 'Gynoid (hips)' }
const REGION_ORDER = ['arms', 'legs', 'trunk', 'android', 'gynoid']
const hint = computed(() => {
  if (pinned.value) return `locked on ${REGION_NAMES[pinned.value] ?? pinned.value} · click it again or esc to release`
  return flat.value ? 'R / L figures · lean lbs · click a region to lock it' : 'drag to turn · hover a region · click to lock'
})
function describe(key: string): string | null {
  const f = figures(key)
  if (f?.fat_pct == null) return null
  return `${REGION_NAMES[key] ?? key}: ${fmt(f.fat_pct)}% fat${f.fat_lbs != null ? `, ${fmt(f.fat_lbs)} lbs fat` : ''}${f.lean_lbs != null ? `, ${fmt(f.lean_lbs)} lbs lean` : ''}`
}
const ariaLabel = computed(() => {
  const parts = REGION_ORDER.map(describe).filter((s): s is string => !!s)
  return `Body mesh of the ${props.dates.latest} DEXA scan: fat percentage by region. ${parts.join('. ')}${parts.length ? '.' : ''} Up and down arrows walk the regions${flat.value ? '' : ', left and right turn the body'}.`
})
const highlightText = computed(() => (lit.value ? describe(lit.value) ?? REGION_NAMES[lit.value] ?? lit.value : ''))
function onStageKey(e: KeyboardEvent) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const shown = REGION_ORDER.filter(k => figures(k)?.fat_pct != null)
    if (!shown.length) return
    const down = e.key === 'ArrowDown'
    const i = lit.value ? shown.indexOf(lit.value) : (down ? -1 : 0)
    const next = shown[(i + (down ? 1 : -1) + shown.length) % shown.length] ?? null
    // With a region pinned the arrows move the pin, so a wandering pointer can't unseat it.
    if (pinned.value) pinned.value = next
    else highlight.value = next
  }
  else if (e.key === 'Enter' || e.key === ' ') {
    if (!lit.value) return
    e.preventDefault()
    pinned.value = pinned.value === lit.value ? null : lit.value
  }
  else if (!flat.value && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault()
    turnTarget = null
    auto.value = false
    yaw.value += e.key === 'ArrowLeft' ? -0.15 : 0.15
  }
  else if (e.key === 'Escape') {
    pinned.value = null
    highlight.value = null
  }
}

// Text over the body gets a surface-colour halo so it clears contrast on any shade, and the
// on-body labels sit on a backplate so the raster doesn't run through the digits.
const HALO = 'paint-order: stroke; stroke: var(--color-bg); stroke-width: 4px; stroke-linejoin: round;'
const plateWidth = (c: Placed) => Math.max(c.name.length * 7.2, c.pct.length * 12.5, (c.delta?.text.length ?? 0) * 6.5) + 18
/** The plate grows a line for the delta while the slider is off NOW. */
const plateHeight = (c: Placed) => (c.delta ? 52 : 40)
/** The lines under a margin callout's percentage: the move since the previous scan when shown, then fat and lean lbs. */
const tail = (c: Placed) => [
  ...(c.delta ? [{ text: c.delta.text, cls: c.delta.class }] : []),
  ...(c.fat ? [{ text: c.fat, cls: 'text-body' }] : []),
  ...(c.lean ? [{ text: c.lean, cls: 'text-body' }] : [])
]
// Margin blocks are set in monospace faces, so their width follows from the longest line. The
// leader stops at that edge rather than running on underneath the digits, and is left out when
// the body has turned its anchor inside the block.
const blockWidth = (c: Placed) => Math.max(c.name.length * 8.2, c.pct.length * 14.5, c.fat.length * 6.7, c.lean.length * 6.7, (c.delta?.text.length ?? 0) * 7)
const leaderEnd = (c: Placed) => (c.side === 'left' ? c.x + blockWidth(c) + 6 : c.x - blockWidth(c) - 6)
const leaderFits = (c: Placed) => (c.side === 'left' ? c.ax > leaderEnd(c) + 4 : c.ax < leaderEnd(c) - 4)
</script>

<template>
  <figure class="m-0">
    <div
      ref="stage"
      class="relative w-full aspect-3/4 bg-inset border border-line-soft select-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-accent"
      :class="flat ? '' : 'cursor-grab active:cursor-grabbing'"
      role="img"
      :aria-label="ariaLabel"
      tabindex="0"
      @keydown="onStageKey"
    >
      <span
        class="sr-only"
        aria-live="polite"
      >{{ highlightText }}</span>
      <p
        v-if="status !== 'ready'"
        class="absolute inset-0 flex items-center justify-center text-label tracking-[0.12em] uppercase text-faint"
      >
        {{ status === 'loading' ? 'loading body mesh ⟳' : 'webgl unavailable' }}
      </p>

      <!-- Callouts, projected from points on the body each time it turns or morphs -->
      <svg
        v-if="status === 'ready'"
        class="absolute inset-0 w-full h-full pointer-events-none"
        :viewBox="`0 0 ${size.w} ${size.h}`"
        aria-hidden="true"
      >
        <template
          v-for="c in placed"
          :key="c.key"
        >
          <!-- Compact: only the hovered region, as a plate at its anchor on the body -->
          <g
            v-if="compact"
            class="text-accent"
          >
            <template v-if="c.visible && lit === c.key">
              <rect
                :x="c.ax - plateWidth(c) / 2"
                :y="c.ay - 17"
                :width="plateWidth(c)"
                height="40"
                class="fill-bg stroke-accent"
                fill-opacity="0.82"
                stroke-width="1"
              />
              <text
                :x="c.ax"
                :y="c.ay - 4"
                text-anchor="middle"
                font-size="10"
                letter-spacing="1.5"
                fill="currentColor"
              >{{ c.name }}</text>
              <text
                :x="c.ax"
                :y="c.ay + 15"
                text-anchor="middle"
                font-size="18"
                font-weight="700"
                class="fill-hi font-display"
              >{{ c.pct }}</text>
            </template>
          </g>
          <g
            v-else-if="c.visible && c.side !== 'inside'"
            :class="lit === c.key ? 'text-accent' : 'text-dim'"
          >
            <line
              v-if="leaderFits(c)"
              :x1="c.ax"
              :y1="c.ay"
              :x2="leaderEnd(c)"
              :y2="c.y"
              stroke="currentColor"
              stroke-opacity="0.9"
              stroke-width="1"
            />
            <circle
              :cx="c.ax"
              :cy="c.ay"
              r="2.5"
              fill="currentColor"
            />
            <text
              :x="c.x"
              :y="c.y - 16"
              :text-anchor="c.side === 'left' ? 'start' : 'end'"
              font-size="11"
              letter-spacing="1.5"
              fill="currentColor"
              :style="HALO"
            >{{ c.name }}</text>
            <!-- The leader meets the block at the percentage's mid-height -->
            <text
              :x="c.x"
              :y="c.y + 8"
              :text-anchor="c.side === 'left' ? 'start' : 'end'"
              font-size="22"
              font-weight="700"
              class="fill-hi font-display"
              :style="HALO"
            >{{ c.pct }}</text>
            <text
              v-for="(l, i) in tail(c)"
              :key="i"
              :x="c.x"
              :y="c.y + 24 + 14 * i"
              :text-anchor="c.side === 'left' ? 'start' : 'end'"
              font-size="11"
              fill="currentColor"
              :class="l.cls"
              :style="HALO"
            >{{ l.text }}</text>
          </g>
          <g
            v-else-if="c.visible"
            :class="lit === c.key ? 'text-accent' : 'text-dim'"
          >
            <rect
              :x="c.x - plateWidth(c) / 2"
              :y="c.y - 17"
              :width="plateWidth(c)"
              :height="plateHeight(c)"
              class="fill-bg"
              :class="lit === c.key ? 'stroke-accent' : 'stroke-line-accent'"
              fill-opacity="0.82"
              stroke-width="1"
            />
            <text
              :x="c.x"
              :y="c.y - 4"
              text-anchor="middle"
              font-size="10"
              letter-spacing="1.5"
              fill="currentColor"
            >{{ c.name }}</text>
            <text
              :x="c.x"
              :y="c.y + 15"
              text-anchor="middle"
              font-size="18"
              font-weight="700"
              class="fill-hi font-display"
            >{{ c.pct }}</text>
            <text
              v-if="c.delta"
              :x="c.x"
              :y="c.y + 29"
              text-anchor="middle"
              font-size="10"
              fill="currentColor"
              :class="c.delta.class"
            >{{ c.delta.text }}</text>
          </g>
        </template>
        <template v-if="!compact">
          <text
            v-for="f in limbFigures.filter(l => l.visible)"
            :key="f.text"
            :x="f.x"
            :y="f.y"
            text-anchor="middle"
            font-size="11"
            class="fill-body"
            :style="HALO"
          >{{ f.text }}</text>
        </template>
      </svg>
    </div>

    <div
      v-if="!flat && !compact"
      class="flex flex-wrap items-center gap-1.5 mt-2.5"
    >
      <button
        v-for="v in VIEWS"
        :key="v.label"
        type="button"
        class="tui-btn"
        :class="Math.abs(yaw - v.yaw) < 0.01 && !auto ? 'tui-btn-accent' : ''"
        @click="view(v.yaw)"
      >
        {{ v.label }}
      </button>
      <button
        type="button"
        class="tui-btn ml-auto"
        :class="auto ? 'tui-btn-accent' : ''"
        @click="toggleAuto"
      >
        ⟳ {{ auto ? 'AUTO ON' : 'AUTO' }}
      </button>
    </div>

    <div
      v-if="canMorph && meshDates && !compact"
      class="mt-3"
    >
      <div class="flex items-baseline justify-between text-nano tracking-[0.12em] uppercase text-faint">
        <span :class="morph >= 0.5 ? 'text-hi' : ''">then · {{ formatDateTerse(props.dates.previous!) }}</span>
        <span :class="morph < 0.5 ? 'text-hi' : ''">now · {{ formatDateTerse(props.dates.latest) }}</span>
      </div>
      <USlider
        v-model="morphPct"
        :min="0"
        :max="100"
        :step="1"
        aria-label="Blend between the latest and the previous scan's body"
        class="mt-1.5"
      />
    </div>

    <figcaption
      v-if="!compact"
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mt-2.5 text-nano text-faint tracking-[0.06em] uppercase"
    >
      <span class="flex items-center gap-1.5">
        <span>fat %</span>
        <span>8</span>
        <span
          class="inline-block w-14 h-1.5"
          style="background: repeating-linear-gradient(180deg, rgba(232,179,75,0.9) 0 1px, transparent 1px 3px); opacity: 0.85;"
        />
        <span>35+</span>
      </span>
      <span>{{ hint }}</span>
    </figcaption>
  </figure>
</template>
