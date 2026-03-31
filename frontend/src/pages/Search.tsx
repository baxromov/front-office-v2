import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchSearchChunks, streamSearchAnswer, SearchChunk } from '../api'

function SkeletonChunks() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map(i => (
        <div key={i} className="animate-pulse border border-gray-100 rounded-xl p-4">
          <div className="h-3 bg-gray-200 rounded w-1/4 mb-3" />
          <div className="h-3 bg-gray-200 rounded w-full mb-2" />
          <div className="h-3 bg-gray-200 rounded w-5/6 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-4/6" />
        </div>
      ))}
    </div>
  )
}

function SkeletonAnswer() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-gray-200 rounded w-full" />
      <div className="h-3 bg-gray-200 rounded w-11/12" />
      <div className="h-3 bg-gray-200 rounded w-4/5" />
      <div className="h-3 bg-gray-200 rounded w-full" />
    </div>
  )
}

function ChunkCard({ chunk }: { chunk: SearchChunk }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-100 text-orange-700 text-[11px] rounded-md px-2 py-0.5 font-medium">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {chunk.source}
        </span>
        <span className="text-[11px] text-gray-400 ml-auto">
          Score: {chunk.score.toFixed(3)}
        </span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{chunk.text}</p>
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
  const nav = useNavigate()

  async function handleSearch() {
    const q = query.trim()
    if (!q || searching) return

    setChunks([])
    setLlmAnswer('')
    setRagDone(false)
    setLlmStreaming(false)
    setError('')
    setSearching(true)

    let foundChunks: SearchChunk[] = []

    // Request 1: RAG search
    try {
      foundChunks = await fetchSearchChunks(q)
      setChunks(foundChunks)
      setRagDone(true)
    } catch (e: any) {
      setError(e.message || 'Search failed.')
      setSearching(false)
      return
    }

    // Request 2: LLM answer stream
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

  const hasResults = ragDone || searching

  return (
    <div className="min-h-screen bg-[#f0f4f9]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => nav('/')} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-800">Search</h1>
        </div>

        {/* Search input */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search the knowledge base..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={searching}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-orange-400 disabled:opacity-60"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="bg-orange-500 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        {/* LLM Answer */}
        {ragDone && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
              </svg>
              Answer
            </h2>
            {!llmAnswer && llmStreaming ? (
              <SkeletonAnswer />
            ) : !llmAnswer ? (
              <p className="text-sm text-gray-400">No answer generated.</p>
            ) : (
              <div className="prose prose-sm max-w-none text-gray-800">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{llmAnswer}</ReactMarkdown>
                {llmStreaming && <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />}
              </div>
            )}
          </div>
        )}

        {/* RAG Results */}
        {hasResults && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Sources
            </h2>
            {!ragDone ? (
              <SkeletonChunks />
            ) : chunks.length === 0 ? (
              <p className="text-sm text-gray-400">No matching documents found.</p>
            ) : (
              chunks.map((chunk, i) => <ChunkCard key={i} chunk={chunk} />)
            )}
          </div>
        )}
      </div>
    </div>
  )
}
