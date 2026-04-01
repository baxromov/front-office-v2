import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  fetchSearchChunks, streamSearchAnswer, SearchChunk,
  logout, getUser, uploadFiles, triggerIngest, fetchFiles, deleteFile, MinioFile,
} from '../api'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function ChunkCard({ chunk, active, onClick }: { chunk: SearchChunk; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-3 mb-2 last:mb-0 cursor-pointer transition-colors border ${
        active
          ? 'border-orange-200 bg-orange-50'
          : 'border-gray-100 hover:border-orange-100 hover:bg-orange-50/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1 bg-white border border-orange-100 text-orange-700 text-[11px] rounded-md px-2 py-0.5 font-medium truncate max-w-[160px]">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate">{chunk.source}</span>
        </span>
        <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0">{chunk.score.toFixed(2)}</span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{chunk.text}</p>
    </div>
  )
}

export default function Search() {
  // ── Search state ──────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [chunks, setChunks] = useState<SearchChunk[]>([])
  const [llmAnswer, setLlmAnswer] = useState('')
  const [phase, setPhase] = useState<'idle' | 'searching' | 'answering' | 'done'>('idle')
  const [searchError, setSearchError] = useState('')
  const [selectedChunk, setSelectedChunk] = useState<SearchChunk | null>(null)

  // ── Pipeline state (admin) ────────────────────────────────────
  const [files, setFiles] = useState<MinioFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nav = useNavigate()
  const user = getUser()
  const isAdmin = user?.role === 'admin'

  useEffect(() => { if (isAdmin) loadFiles() }, [])

  async function loadFiles() {
    setFilesLoading(true)
    try { setFiles(await fetchFiles()) } catch {} finally { setFilesLoading(false) }
  }

  // ── Search + Answer ───────────────────────────────────────────
  async function handleSearch() {
    const q = query.trim()
    if (!q || phase === 'searching' || phase === 'answering') return

    setChunks([])
    setLlmAnswer('')
    setSearchError('')
    setSelectedChunk(null)
    setPhase('searching')

    // Step 1: RAG search
    let foundChunks: SearchChunk[] = []
    try {
      foundChunks = await fetchSearchChunks(q)
      setChunks(foundChunks)
    } catch (e: any) {
      setSearchError(e.message || 'Search failed.')
      setPhase('idle')
      return
    }

    // Step 2: LLM answer stream
    setPhase('answering')
    try {
      const resp = await streamSearchAnswer(q, foundChunks)
      if (!resp.ok) {
        const text = await resp.text()
        setSearchError(`Answer error ${resp.status}: ${text}`)
        setPhase('done')
        return
      }
      if (!resp.body) { setPhase('done'); return }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let currentEvent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const raw = line.slice(5).trim()
            if (currentEvent === 'llm_token') {
              try { const { token } = JSON.parse(raw); if (token) setLlmAnswer(p => p + token) } catch {}
            } else if (currentEvent === 'error') {
              try { const { message } = JSON.parse(raw); setSearchError(message || 'Answer failed.') } catch {}
            }
          }
        }
      }
    } catch (e: any) {
      setSearchError(`Answer failed: ${e.message || String(e)}`)
    } finally {
      setPhase('done')
    }
  }

  // ── Upload ────────────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files || [])
    if (!fileList.length) return
    setUploading(true)
    setUploadMsg('')
    try {
      const result = await uploadFiles(fileList)
      setUploadMsg(`${result.uploaded.length} file(s) uploaded`)
      await loadFiles()
    } catch (e: any) {
      setUploadMsg(e.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Ingest ────────────────────────────────────────────────────
  async function handleIngest() {
    setIngesting(true)
    setIngestMsg('')
    try {
      const r = await triggerIngest()
      setIngestMsg(`Done — processed: ${r.processed}, skipped: ${r.skipped}${r.errors.length ? `, errors: ${r.errors.length}` : ''}`)
    } catch (e: any) {
      setIngestMsg(e.message || 'Ingest failed')
    } finally {
      setIngesting(false)
    }
  }

  async function handleDeleteFile(name: string) {
    try { await deleteFile(name); setFiles(p => p.filter(f => f.name !== name)) } catch {}
  }

  const busy = phase === 'searching' || phase === 'answering'
  const hasResult = phase === 'answering' || phase === 'done'

  return (
    <div className="flex h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ── Left sidebar: Knowledge Base ── */}
      <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-[#f5f5f0] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-orange-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-800">Front Office</span>
        </div>

        {/* Knowledge Base content */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {isAdmin && (
            <div className="p-4 border-b border-gray-200">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Knowledge Base</p>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} accept=".pdf,.docx,.txt" />
              <div className="space-y-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Upload Files'}
                </button>
                <button
                  onClick={handleIngest}
                  disabled={ingesting}
                  className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 ${ingesting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {ingesting ? 'Running...' : 'Run Ingestion'}
                </button>
              </div>
              {uploadMsg && <p className={`text-[11px] mt-2 ${uploadMsg.includes('fail') ? 'text-red-500' : 'text-green-600'}`}>{uploadMsg}</p>}
              {ingestMsg && <p className={`text-[11px] mt-2 ${ingestMsg.includes('fail') || ingestMsg.includes('error') ? 'text-red-500' : 'text-green-600'}`}>{ingestMsg}</p>}
            </div>
          )}

          {/* Files list */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Files{files.length > 0 ? ` (${files.length})` : ''}
              </p>
              {isAdmin && (
                <button onClick={loadFiles} title="Refresh" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className={`w-3.5 h-3.5 ${filesLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
            {filesLoading && (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <div key={i} className="animate-pulse h-9 bg-gray-200 rounded-lg" />)}
              </div>
            )}
            {!filesLoading && isAdmin && files.length === 0 && (
              <p className="text-xs text-gray-400">No files uploaded yet.</p>
            )}
            {!isAdmin && (
              <p className="text-xs text-gray-400">Admin access required.</p>
            )}
            <div className="space-y-0.5">
              {files.map(file => (
                <div key={file.name} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-200 group transition-colors">
                  <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate">{file.name}</p>
                    <p className="text-[10px] text-gray-400">{formatSize(file.size)}</p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteFile(file.name)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Nav footer */}
        <div className="p-2 border-t border-gray-200 space-y-0.5">
          {isAdmin && (
            <button onClick={() => nav('/admin')} className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
              </svg>
              Admin Panel
            </button>
          )}
          {isAdmin && (
            <button onClick={() => nav('/settings')} className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          )}
          <button onClick={() => { logout(); nav('/login', { replace: true }) }} className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors">
            <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-white text-[9px] font-bold">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="truncate">{user?.username}</span>
          </button>
        </div>
      </div>

      {/* ── Main: Search + Answer ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="max-w-2xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
          {/* Search input */}
          <div>
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm focus-within:border-orange-400 focus-within:shadow-md transition-all">
              <input
                type="text"
                placeholder="Search the knowledge base..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                disabled={busy}
                className="w-full bg-transparent px-5 py-4 pr-32 text-base text-gray-800 placeholder-gray-400 outline-none disabled:opacity-60 rounded-2xl"
              />
              <button
                onClick={handleSearch}
                disabled={busy || !query.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-orange-500 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {phase === 'searching' ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </>
                )}
              </button>
            </div>
            {searchError && <p className="text-red-500 text-sm mt-2 px-1">{searchError}</p>}
          </div>

          {/* Answer or selected chunk detail */}
          {selectedChunk ? (
            <div>
              <button onClick={() => setSelectedChunk(null)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to answer
              </button>
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-100 text-orange-700 text-xs rounded-md px-2.5 py-1 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {selectedChunk.source}
                </span>
                <span className="text-xs text-gray-400">Score: {selectedChunk.score.toFixed(3)}</span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{selectedChunk.text}</p>
            </div>
          ) : phase === 'idle' ? (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">Type a query above to search documents.</p>
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Answer</p>
              {phase === 'answering' && !llmAnswer ? (
                <div className="animate-pulse space-y-2.5">
                  <div className="h-3 bg-gray-100 rounded-full w-full" />
                  <div className="h-3 bg-gray-100 rounded-full w-11/12" />
                  <div className="h-3 bg-gray-100 rounded-full w-4/5" />
                  <div className="h-3 bg-gray-100 rounded-full w-full" />
                  <div className="h-3 bg-gray-100 rounded-full w-3/4" />
                </div>
              ) : !llmAnswer ? (
                <p className="text-sm text-gray-400">No answer generated.</p>
              ) : (
                <div className="prose prose-sm max-w-none
                  prose-p:text-gray-700 prose-headings:text-gray-900
                  prose-li:text-gray-700 prose-strong:text-gray-900
                  prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-xl
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{llmAnswer}</ReactMarkdown>
                  {phase === 'answering' && <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: Sources ── */}
      <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-[#fafaf8] overflow-y-auto">
        <div className="p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Sources{chunks.length > 0 ? ` (${chunks.length})` : ''}
          </p>

          {phase === 'searching' && chunks.length === 0 && (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="animate-pulse border border-gray-100 rounded-xl p-3">
                  <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-2 bg-gray-200 rounded w-full mb-1" />
                  <div className="h-2 bg-gray-200 rounded w-4/5" />
                </div>
              ))}
            </div>
          )}

          {phase === 'idle' && (
            <p className="text-xs text-gray-400">Search results will appear here.</p>
          )}

          {chunks.length === 0 && (phase === 'answering' || phase === 'done') && (
            <p className="text-xs text-gray-400">No matching documents found.</p>
          )}

          {chunks.map((chunk, i) => (
            <ChunkCard
              key={i}
              chunk={chunk}
              active={selectedChunk === chunk}
              onClick={() => setSelectedChunk(selectedChunk === chunk ? null : chunk)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
