const MAX_SIDE = 2048
const JPEG_QUALITY = 0.85

/**
 * Shrinks a photo so its longest side is at most 2048px and re-encodes it as
 * JPEG, which keeps uploads small on mobile data. Returns the original file
 * when anything goes wrong, so a failed resize never blocks the upload.
 */
export async function downscaleImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file

    // JPEG has no alpha channel; paint white so transparent PNGs don't go black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return file
    return new File([blob], 'receipt.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
