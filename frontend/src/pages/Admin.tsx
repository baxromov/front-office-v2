import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { listUsers, createUser, deleteUser, uploadFiles, triggerIngest } from '../api'

interface User {
  id: number
  username: string
  role: string
  created_at: string
}

export default function Admin() {
  const [users, setUsers] = useState<User[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [kbStatus, setKbStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setUsers(await listUsers())
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await createUser(username, password, role)
      setUsername('')
      setPassword('')
      setRole('user')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this user?')) return
    try {
      await deleteUser(id)
      await load()
    } catch {}
  }

  function handleFileSelect(files: FileList | null) {
    if (!files) return
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      const newFiles = Array.from(files).filter(f => !existing.has(f.name))
      return [...prev, ...newFiles]
    })
    setKbStatus(null)
  }

  function removeFile(name: string) {
    setSelectedFiles(prev => prev.filter(f => f.name !== name))
  }

  async function handleUploadAndIngest() {
    if (selectedFiles.length === 0) return
    setKbStatus(null)
    setUploading(true)
    try {
      const up = await uploadFiles(selectedFiles)
      if (up.errors.length > 0) {
        setKbStatus({ type: 'error', msg: `Upload errors: ${up.errors.map(e => e.file).join(', ')}` })
        return
      }
      setSelectedFiles([])
      setUploading(false)
      setIngesting(true)
      const ing = await triggerIngest()
      setKbStatus({
        type: 'success',
        msg: `Uploaded ${up.uploaded.length} file(s). Ingested ${ing.processed} doc(s), skipped ${ing.skipped}.`,
      })
    } catch (e: any) {
      setKbStatus({ type: 'error', msg: e.message })
    } finally {
      setUploading(false)
      setIngesting(false)
    }
  }

  async function handleIngestOnly() {
    setKbStatus(null)
    setIngesting(true)
    try {
      const ing = await triggerIngest()
      setKbStatus({
        type: 'success',
        msg: `Ingested ${ing.processed} doc(s), skipped ${ing.skipped}.`,
      })
    } catch (e: any) {
      setKbStatus({ type: 'error', msg: e.message })
    } finally {
      setIngesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f4f9]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => nav('/')} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-800">Admin Panel</h1>
        </div>

        {/* Create user form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Create User</h2>
          {error && <p className="text-red-500 text-sm mb-4 bg-red-50 rounded-lg p-3">{error}</p>}
          <form onSubmit={handleCreate} className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="flex-1 min-w-[140px] border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="flex-1 min-w-[140px] border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              required
            />
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500 bg-white"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>

        {/* Knowledge Base */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Knowledge Base</h2>

          {kbStatus && (
            <div className={`text-sm mb-4 rounded-lg p-3 ${kbStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
              {kbStatus.msg}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files) }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4 ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
          >
            <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-gray-500">Drag & drop files here or <span className="text-blue-600 font-medium">browse</span></p>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT supported</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={e => handleFileSelect(e.target.files)}
            />
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {selectedFiles.map(f => (
                <div key={f.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700 truncate max-w-[80%]">{f.name}</span>
                  <button onClick={() => removeFile(f.name)} className="text-gray-400 hover:text-red-500 transition-colors ml-2 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleUploadAndIngest}
              disabled={selectedFiles.length === 0 || uploading || ingesting}
              className="bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading...' : ingesting ? 'Ingesting...' : `Upload & Ingest${selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}`}
            </button>
            <button
              onClick={handleIngestOnly}
              disabled={ingesting || uploading}
              className="border border-gray-300 text-gray-700 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {ingesting ? 'Ingesting...' : 'Re-ingest All'}
            </button>
          </div>
        </div>

        {/* Users list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-700">Users ({users.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-700 text-xs font-semibold">{u.username[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{u.username}</p>
                    <p className="text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {u.role}
                  </span>
                  {u.username !== 'admin' && (
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
