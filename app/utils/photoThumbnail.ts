// Client-side thumbnail generation - Cloudflare Workers has no sharp/native image resizing, so
// grids would otherwise load full-res originals (several MB each) just to show a tiny crop,
// which is what stalls the page once a category has 10+ photos. Using the browser's own decoder
// via createImageBitmap keeps this off the server entirely.
export async function createPhotoThumbnail(file: Blob, maxSize = 320): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Thumbnail encoding failed')),
        'image/jpeg',
        0.72
      )
    })
  }
  finally {
    bitmap.close()
  }
}
