import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSettings, saveSettings, Settings } from '../api'

const DEFAULTS: Settings = {
  temperature: 0.7,
  max_tokens: 1024,
  chunk_size: 800,
  chunk_overlap: 150,
  top_k: 5,
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    fetchSettings()
      .then(s => setSettings(s))
      .catch(() => {})
  }, [])

  function set(field: keyof Settings, value: number) {
    setSettings(prev => ({ ...prev, [field]: value }))
    setStatus(null)
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const updated = await saveSettings(settings)
      setSettings(updated)
      setStatus({ type: 'success', msg: 'Settings saved successfully.' })
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message || 'Failed to save settings.' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setSettings(DEFAULTS)
    setStatus(null)
  }

  const inputClass = 'w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-[#f0f4f9]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => nav('/')} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-800">Settings</h1>
        </div>

        {status && (
          <div className={`text-sm mb-6 rounded-lg p-3 ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>
            {status.msg}
          </div>
        )}

        {/* LLM Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">LLM Settings</h2>
          <p className="text-xs text-gray-400 mb-4">Temperature changes take effect on agent restart.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Temperature <span className="text-gray-400 font-normal">(0.0 – 2.0)</span></label>
              <input
                type="number"
                min={0} max={2} step={0.1}
                value={settings.temperature}
                onChange={e => set('temperature', parseFloat(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max Tokens <span className="text-gray-400 font-normal">(64 – 8192)</span></label>
              <input
                type="number"
                min={64} max={8192} step={64}
                value={settings.max_tokens}
                onChange={e => set('max_tokens', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Search Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Search Settings</h2>
          <div className="max-w-xs">
            <label className={labelClass}>Top K Results <span className="text-gray-400 font-normal">(1 – 50)</span></label>
            <input
              type="number"
              min={1} max={50} step={1}
              value={settings.top_k}
              onChange={e => set('top_k', parseInt(e.target.value))}
              className={inputClass}
            />
            <p className="text-xs text-gray-400 mt-1">Number of document chunks to retrieve per query.</p>
          </div>
        </div>

        {/* Chunking Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Chunking Settings</h2>
          <p className="text-xs text-gray-400 mb-4">Applied to the next ingestion run — already ingested files are not affected.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Chunk Size <span className="text-gray-400 font-normal">(100 – 4000)</span></label>
              <input
                type="number"
                min={100} max={4000} step={50}
                value={settings.chunk_size}
                onChange={e => set('chunk_size', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Chunk Overlap <span className="text-gray-400 font-normal">(0 – 1000)</span></label>
              <input
                type="number"
                min={0} max={1000} step={25}
                value={settings.chunk_overlap}
                onChange={e => set('chunk_overlap', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="border border-gray-300 text-gray-700 rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  )
}
