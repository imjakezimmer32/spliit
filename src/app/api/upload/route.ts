import { effectiveBaseUrl } from '@/lib/env'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { getUploadsBucket, isR2Storage, R2_FILES_PATH } from '@/lib/r2-storage'
import { randomId } from '@/lib/random'

const MAX_BYTES = 10 * 1024 * 1024
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

export async function POST(request: Request) {
  const flags = await getRuntimeFeatureFlags()
  const bucket = getUploadsBucket()
  if (
    !isR2Storage() ||
    !bucket ||
    !(
      flags.enableExpenseDocuments ||
      flags.enableReceiptExtract ||
      flags.enableReceiptClaims
    )
  ) {
    return Response.json({ error: 'Uploads are disabled.' }, { status: 404 })
  }

  const contentType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const extension = EXTENSIONS[contentType]
  if (!extension) {
    return Response.json({ error: 'Unsupported file type.' }, { status: 415 })
  }

  const body = await request.arrayBuffer()
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) {
    return Response.json({ error: 'File too large.' }, { status: 413 })
  }

  const timestamp = new Date().toISOString().replace(/[:]/g, '-')
  const key = `document-${timestamp}-${randomId()}${extension}`
  await bucket.put(key, body, { httpMetadata: { contentType } })

  const base = (effectiveBaseUrl || new URL(request.url).origin).replace(
    /\/+$/,
    '',
  )
  return Response.json({ key, url: `${base}${R2_FILES_PATH}${key}` })
}
