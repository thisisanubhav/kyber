const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4175'

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'The local API could not complete this request.')
  return body
}

export async function submitCareerApplication({ jobId, fullName, email, linkedinUrl, cv, video }) {
  const files = [{ kind: 'cv', fileName: cv.name, contentType: cv.type, size: cv.size }]
  if (video) files.push({ kind: 'video', fileName: video.name, contentType: video.type, size: video.size })
  const draft = await api('/v1/applications/uploads', { method: 'POST', body: JSON.stringify({ files }) })
  const selected = { cv, video }
  await Promise.all(draft.uploads.map(async (upload) => {
    const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: selected[upload.kind] })
    if (!response.ok) throw new Error(`The ${upload.kind} upload failed.`)
  }))
  return api('/v1/applications', {
    method: 'POST',
    body: JSON.stringify({ draftId: draft.draftId, draftToken: draft.draftToken, jobId, fullName, email, linkedinUrl }),
  })
}
