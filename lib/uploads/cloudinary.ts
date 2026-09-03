import { createHash } from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'
import { getUploadFolder, type UploadKind } from '@/lib/uploads/config'

let configured = false

function readEnv(name: string) {
  const value = process.env[name]
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function getCloudinaryCloudName() {
  return readEnv('CLOUDINARY_CLOUD_NAME')?.toLowerCase()
}

export function isCloudinaryConfigured() {
  return Boolean(getCloudinaryCloudName() && readEnv('CLOUDINARY_API_KEY') && readEnv('CLOUDINARY_API_SECRET'))
}

export function getCloudinary() {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.')
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: getCloudinaryCloudName(),
      api_key: readEnv('CLOUDINARY_API_KEY'),
      api_secret: readEnv('CLOUDINARY_API_SECRET'),
      secure: true,
    })
    configured = true
  }
  return cloudinary
}

function signParams(params: Record<string, string | number>) {
  const secret = readEnv('CLOUDINARY_API_SECRET')
  if (!secret) throw new Error('CLOUDINARY_API_SECRET is not set.')
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return createHash('sha1').update(`${payload}${secret}`).digest('hex')
}

export function createSignedUpload(input: {
  kind: UploadKind
  entityId: string
  publicId: string
}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const folder = getUploadFolder(input.kind, input.entityId)
  const params = {
    folder,
    public_id: input.publicId,
    timestamp,
  }
  return {
    cloudName: getCloudinaryCloudName()!,
    apiKey: readEnv('CLOUDINARY_API_KEY')!,
    timestamp,
    signature: signParams(params),
    folder,
    publicId: input.publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${getCloudinaryCloudName()}/auto/upload`,
  }
}

export function isOurCloudinaryUrl(url: string) {
  const cloudName = getCloudinaryCloudName()
  if (!cloudName) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com' && parsed.pathname.startsWith(`/${cloudName}/`)
  } catch {
    return false
  }
}

export async function destroyCloudinaryAsset(publicId: string) {
  if (!publicId.trim()) return
  const client = getCloudinary()
  for (const resourceType of ['image', 'raw', 'video'] as const) {
    try {
      const result = await client.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      })
      if (result?.result === 'ok') return
    } catch {
      // Try the next Cloudinary resource type.
    }
  }
}
