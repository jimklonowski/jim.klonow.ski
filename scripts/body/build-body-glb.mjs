// Turns MakeHuman OBJ exports into the DEXA page's body mesh.
//
//   node scripts/body/build-body-glb.mjs <base.obj> <base-date> [<alt.obj> <alt-date>] [--out public/models/body.glb]
//
// The base body (the latest scan's proportions) becomes the mesh; an optional earlier body with
// the SAME topology — every MakeHuman export shares the base mesh's 13,380 vertices — becomes a
// morph target, so the viewer can slide between then and now. Each vertex is labelled with its
// DEXA region in COLOR_0 (r = region: 0 head, 1 arms, 2 legs, 3 trunk; g = band: 0 none,
// 1 android, 2 gynoid), found from the mesh itself the way the scanner draws its ROI lines:
// the arm cut at the shoulder joint, the leg cut running from the crotch out to the hips, the
// android region 20 % of pelvis-to-chin above the pelvis, the gynoid 1.5 android-heights below
// it and twice as tall. The landmark heights land in the mesh extras for the viewer's band lines.
//
// Landmarks come from slicing the TRIANGLES with horizontal planes, not from clustering vertices:
// MakeHuman's torso is sparsely meshed and its hands and head densely, so vertex gaps say nothing
// about where one body part ends and the air begins, while a plane's cross-section loops do.
//
// The meshes are generic CC0 bodies sized from numbers already on the site, so the output can
// ship as a static asset. Never run this on a real body scan and leave the result under public/.
import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { quantize } from '@gltf-transform/functions'

const REGION = { head: 0, arms: 1, legs: 2, trunk: 3 }
const BAND = { none: 0, android: 1, gynoid: 2 }

/** Slice spacing in metres. */
const SLICE = 0.01
/** Below this fraction of the height everything is feet and legs; loops there are never arms. */
const FEET_ZONE = 0.25

function parseObj(file) {
  const positions = []
  const normals = []
  const faces = []
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/)
      positions.push([+x, +y, +z])
    }
    else if (line.startsWith('vn ')) {
      const [, x, y, z] = line.trim().split(/\s+/)
      normals.push([+x, +y, +z])
    }
    else if (line.startsWith('f ')) {
      faces.push(line.slice(2).trim().split(/\s+/).map((t) => {
        const [v, , vn] = t.split('/')
        return { v: +v - 1, vn: vn ? +vn - 1 : +v - 1 }
      }))
    }
  }
  return { positions, normals, faces }
}

/** Unique (position, normal) pairs become the glTF vertices; faces fan-triangulate. */
function index(obj) {
  const key = new Map()
  const verts = []
  const tris = []
  const vertex = (c) => {
    const k = `${c.v}/${c.vn}`
    let i = key.get(k)
    if (i === undefined) {
      i = verts.length
      key.set(k, i)
      verts.push(c)
    }
    return i
  }
  for (const face of obj.faces) {
    const ids = face.map(vertex)
    for (let i = 1; i + 1 < ids.length; i++) tris.push(ids[0], ids[i], ids[i + 1])
  }
  return { verts, tris }
}

// --- cross-sections ------------------------------------------------------------------------------

/**
 * The closed loops where the plane y = h cuts the surface: each loop is one body part's outline
 * at that height, with its x-extent and the (x, z) points along it. Position-indexed triangles
 * (OBJ vertex ids) so shared edges match exactly and loops close.
 */
function sliceLoops(positions, triangles, h) {
  const edgePoint = new Map()
  const parent = new Map()
  const find = (k) => {
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k)))
      k = parent.get(k)
    }
    return k
  }
  const union = (a, b) => parent.set(find(a), find(b))
  const cross = (i, j) => {
    const a = positions[i], b = positions[j]
    if ((a[1] <= h) === (b[1] <= h)) return null
    const k = i < j ? `${i}-${j}` : `${j}-${i}`
    if (!edgePoint.has(k)) {
      const t = (h - a[1]) / (b[1] - a[1])
      edgePoint.set(k, [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t])
      parent.set(k, k)
    }
    return k
  }
  for (let t = 0; t < triangles.length; t += 3) {
    const [i, j, k] = [triangles[t], triangles[t + 1], triangles[t + 2]]
    const keys = [cross(i, j), cross(j, k), cross(k, i)].filter(Boolean)
    if (keys.length === 2) union(keys[0], keys[1])
  }
  const loops = new Map()
  for (const [k, p] of edgePoint) {
    const root = find(k)
    const loop = loops.get(root) ?? { points: [], min: Infinity, max: -Infinity }
    loop.points.push(p)
    loop.min = Math.min(loop.min, p[0])
    loop.max = Math.max(loop.max, p[0])
    loops.set(root, loop)
  }
  return [...loops.values()].filter(l => l.points.length >= 3).sort((a, b) => a.min - b.min)
}

/**
 * Which loops of a slice are the body (trunk, or two legs / two feet) and which are arms: the
 * loop straddling the centre line, or the nearest one on each side when the centre falls in the
 * gap between the legs. In the feet zone nothing is an arm, whatever the toes do.
 */
function classify(loops, inFeetZone) {
  let body = loops.filter(l => l.min <= 0 && l.max >= 0)
  if (!body.length) {
    const left = loops.filter(l => l.max < 0).at(-1)
    const right = loops.find(l => l.min > 0)
    body = [left, right].filter(Boolean)
  }
  const arms = inFeetZone ? [] : loops.filter(l => !body.includes(l))
  for (const l of loops) l.arm = arms.includes(l)
  return { body, arms }
}

function landmarks(positions, triangles) {
  const ys = positions.map(p => p[1])
  const floor = Math.min(...ys)
  const top = Math.max(...ys)
  const H = top - floor
  const slices = []
  for (let k = 0; floor + k * SLICE < top; k++) {
    const y = floor + k * SLICE
    const loops = sliceLoops(positions, triangles, y)
    slices.push({ y, loops, ...classify(loops, y < floor + FEET_ZONE * H) })
  }
  const at = y => slices[Math.min(slices.length - 1, Math.max(0, Math.round((y - floor) / SLICE)))]
  const bodyWidth = s => s.body.reduce((w, l) => w + (l.max - l.min), 0)

  // Crotch: going up the legs, the first slice where the two body loops have become one.
  let crotch = null
  let seenTwoLegs = false
  for (const s of slices) {
    if (s.y < floor + 0.3 * H) continue
    if (s.body.length >= 2) seenTwoLegs = true
    else if (seenTwoLegs && s.body.length === 1) {
      crotch = s.y
      break
    }
  }
  // Armpit: going up the torso with the arms hanging clear, the first slice where they have
  // joined the trunk. Separate shoulder-cap loops higher up don't reopen the search.
  let armpit = null
  let seenArms = false
  for (const s of slices) {
    if (s.y < floor + 0.55 * H) continue
    if (s.arms.length >= 2) seenArms = true
    else if (seenArms && s.arms.length === 0) {
      armpit = s.y
      break
    }
  }
  if (crotch == null || armpit == null) throw new Error(`Could not find the crotch (${crotch}) or armpit (${armpit}) — is the body in an A-pose with feet apart?`)
  // The trunk's half-width just under the armpit: the deltoids above it that reach past this are arms.
  const under = at(armpit - 2 * SLICE)
  const torsoHalfWidth = Math.max(...under.body.flatMap(l => [Math.abs(l.min), Math.abs(l.max)]))
  // Neck: the narrowest single loop between the shoulders and the head; the chin sits just above it.
  const neck = slices.filter(s => s.y > armpit + 0.03 && s.y < floor + 0.93 * H && s.body.length === 1).reduce((best, s) => (bodyWidth(s) < bodyWidth(best) ? s : best))
  const chin = neck.y + 0.015
  // Waist: the narrowest trunk slice between the hips and the armpit (informational — on a
  // muscular build it sits under the ribs, well above the pelvis).
  const waist = slices.filter(s => s.y > crotch + 0.08 && s.y < armpit - 0.08).reduce((best, s) => (bodyWidth(s) < bodyWidth(best) ? s : best))
  // The scanner's pelvis cut is the top of the iliac crest, which stands at a very steady
  // 0.59 of stature in adults (iliocristale height), so it comes from the height, not the shape.
  const pelvisCut = floor + 0.59 * H
  const androidHeight = 0.2 * (chin - pelvisCut)
  const android = [pelvisCut, pelvisCut + androidHeight]
  const gynoidTop = pelvisCut - 1.5 * androidHeight
  const gynoid = [gynoidTop - 2 * androidHeight, gynoidTop]

  return { floor, top, height: H, crotch, armpit, torsoHalfWidth, neck: neck.y, chin, waist: waist.y, pelvisCut, android, gynoid, slices, at }
}

function label(positions, lm) {
  // A vertex belongs to whichever loop of its slice passes closest to it in (x, z): vertices sit
  // on the surface, so the right loop is millimetres away and any other centimetres.
  const nearestLoop = (p) => {
    const s = lm.at(p[1])
    let best = null
    let bestD = Infinity
    for (const l of s.loops) {
      for (const q of l.points) {
        const d = (q[0] - p[0]) ** 2 + (q[1] - p[2]) ** 2
        if (d < bestD) {
          bestD = d
          best = l
        }
      }
    }
    return best
  }
  // Above the armpit the scanner's arm line angles inward from the armpit through the shoulder
  // joint, so the whole shoulder cap is arm. A vertical cut at the torso's width instead sliced
  // the deltoid dome in two, which showed as a dark disc on each shoulder when the arms lit up.
  const shoulderCut = y => Math.max(lm.torsoHalfWidth - 0.06, lm.torsoHalfWidth - 0.5 * (y - lm.armpit))
  return positions.map((p) => {
    const [x, y] = p
    if (y > lm.chin) return REGION.head
    if (y >= lm.armpit ? Math.abs(x) > shoulderCut(y) : nearestLoop(p)?.arm) return REGION.arms
    // The leg cut runs diagonally from the crotch out to the hips, so the lateral hip is leg.
    if (y < lm.crotch + Math.max(0, Math.abs(x) - 0.03)) return REGION.legs
    return REGION.trunk
  })
}

/**
 * Where two surfaces run a centimetre apart — the slice just under the armpit, the crotch, the
 * chin — the nearest loop is a coin toss, and a few vertices land on the wrong side: three per
 * deltoid, which showed as unlit dots whenever the arms lit up. A vertex whose surface
 * neighbours all but one agree on another region takes theirs. Genuine boundaries, where the
 * neighbours split evenly, stay where they are.
 */
function smooth(regions, positionTris) {
  const adj = regions.map(() => new Set())
  for (let t = 0; t < positionTris.length; t += 3) {
    const [a, b, c] = [positionTris[t], positionTris[t + 1], positionTris[t + 2]]
    adj[a].add(b).add(c)
    adj[b].add(a).add(c)
    adj[c].add(a).add(b)
  }
  let flipped = 0
  for (let pass = 0; pass < 3; pass++) {
    const next = regions.slice()
    regions.forEach((r, i) => {
      const nb = [...adj[i]]
      if (nb.length < 3) return
      const counts = new Map()
      for (const j of nb) counts.set(regions[j], (counts.get(regions[j]) ?? 0) + 1)
      const [top, n] = [...counts].reduce((best, e) => (e[1] > best[1] ? e : best))
      if (top !== r && n >= nb.length - 1) {
        next[i] = top
        flipped++
      }
    })
    if (next.every((r, i) => r === regions[i])) break
    regions = next
  }
  return { regions, flipped }
}

function bandOf(region, y, lm) {
  if (region === REGION.trunk && y >= lm.android[0] && y < lm.android[1]) return BAND.android
  if ((region === REGION.trunk || region === REGION.legs) && y >= lm.gynoid[0] && y < lm.gynoid[1]) return BAND.gynoid
  return BAND.none
}

async function main() {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : 'public/models/body.glb'
  const [baseFile, baseDate, altFile, altDate] = args
  if (!baseFile || !baseDate) {
    console.error('usage: node scripts/body/build-body-glb.mjs <base.obj> <YYYY-MM-DD> [<alt.obj> <YYYY-MM-DD>] [--out file.glb]')
    process.exit(1)
  }

  const base = parseObj(baseFile)
  const { verts, tris } = index(base)
  const alt = altFile ? parseObj(altFile) : null
  if (alt) {
    const same = alt.faces.length === base.faces.length && alt.positions.length === base.positions.length
      && alt.faces.every((f, i) => f.length === base.faces[i].length && f.every((c, j) => c.v === base.faces[i][j].v))
    if (!same) throw new Error('The alternate body does not share the base body\'s topology')
  }

  // Slicing works on the OBJ's shared positions, so faces are triangulated by position id here.
  const positionTris = []
  for (const face of base.faces) for (let i = 1; i + 1 < face.length; i++) positionTris.push(face[0].v, face[i].v, face[i + 1].v)
  const lm = landmarks(base.positions, positionTris)
  const { regions, flipped } = smooth(label(base.positions, lm), positionTris)
  const labels = regions.map((region, i) => ({ region, band: bandOf(region, base.positions[i][1], lm) }))

  const n = verts.length
  const position = new Float32Array(n * 3)
  const normal = new Float32Array(n * 3)
  const color = new Uint8Array(n * 4)
  const dPosition = alt ? new Float32Array(n * 3) : null
  const dNormal = alt ? new Float32Array(n * 3) : null
  verts.forEach((c, i) => {
    position.set(base.positions[c.v], i * 3)
    normal.set(base.normals[c.vn] ?? [0, 1, 0], i * 3)
    color.set([labels[c.v].region, labels[c.v].band, 0, 255], i * 4)
    if (alt) {
      const p = alt.positions[c.v], q = base.positions[c.v]
      dPosition.set([p[0] - q[0], p[1] - q[1], p[2] - q[2]], i * 3)
      const a = alt.normals[c.vn] ?? [0, 1, 0], b = base.normals[c.vn] ?? [0, 1, 0]
      dNormal.set([a[0] - b[0], a[1] - b[1], a[2] - b[2]], i * 3)
    }
  })

  const doc = new Document()
  const buffer = doc.createBuffer()
  const acc = (name, type, array, normalized = false) => doc.createAccessor(name).setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer)
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('position', 'VEC3', position))
    .setAttribute('NORMAL', acc('normal', 'VEC3', normal))
    .setAttribute('COLOR_0', acc('region', 'VEC4', color, true))
    .setIndices(acc('indices', 'SCALAR', n < 65535 ? Uint16Array.from(tris) : Uint32Array.from(tris)))
  if (alt) {
    prim.addTarget(doc.createPrimitiveTarget(altDate)
      .setAttribute('POSITION', acc('alt-position', 'VEC3', dPosition))
      .setAttribute('NORMAL', acc('alt-normal', 'VEC3', dNormal)))
  }
  const round = v => +v.toFixed(4)
  const mesh = doc.createMesh('body').addPrimitive(prim).setExtras({
    base: baseDate,
    alt: altDate ?? null,
    height: round(lm.height),
    landmarks: Object.fromEntries(['crotch', 'armpit', 'torsoHalfWidth', 'neck', 'chin', 'waist', 'pelvisCut'].map(k => [k, round(lm[k])])),
    bands: { android: lm.android.map(round), gynoid: lm.gynoid.map(round) },
    regions: { 0: 'head', 1: 'arms', 2: 'legs', 3: 'trunk' },
    bandIds: { 1: 'android', 2: 'gynoid' },
    source: 'MakeHuman Community 1.3 (CC0 export), labelled by scripts/body/build-body-glb.mjs'
  })
  if (alt) mesh.setWeights([0])
  const scene = doc.createScene('body')
  scene.addChild(doc.createNode('body').setMesh(mesh))

  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }))

  fs.mkdirSync(path.dirname(out), { recursive: true })
  await new NodeIO().write(out, doc)

  const tally = pick => labels.reduce((acc, l) => {
    acc[pick(l)] = (acc[pick(l)] ?? 0) + 1
    return acc
  }, {})
  const counts = tally(l => l.region)
  const bandCounts = tally(l => l.band)
  console.log(`wrote ${out} — ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${n} vertices, ${tris.length / 3} triangles${alt ? `, morph target ${altDate}` : ''}`)
  console.log('landmarks (m):', Object.fromEntries(['height', 'crotch', 'armpit', 'torsoHalfWidth', 'neck', 'chin', 'waist', 'pelvisCut'].map(k => [k, +lm[k].toFixed(3)])), 'android', lm.android.map(v => +v.toFixed(3)), 'gynoid', lm.gynoid.map(v => +v.toFixed(3)))
  console.log('vertices per region:', { head: counts[0] ?? 0, arms: counts[1] ?? 0, legs: counts[2] ?? 0, trunk: counts[3] ?? 0 }, `(${flipped} relabelled to match their neighbours)`)
  console.log('vertices per band:', { android: bandCounts[1] ?? 0, gynoid: bandCounts[2] ?? 0 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
