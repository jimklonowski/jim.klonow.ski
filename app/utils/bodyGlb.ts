// public/models/body.glb, fetched, parsed and baked to metres ONCE per page load. The DEXA page
// remounts LabsBodyMesh on every 3D/FLAT switch (`:key="bodyView"`) and the home page mounts it
// when it scrolls into reach, and each mount used to download the file and bake it again (audit
// #42 item 42). A mount takes a clone of the baked geometry, so it still owns and disposes its
// own copy with its renderer; the shared one stays for the next mount.
import type { BufferGeometry } from 'three'

/** What scripts/body/build-body-glb.mjs writes into the mesh's extras. */
export interface BodyExtras {
  base?: string
  alt?: string | null
  height?: number
  bands?: { android: number[], gynoid: number[] }
  landmarks?: { armpit?: number, crotch?: number, chin?: number, torsoHalfWidth?: number }
}

export interface BodyModel {
  /** Positions (and morph deltas) in metres, bounds computed. Clone before mutating. */
  geometry: BufferGeometry
  extras: BodyExtras
}

let loading: Promise<BodyModel> | null = null

/** The baked body model, loaded once; a failed load is forgotten so the next mount can retry. */
export function loadBodyModel(): Promise<BodyModel> {
  loading ??= load().catch((err: unknown) => {
    loading = null
    throw err
  })
  return loading
}

async function load(): Promise<BodyModel> {
  const THREE = await import('three')
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
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

  return { geometry, extras: (source.userData ?? {}) as BodyExtras }
}
