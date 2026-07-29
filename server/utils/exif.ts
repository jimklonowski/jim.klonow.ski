import exifr from 'exifr'

function toDateStr(d: Date): string {
  // Use local getters (not toISOString/UTC) - exifr builds this Date from EXIF's
  // timezone-less wall-clock fields via the local constructor, so reading it back
  // with local getters round-trips exactly instead of shifting a day on non-UTC runtimes.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function extractPhotoDate(data: ArrayBuffer | Uint8Array): Promise<string | null> {
  try {
    const tags = await exifr.parse(data, ['DateTimeOriginal', 'CreateDate'])
    const date = tags?.DateTimeOriginal ?? tags?.CreateDate
    return date instanceof Date ? toDateStr(date) : null
  }
  catch {
    return null
  }
}
