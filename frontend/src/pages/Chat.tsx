import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchThreads, createThread, fetchMessages, streamMessage, resumeThread, updateThreadTitle, deleteThread, fetchSources, logout, getUser } from '../api'

interface Thread {
  id: string
  title: string
  created_at: string
}

interface Message {
  type: 'human' | 'ai'
  content: string
  sources?: string[]
}

export default function Chat() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThread, setActiveThread] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [interrupted, setInterrupted] = useState<string | null>(null)
  const [thinkingSeconds, setThinkingSeconds] = useState(0)
  const thinkingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hoveredThread, setHoveredThread] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const nav = useNavigate()
  const user = getUser()

  useEffect(() => { loadThreads() }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadThreads() {
    try { setThreads(await fetchThreads()) } catch {}
  }

  async function handleNewChat() {
    try {
      const t = await createThread()
      setThreads(prev => [{ id: t.thread_id, title: 'New chat', created_at: new Date().toISOString() }, ...prev])
      setActiveThread(t.thread_id)
      setMessages([])
    } catch {}
  }

  async function handleSelectThread(id: string) {
    setActiveThread(id)
    try { setMessages(await fetchMessages(id)) } catch { setMessages([]) }
  }

  async function handleDeleteThread(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await deleteThread(id)
    setThreads(prev => prev.filter(t => t.id !== id))
    if (activeThread === id) { setActiveThread(null); setMessages([]) }
  }

  async function handleSend() {
    const msg = input.trim()
    if (!msg || streaming) return

    let threadId = activeThread
    if (!threadId) {
      try {
        const t = await createThread()
        threadId = t.thread_id
        setThreads(prev => [{ id: t.thread_id, title: msg.slice(0, 40), created_at: new Date().toISOString() }, ...prev])
        setActiveThread(threadId)
      } catch { return }
    }

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages(prev => [...prev, { type: 'human', content: msg }])
    setStreaming(true)
    setThinking(true)
    setThinkingSeconds(0)
    thinkingTimer.current = setInterval(() => setThinkingSeconds(s => s + 1), 1000)

    const thread = threads.find(t => t.id === threadId)
    if (!thread || thread.title === 'New chat') {
      const title = msg.slice(0, 50)
      updateThreadTitle(threadId!, title)
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title } : t))
    }

    try {
      const isResuming = interrupted !== null
      const resp = isResuming
        ? await resumeThread(threadId!, msg)
        : await streamMessage(threadId!, msg)
      if (isResuming) setInterrupted(null)

      if (!resp.body) return
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()

      let currentEvent = ''
      let buffer = ''
      let aiMessageAdded = false
      let gotInterrupt = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:') && currentEvent === 'messages/partial') {
            try {
              const data = JSON.parse(line.slice(5).trim())
              if (Array.isArray(data) && data[0]) {
                const m = data[0]
                if (m.type === 'ai' && typeof m.content === 'string' && m.content) {
                  setThinking(false)
                  if (thinkingTimer.current) { clearInterval(thinkingTimer.current); thinkingTimer.current = null }
                  if (!aiMessageAdded) {
                    aiMessageAdded = true
                    setMessages(prev => [...prev, { type: 'ai', content: m.content }])
                  } else {
                    setMessages(prev => {
                      const updated = [...prev]
                      updated[updated.length - 1] = { type: 'ai', content: m.content }
                      return updated
                    })
                  }
                }
              }
            } catch {}
          } else if (line.startsWith('data:') && currentEvent === 'updates') {
            try {
              const data = JSON.parse(line.slice(5).trim())
              if (data.__interrupt__?.[0]) {
                const question = data.__interrupt__[0].value
                setThinking(false)
                if (thinkingTimer.current) { clearInterval(thinkingTimer.current); thinkingTimer.current = null }
                gotInterrupt = true
                setInterrupted(question)
                if (!aiMessageAdded) {
                  aiMessageAdded = true
                  setMessages(prev => [...prev, { type: 'ai', content: question }])
                } else {
                  setMessages(prev => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { type: 'ai', content: question }
                    return updated
                  })
                }
              }
            } catch {}
          }
        }
      }

      if (!gotInterrupt) {
        const sources = await fetchSources(threadId!)
        if (sources.length > 0) {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.type === 'ai') updated[updated.length - 1] = { ...last, sources }
            return updated
          })
        }
      }
    } catch {
      setMessages(prev => [...prev, { type: 'ai', content: 'Sorry, an error occurred. Please try again.' }])
    } finally {
      setStreaming(false)
      setThinking(false)
      if (thinkingTimer.current) { clearInterval(thinkingTimer.current); thinkingTimer.current = null }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  return (
    <div className="flex h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <div className="w-60 flex-shrink-0 bg-[#f5f5f0] flex flex-col border-r border-gray-200">
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-6 h-6 rounded-md bg-orange-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800">Front Office</span>
          </div>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 w-full rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1 px-1.5">
          {threads.map(t => (
            <div
              key={t.id}
              onMouseEnter={() => setHoveredThread(t.id)}
              onMouseLeave={() => setHoveredThread(null)}
              onClick={() => handleSelectThread(t.id)}
              className={`group flex items-center gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors mb-0.5 ${
                activeThread === t.id
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800'
              }`}
            >
              <span className="flex-1 truncate">{t.title}</span>
              {hoveredThread === t.id && (
                <button
                  onClick={e => handleDeleteThread(e, t.id)}
                  className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-2 border-t border-gray-200 space-y-0.5">
          <button
            onClick={() => nav('/search')}
            className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </button>
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

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center mb-5 shadow-sm">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">How can I help you?</h2>
            <p className="text-sm text-gray-400 max-w-xs">Ask me anything about our banking products and services.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.type === 'human' ? 'justify-end' : 'justify-start'}`}>
                  {msg.type === 'ai' && (
                    <div className="w-7 h-7 flex-shrink-0 rounded-lg bg-orange-500 flex items-center justify-center mt-0.5 shadow-sm">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                  )}
                  <div className={`max-w-[78%] text-sm leading-relaxed ${
                    msg.type === 'human'
                      ? 'bg-gray-100 text-gray-800 rounded-2xl rounded-tr-md px-4 py-2.5'
                      : 'text-gray-800 pt-0.5'
                  }`}>
                    {msg.type === 'ai' ? (
                      <div>
                        <div className="prose prose-sm max-w-none
                          prose-p:text-gray-700 prose-p:leading-relaxed
                          prose-headings:text-gray-900 prose-headings:font-semibold
                          prose-li:text-gray-700
                          prose-strong:text-gray-900
                          prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                          prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-lg
                          prose-table:text-sm prose-table:w-full
                          prose-thead:bg-gray-50
                          prose-th:text-left prose-th:font-semibold prose-th:text-gray-700 prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-gray-200
                          prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200 prose-td:text-gray-700
                          prose-tr:even:bg-gray-50/50
                        ">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          {streaming && i === messages.length - 1 && (
                            <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse align-middle" />
                          )}
                        </div>
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">Sources</p>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.sources.map((src, si) => (
                                <span key={si} className="inline-flex items-center gap-1 bg-orange-50 border border-orange-100 text-orange-700 text-[11px] rounded-md px-2 py-0.5">
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  {src}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.type === 'human' && (
                    <div className="w-7 h-7 flex-shrink-0 rounded-full bg-gray-200 flex items-center justify-center mt-0.5 text-xs font-semibold text-gray-600">
                      {user?.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
              {thinking && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 flex-shrink-0 rounded-lg bg-orange-500 flex items-center justify-center mt-0.5 shadow-sm">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-2 pt-1.5">
                    <span className="text-orange-500 font-medium text-sm">✶</span>
                    <span className="text-xs text-gray-400">Thinking</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{thinkingSeconds}s</span>
                    <span className="flex gap-0.5 ml-1">
                      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-5 pt-2">
          <div className="max-w-2xl mx-auto">
            <div className="relative bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-gray-300 focus-within:shadow-sm transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKeyDown}
                placeholder="Message Front Office..."
                rows={1}
                className="w-full bg-transparent px-4 py-3.5 pr-12 text-sm text-gray-800 placeholder-gray-400 outline-none resize-none"
                style={{ minHeight: '52px', maxHeight: '160px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                className="absolute right-2.5 bottom-2.5 w-7 h-7 flex items-center justify-center rounded-lg bg-orange-500 disabled:bg-gray-200 hover:bg-orange-600 transition-colors"
              >
                {streaming ? (
                  <div className="w-2.5 h-2.5 bg-white rounded-sm" />
                ) : (
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-center text-gray-400 mt-1.5">Enter · send &nbsp;·&nbsp; Shift+Enter · new line</p>
          </div>
        </div>
      </div>
    </div>
  )
}
