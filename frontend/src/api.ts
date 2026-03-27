const BASE = '/api'

function getToken() {
  return localStorage.getItem('token') || ''
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
}

export async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) throw new Error('Invalid credentials')
  const data = await res.json()
  localStorage.setItem('token', data.token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export function getUser() {
  const u = localStorage.getItem('user')
  return u ? JSON.parse(u) : null
}

export async function fetchThreads() {
  const res = await fetch(`${BASE}/threads`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

export async function createThread() {
  const res = await fetch(`${BASE}/threads`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

export async function updateThreadTitle(threadId: string, title: string) {
  await fetch(`${BASE}/threads/${threadId}/title`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ title })
  })
}

export async function fetchMessages(threadId: string) {
  const res = await fetch(`${BASE}/threads/${threadId}/messages`, { headers: authHeaders() })
  if (!res.ok) return []
  return res.json()
}

export function streamMessage(threadId: string, message: string) {
  return fetch(`${BASE}/threads/${threadId}/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ message })
  })
}

export async function fetchSources(threadId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/threads/${threadId}/sources`, { headers: authHeaders() })
  if (!res.ok) return []
  return res.json()
}

export async function deleteThread(threadId: string) {
  await fetch(`${BASE}/threads/${threadId}`, { method: 'DELETE', headers: authHeaders() })
}

export async function listUsers() {
  const res = await fetch(`${BASE}/admin/users`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

export async function createUser(username: string, password: string, role = 'user') {
  const res = await fetch(`${BASE}/admin/users`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username, password, role })
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed')
  }
  return res.json()
}

export async function deleteUser(id: number) {
  const res = await fetch(`${BASE}/admin/users/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error('Failed')
}

export async function uploadFiles(files: File[]) {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  const res = await fetch(`${BASE}/admin/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  return res.json() as Promise<{ uploaded: string[]; errors: { file: string; error: string }[] }>
}

export async function triggerIngest(force = false) {
  const res = await fetch(`${BASE}/admin/ingest`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ force }),
  })
  if (!res.ok) throw new Error('Ingest failed')
  return res.json() as Promise<{ processed: number; skipped: number; errors: { file: string; error: string }[] }>
}
