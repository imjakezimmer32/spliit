/**
 * Upload storage backed by a Cloudflare R2 bucket binding (`UPLOADS`), used
 * when UPLOAD_STORAGE=r2. Objects are served back by /api/files/[key].
 */

export const R2_FILES_PATH = '/api/files/'
export const UPLOAD_KEY_PATTERN = /^document-[0-9A-Za-z:._-]{1,120}$/

type R2ObjectBody = {
  body: ReadableStream
  arrayBuffer(): Promise<ArrayBuffer>
  httpMetadata?: { contentType?: string }
}

export type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  get(key: string): Promise<R2ObjectBody | null>
}

export function isR2Storage() {
  return process.env.UPLOAD_STORAGE?.trim().toLowerCase() === 'r2'
}

export function getUploadsBucket(): R2BucketLike | undefined {
  const ctx = (
    globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>
  )[Symbol.for('__cloudflare-context__')]
  return ctx?.env?.UPLOADS as R2BucketLike | undefined
}

/** The R2 key of an /api/files/<key> URL, or null for any other URL. */
export function getR2KeyFromUrl(rawUrl: string): string | null {
  try {
    const { pathname } = new URL(rawUrl)
    if (!pathname.startsWith(R2_FILES_PATH)) return null
    const key = decodeURIComponent(pathname.slice(R2_FILES_PATH.length))
    return UPLOAD_KEY_PATTERN.test(key) ? key : null
  } catch {
    return null
  }
}

/**
 * The image URL to hand to the model. Images stored in R2 are inlined as a
 * base64 data URL, so the model never has to fetch from this app. Any other
 * URL is returned unchanged.
 */
export async function toModelImageUrl(imageUrl: string): Promise<string> {
  if (!isR2Storage()) return imageUrl
  const key = getR2KeyFromUrl(imageUrl)
  const bucket = getUploadsBucket()
  if (!key || !bucket) return imageUrl
  const object = await bucket.get(key)
  if (!object) return imageUrl
  const contentType = object.httpMetadata?.contentType ?? 'image/jpeg'
  const base64 = Buffer.from(await object.arrayBuffer()).toString('base64')
  return `data:${contentType};base64,${base64}`
}
