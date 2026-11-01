import { getUploadsBucket, UPLOAD_KEY_PATTERN } from '@/lib/r2-storage'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params
  const bucket = getUploadsBucket()
  if (!bucket || !UPLOAD_KEY_PATTERN.test(key)) {
    return new Response('Not found', { status: 404 })
  }
  const object = await bucket.get(key)
  if (!object) return new Response('Not found', { status: 404 })
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  })
}
