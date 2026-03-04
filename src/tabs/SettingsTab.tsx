import React, { useState, useEffect } from 'react'
import { Settings, Plus, Trash2, Globe, Activity } from 'lucide-react'

export default function SettingsTab() {
  const [customTargets, setCustomTargets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('customPingTargets')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  
  const [newTarget, setNewTarget] = useState('')

  useEffect(() => {
    localStorage.setItem('customPingTargets', JSON.stringify(customTargets))
  }, [customTargets])

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTarget.trim()
    if (!trimmed) return
    if (!customTargets.includes(trimmed)) {
      setCustomTargets(prev => [...prev, trimmed])
    }
    setNewTarget('')
  }

  const handleRemove = (targetToRemove: string) => {
    setCustomTargets(prev => prev.filter(t => t !== targetToRemove))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-sky-500/10 p-2.5 rounded-lg border border-sky-500/20">
            <Settings className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Custom Ping Targets</h3>
            <p className="text-sm text-slate-400 mt-1">Configure custom IP addresses or hostnames to use in network tests.</p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="e.g. 192.168.1.1 or google.com"
              className="w-full bg-[#020617] border border-[#1e293b] text-slate-200 text-sm rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 block pl-10 p-2.5 outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={!newTarget.trim()}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors outline-none"
          >
            <Plus className="w-4 h-4" />
            Add Target
          </button>
        </form>

        <div className="space-y-2">
          {customTargets.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-[#1e293b] rounded-lg">
              No custom targets configured. Add one above.
            </div>
          ) : (
            customTargets.map((target) => (
              <div key={target} className="flex items-center justify-between bg-[#020617] border border-[#1e293b] rounded-lg p-3 group transition-colors hover:border-slate-700">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-200 font-mono text-sm">{target}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(target)}
                  className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-400/10 transition-colors outline-none opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Remove target"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
