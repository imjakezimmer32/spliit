'use client'

import { usePresignedUpload } from 'next-s3-upload'

/**
 * Same shape as next-s3-upload's `usePresignedUpload`. When the app is built
 * with NEXT_PUBLIC_UPLOAD_STORAGE=r2 (Cloudflare Workers deployment), files are
 * POSTed to /api/upload, which stores them in an R2 bucket binding, instead of
 * being PUT to a presigned S3 URL.
 */
export function useUpload() {
  const presigned = usePresignedUpload()
  if (process.env.NEXT_PUBLIC_UPLOAD_STORAGE !== 'r2') return presigned
  return {
    ...presigned,
    uploadToS3: async (file: File) => {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name || 'upload'),
        },
        body: file,
      })
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`)
      }
      return (await response.json()) as { url: string; key: string }
    },
  }
}
