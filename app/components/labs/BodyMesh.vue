<script setup lang="ts">
import type { DexaEntry } from '~/composables/useDexaEntries'

// The scan on a body: public/models/body.glb (a CC0 MakeHuman mesh sized to Jim's numbers, built
// by scripts/body/build-body-glb.mjs) rendered with a phosphor scan-line shader — a screen-space
// raster whose brightness carries each DEXA region's fat %, a green rim, the android/gynoid band
// edges as green rules, and a sweeping beam. Two modes share everything but the camera:
//
//   turn  — perspective, drag to rotate, view buttons; labels hide as their region turns away
//   flat  — orthographic front view, no rotation: the body map, with the callouts the hand-drawn
//           SVG map used to carry (arms and legs on leaders in the margins, trunk and the two
//           bands on the body, R/L lean at the hands and feet)
//
// Hovering a region lights it and reports it through `highlight`, the same contract as BodyMap,
// so the regional table stays in step either way. When the mesh carries an earlier body as a
// morph target for the previous scan, a THEN/NOW slider blends shape, fat % and labels.
//
// three.js is imported lazily inside onMounted, so it is a separate chunk only this page pays for.

type Regions = DexaEntry['regions']
type RegionFigures = { fat_pct: number, fat_lbs: number, lean_lbs?: number }

const props = withDefaults(defineProps<{
  regions: Regions
  previousRegions?: Regions | null
  symmetry?: DexaEntry['symmetry']
  previousSymmetry?: DexaEntry['symmetry']
  /** Scan dates, matched against the mesh's own base/alt dates before the morph slider shows. */
  dates: { latest: string, previous?: string | null }
  mode?: 'turn' | 'flat'
}>(), { previousRegions: null, symmetry: undefined, previousSymmetry: undefined, mode: 'turn' })
const emit = defineEmits<{ unsupported: [] }>()
const highlight = defineModel<string | null>('highlight', { default: null })

const stage = ref<HTMLDivElement>()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const size = ref({ w: 300, h: 400 })
const yaw = ref(0.55)
/** Turning on load; a drag or a view button takes over. Reduced motion shows the front view, still. */
const auto = ref(true)
/** 0 = the latest body, 1 = the previous one. */
const morph = ref(0)
const meshDates = ref<{ base: string, alt: string | null } | null>(null)
const canMorph = computed(() => !!meshDates.value?.alt && meshDates.value.base === props.dates.latest && meshDates.value.alt === props.dates.previous)
// The slider runs in time order, THEN on the left and NOW on the right, so its value is the inverse
// of the morph weight.
const morphPct = computed({
  get: () => Math.round((1 - morph.value) * 100),
  set: (v: number) => {
    morph.value = 1 - v / 100
  }
})
const flat = computed(() => props.mode === 'flat')

const REGION_IDS: Record<string, number> = { arms: 1, legs: 2, trunk: 3, android: 4, gynoid: 5 }
const ID_REGIONS = Object.fromEntries(Object.entries(REGION_IDS).map(([k, v]) => [v, k]))

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
const regionsShown = computed(() => (canMorph.value && morph.value >= 0.5 && props.previousRegions ? props.previousRegions : props.regions))
const figures = (key: string) => (regionsShown.value as Record<string, RegionFigures | undefined>)[key]
const fatPct = (regions: Regions | null | undefined, key: string) => ((regions as Record<string, RegionFigures | undefined> | null | undefined)?.[key]?.fat_pct ?? 0)

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
  uniform float uHighlight;
  uniform float uTime;
  uniform float uBeam;
  uniform float uDpr;
  uniform float uOrtho;
  varying vec3 vPosLocal;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec4 vColor;

  float wash(float fat) { return 0.18 + 0.72 * clamp((fat - 8.0) / 27.0, 0.0, 1.0); }

  void main() {
    float region = floor(vColor.r * 255.0 + 0.5);
    float band = floor(vColor.g * 255.0 + 0.5);
    float fat = region < 0.5 ? 0.0 : uFat[int(region)];
    if (band > 0.5) fat = uBandFat[int(band)];

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
    vec3 surface = vec3(0.039, 0.059, 0.047);
    vec3 amber = vec3(0.910, 0.702, 0.294);
    vec3 green = vec3(0.173, 0.910, 0.643);
    float w = region < 0.5 ? 0.10 : wash(fat);
    float shade = 0.55 + 0.45 * lambert;
    vec3 col = surface + amber * (w * shade) * (0.14 + 0.86 * line);

    bool lit = (uHighlight > 0.5 && uHighlight < 3.5 && abs(region - uHighlight) < 0.5)
      || (uHighlight > 3.5 && abs(band - (uHighlight - 3.0)) < 0.5);
    float hl = lit ? 1.0 : 0.0;
    col += green * 0.16 * hl;
    col += green * fresnel * (0.32 + 0.4 * hl);

    // Band edges as thin green rules, like the dashed ROI boxes on the flat map.
    float e = 0.0028;
    float edge = step(abs(vPosLocal.y - uAndroid.x), e) + step(abs(vPosLocal.y - uAndroid.y), e)
      + step(abs(vPosLocal.y - uGynoid.x), e) + step(abs(vPosLocal.y - uGynoid.y), e);
    col = mix(col, green * 0.85, clamp(edge, 0.0, 1.0) * 0.85);

    float beamY = mod(uTime * 0.32, 1.0) * 2.1 - 0.1;
    float beam = smoothstep(0.035, 0.0, abs(vPosLocal.y - beamY)) * uBeam;
    col += green * beam * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`

let dispose: (() => void) | null = null

onMounted(async () => {
  const host = stage.value
  if (!host) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Reduced motion: no turning, and a straight-on front view rather than the three-quarter one.
  if (reducedMotion) {
    auto.value = false
    yaw.value = 0
  }
  try {
    const THREE = await import('three')
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')

    const probe = document.createElement('canvas')
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) {
      status.value = 'error'
      emit('unsupported')
      return
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    const el = renderer.domElement
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.display = 'block'
    el.style.touchAction = 'none'
    host.appendChild(el)

    const gltf = await new GLTFLoader().loadAsync('/models/body.glb')
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

    const extras = (source.userData ?? {}) as { base?: string, alt?: string | null, height?: number, bands?: { android: number[], gynoid: number[] }, landmarks?: { armpit?: number, crotch?: number } }
    meshDates.value = { base: extras.base ?? '', alt: extras.alt ?? null }
    const height = extras.height ?? 1.87
    const bands = extras.bands ?? { android: [1.1, 1.21], gynoid: [0.72, 0.94] }
    const armpit = extras.landmarks?.armpit ?? 1.43
    const crotch = extras.landmarks?.crotch ?? 0.93

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
      { key: 'trunk', name: 'TRUNK', side: 'inside', anchor: [0, (armpit + bands.android[1]!) / 2 + 0.02, 0.12] },
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
      uHighlight: { value: -1 },
      uTime: { value: 0 },
      uBeam: { value: reducedMotion ? 0 : 1 },
      uDpr: { value: renderer.getPixelRatio() },
      uOrtho: { value: flat.value ? 1 : 0 }
    }
    const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, vertexColors: true })
    const mesh = new THREE.Mesh(geometry, material)
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
        const x = c.side === 'left' ? MARGIN : c.side === 'right' ? size.value.w - MARGIN : a.x
        return {
          ...c,
          ax: a.x,
          ay: a.y,
          x,
          y: a.y,
          pct: f ? `${fmt(f.fat_pct)}%` : '—',
          fat: f ? `${fmt(f.fat_lbs)} fat` : '',
          lean: f?.lean_lbs != null ? `${fmt(f.lean_lbs)} lean` : '',
          visible: facing(c.anchor)
        }
      })
      // The R/L lean figures follow the slider like the regions do, from whichever scan is showing.
      const s = canMorph.value && morph.value >= 0.5 ? props.previousSymmetry : props.symmetry
      limbFigures.value = s
        ? ([
            ['rightHand', `R ${fmt(s.right_arm_lean)}`],
            ['leftHand', `L ${fmt(s.left_arm_lean)}`],
            ['rightFoot', `R ${fmt(s.right_leg_lean)}`],
            ['leftFoot', `L ${fmt(s.left_leg_lean)}`]
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

    // Pointer: in turn mode a drag turns the body; a still pointer picks the region under it.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let drag: { x: number, yaw: number } | null = null
    // face.a is already a vertex index (the raycaster resolves the index buffer).
    const pickAt = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(mesh, false)[0]
      if (!hit?.face) return null
      const vi = hit.face.a
      const band = Math.round(colorAttr.getY(vi) * 255)
      return band > 0 ? ID_REGIONS[band + 3] ?? null : ID_REGIONS[regionOf(vi)] ?? null
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
    const onDown = (e: PointerEvent) => {
      if (flat.value) return
      el.setPointerCapture(e.pointerId)
      drag = { x: e.clientX, yaw: yaw.value }
      auto.value = false
    }
    const onMove = (e: PointerEvent) => {
      if (drag) {
        yaw.value = drag.yaw + (e.clientX - drag.x) * 0.012
        return
      }
      highlight.value = pick(e)
    }
    const onUp = () => {
      drag = null
    }
    const onLeave = () => {
      drag = null
      highlight.value = null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('pointerleave', onLeave)

    const stopHighlight = watch(highlight, (key) => {
      uniforms.uHighlight.value = key ? REGION_IDS[key] ?? -1 : -1
    }, { immediate: true })
    const stopLabels = watch([yaw, morph, regionsShown], placeLabels)

    const timer = new THREE.Timer()
    let raf = 0
    const loop = () => {
      timer.update()
      const dt = timer.getDelta()
      // About twelve seconds per turn.
      if (auto.value && !drag && !flat.value) yaw.value += dt * 0.5
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

    dispose = () => {
      cancelAnimationFrame(raf)
      stopHighlight()
      stopLabels()
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerleave', onLeave)
      material.dispose()
      geometry.dispose()
      renderer.dispose()
      el.remove()
    }
  }
  catch (err) {
    console.error('[body mesh]', err)
    status.value = 'error'
    emit('unsupported')
  }
})

onBeforeUnmount(() => dispose?.())

const VIEWS = [
  { label: 'FRONT', yaw: 0 },
  { label: '¾', yaw: 0.55 },
  { label: 'SIDE', yaw: Math.PI / 2 },
  { label: 'BACK', yaw: Math.PI }
]
function view(v: number) {
  yaw.value = v
  auto.value = false
}

// Text over the body gets a surface-colour halo so it clears contrast on any shade, and the
// on-body labels sit on a backplate so the raster doesn't run through the digits.
const HALO = 'paint-order: stroke; stroke: #070a09; stroke-width: 4px; stroke-linejoin: round;'
const plateWidth = (c: Placed) => Math.max(c.name.length * 7.2, c.pct.length * 12.5) + 18
// Margin blocks are set in monospace faces, so their width follows from the longest line. The
// leader stops at that edge rather than running on underneath the digits, and is left out when
// the body has turned its anchor inside the block.
const blockWidth = (c: Placed) => Math.max(c.name.length * 8.2, c.pct.length * 14.5, c.fat.length * 6.7, c.lean.length * 6.7)
const leaderEnd = (c: Placed) => (c.side === 'left' ? c.x + blockWidth(c) + 6 : c.x - blockWidth(c) - 6)
const leaderFits = (c: Placed) => (c.side === 'left' ? c.ax > leaderEnd(c) + 4 : c.ax < leaderEnd(c) - 4)
</script>

<template>
  <figure class="m-0">
    <div
      ref="stage"
      class="relative w-full aspect-3/4 bg-inset border border-line-soft select-none overflow-hidden"
      :class="flat ? '' : 'cursor-grab active:cursor-grabbing'"
    >
      <p
        v-if="status !== 'ready'"
        class="absolute inset-0 flex items-center justify-center text-[10.5px] tracking-[0.12em] uppercase text-faint"
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
          <g
            v-if="c.visible && c.side !== 'inside'"
            :class="highlight === c.key ? 'text-accent' : 'text-dim'"
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
              :x="c.x"
              :y="c.y + 24"
              :text-anchor="c.side === 'left' ? 'start' : 'end'"
              font-size="11"
              class="fill-body"
              :style="HALO"
            >{{ c.fat }}</text>
            <text
              v-if="c.lean"
              :x="c.x"
              :y="c.y + 38"
              :text-anchor="c.side === 'left' ? 'start' : 'end'"
              font-size="11"
              class="fill-body"
              :style="HALO"
            >{{ c.lean }}</text>
          </g>
          <g
            v-else-if="c.visible"
            :class="highlight === c.key ? 'text-accent' : 'text-dim'"
          >
            <rect
              :x="c.x - plateWidth(c) / 2"
              :y="c.y - 17"
              :width="plateWidth(c)"
              height="40"
              fill="#070a09"
              fill-opacity="0.82"
              :stroke="highlight === c.key ? '#2ce8a4' : '#24382f'"
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
          </g>
        </template>
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
      </svg>
    </div>

    <div
      v-if="!flat"
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
        @click="auto = !auto"
      >
        ⟳ {{ auto ? 'AUTO ON' : 'AUTO' }}
      </button>
    </div>

    <div
      v-if="canMorph && meshDates"
      class="mt-3"
    >
      <div class="flex items-baseline justify-between text-[9.5px] tracking-[0.12em] uppercase text-faint">
        <span :class="morph >= 0.5 ? 'text-hi' : ''">then · {{ formatDateTerse(meshDates.alt!) }}</span>
        <span :class="morph < 0.5 ? 'text-hi' : ''">now · {{ formatDateTerse(meshDates.base) }}</span>
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

    <figcaption class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mt-2.5 text-[9.5px] text-faint tracking-[0.06em] uppercase">
      <span class="flex items-center gap-1.5">
        <span>fat %</span>
        <span>8</span>
        <span
          class="inline-block w-14 h-1.5"
          style="background: repeating-linear-gradient(180deg, rgba(232,179,75,0.9) 0 1px, transparent 1px 3px); opacity: 0.85;"
        />
        <span>35+</span>
      </span>
      <span>{{ flat ? 'R / L figures · lean lbs' : 'drag to turn · hover a region' }}</span>
    </figcaption>
  </figure>
</template>
