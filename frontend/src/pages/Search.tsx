import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchSearchChunks, streamSearchAnswer, SearchChunk, logout, getUser } from '../api'

function ChunkItem({ chunk, selected, onClick }: { chunk: SearchChunk; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors mb-0.5 ${
        selected
          ? 'bg-white shadow-sm text-gray-900 font-medium'
          : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <svg className="w-3 h-3 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="truncate font-medium text-gray-700">{chunk.source}</span>
        <span className="ml-auto text-gray-400 flex-shrink-0">{chunk.score.toFixed(2)}</span>
      </div>
      <p className="line-clamp-2 text-gray-500 pl-4">{chunk.text}</p>
    </div>
  )
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [chunks, setChunks] = useState<SearchChunk[]>([])
  const [llmAnswer, setLlmAnswer] = useState('')
  const [searching, setSearching] = useState(false)
  const [ragDone, setRagDone] = useState(false)
  const [llmStreaming, setLlmStreaming] = useState(false)
  const [error, setError] = useState('')
  const [selectedChunk, setSelectedChunk] = useState<SearchChunk | null>(null)
  const nav = useNavigate()
  const user = getUser()

  async function handleSearch() {
    const q = query.trim()
    if (!q || searching) return

    setChunks([])
    setLlmAnswer('')
    setRagDone(false)
    setLlmStreaming(false)
    setError('')
    setSelectedChunk(null)
    setSearching(true)

    let foundChunks: SearchChunk[] = []

    try {
      foundChunks = await fetchSearchChunks(q)
      setChunks(foundChunks)
      setRagDone(true)
    } catch (e: any) {
      setError(e.message || 'Search failed.')
      setSearching(false)
      return
    }

    setLlmStreaming(true)
    try {
      const resp = await streamSearchAnswer(q, foundChunks)
      if (!resp.ok) {
        const text = await resp.text()
        setError(`Answer error ${resp.status}: ${text}`)
        return
      }
      if (!resp.body) return
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
              try {
                const { token } = JSON.parse(raw)
                if (token) setLlmAnswer(prev => prev + token)
              } catch {}
            } else if (currentEvent === 'error') {
              try {
                const { message } = JSON.parse(raw)
                setError(message || 'Answer generation failed.')
              } catch {}
            }
          }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Answer failed.')
    } finally {
      setSearching(false)
      setLlmStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="flex h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-[#f5f5f0] flex flex-col border-r border-gray-200">
        {/* Header + Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-6 h-6 rounded-md bg-orange-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800">Front Office</span>
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={searching}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-orange-400 disabled:opacity-60 bg-white"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="bg-orange-500 text-white rounded-lg px-3 py-2 hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
          {error && <p className="text-red-500 text-[11px] mt-1.5">{error}</p>}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto py-1 px-1.5">
          {searching && !ragDone && (
            <div className="space-y-2 px-1 py-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="animate-pulse px-2.5 py-2">
                  <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-2 bg-gray-200 rounded w-full mb-1" />
                  <div className="h-2 bg-gray-200 rounded w-4/5" />
                </div>
              ))}
            </div>
          )}
          {ragDone && chunks.length === 0 && (
            <p className="text-xs text-gray-400 px-3 py-4">No results found.</p>
          )}
          {chunks.map((chunk, i) => (
            <ChunkItem
              key={i}
              chunk={chunk}
              selected={selectedChunk === chunk}
              onClick={() => setSelectedChunk(selectedChunk === chunk ? null : chunk)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-gray-200 space-y-0.5">
          {user?.role === 'admin' && (
            <button
              onClick={() => nav('/admin')}
              className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
              </svg>
              Admin Panel
            </button>
          )}
          {user?.role === 'admin' && (
            <button
              onClick={() => nav('/settings')}
              className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          )}
          <button
            onClick={() => { logout(); nav('/login', { replace: true }) }}
            className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
          >
            <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-white text-[9px] font-bold">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="truncate">{user?.username}</span>
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
        {selectedChunk ? (
          <div className="max-w-2xl mx-auto px-6 py-8 w-full">
            <button
              onClick={() => setSelectedChunk(null)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-6"
            >
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
        ) : !ragDone && !searching ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center mb-5 shadow-sm">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Search Knowledge Base</h2>
            <p className="text-sm text-gray-400 max-w-xs">Type a query in the sidebar to search documents.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-8 w-full">
            <h2 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
              </svg>
              Answer
            </h2>
            {!llmAnswer && llmStreaming ? (
              <div className="animate-pulse space-y-2">
                <div className="h-3 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-11/12" />
                <div className="h-3 bg-gray-200 rounded w-4/5" />
                <div className="h-3 bg-gray-200 rounded w-full" />
              </div>
            ) : !llmAnswer && ragDone ? (
              <p className="text-sm text-gray-400">No answer generated.</p>
            ) : (
              <div className="prose prose-sm max-w-none text-gray-800">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{llmAnswer}</ReactMarkdown>
                {llmStreaming && <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
