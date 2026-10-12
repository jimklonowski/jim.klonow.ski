// An opaque tag for a DEXA scan date, for the body mesh's extras. public/models/body.glb is a
// static asset served without a session, so the dates of the scans it was built from stay out of
// it: the build script (scripts/body/build-body-glb.mjs) writes tags, and the viewer
// (app/components/labs/BodyMesh.vue) matches the tag of each scan on screen against them to
// decide whether the morph slider applies. FNV-1a over the date string — not a secret, just not
// the date. App-import-free, so the build script and the plain-node tests can run it.
export function scanTag(date: string): string {
  let h = 0x811C9DC5
  for (const ch of `body-scan:${date}`) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
