import { MAX_UPLOAD_BYTES, resolveUploadMime, type UploadKind } from '@/lib/uploads/config'

export type UploadedFile = {
  url: string
  publicId: string
  bytes: number
  mimeType: string
  originalName: string
  label: string
}

export async function uploadWorkspaceFile(file: File, kind: UploadKind, entityId: string): Promise<UploadedFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Files must be 25 MB or smaller.')
  }
  const mimeType = resolveUploadMime(file.type, file.name)
  if (!mimeType) {
    throw new Error('That file type is not allowed. Use PDF, Office, image, CSV, or text files.')
  }

  const signResponse = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      entityId,
      fileName: file.name,
      mimeType,
      bytes: file.size,
    }),
  })
  const signed = (await signResponse.json()) as {
    error?: string
    cloudName?: string
    apiKey?: string
    timestamp?: number
    signature?: string
    folder?: string
    publicId?: string
    uploadUrl?: string
  }
  if (!signResponse.ok || signed.error || !signed.uploadUrl || !signed.apiKey || !signed.signature || !signed.folder || !signed.publicId || !signed.timestamp) {
    throw new Error(signed.error ?? 'Could not start the upload.')
  }

  const payload = new FormData()
  payload.append('file', file)
  payload.append('api_key', signed.apiKey)
  payload.append('timestamp', String(signed.timestamp))
  payload.append('signature', signed.signature)
  payload.append('folder', signed.folder)
  payload.append('public_id', signed.publicId)

  const uploadResponse = await fetch(signed.uploadUrl, { method: 'POST', body: payload })
  const uploaded = (await uploadResponse.json()) as {
    error?: { message?: string }
    secure_url?: string
    public_id?: string
    bytes?: number
    original_filename?: string
  }
  if (!uploadResponse.ok || !uploaded.secure_url || !uploaded.public_id) {
    throw new Error(uploaded.error?.message ?? 'Cloudinary could not store that file.')
  }

  return {
    url: uploaded.secure_url,
    publicId: uploaded.public_id,
    bytes: uploaded.bytes ?? file.size,
    mimeType,
    originalName: file.name,
    label: file.name.replace(/\.[^/.]+$/, '') || file.name,
  }
}
