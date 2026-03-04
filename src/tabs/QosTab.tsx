import { useState, useEffect, useCallback } from 'react'
import { Sliders, Trash2, RotateCcw, Info, CheckCircle2, Play, Settings } from 'lucide-react'
import { getQosPolicies, addQosPolicy, deleteQosPolicy } from '../services/networkService'
import type { QosPolicy } from '../services/networkService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function logColor(line: string): string {
  if (line.includes('[SUCCESS]')) return 'text-emerald-400'
  if (line.includes('[ERROR]')) return 'text-red-400'
  if (line.includes('[WARN]')) return 'text-amber-400'
  if (line.includes('[INFO]')) return 'text-sky-400'
  return 'text-slate-300'
}

function dscpBadge(dscp: number): string {
  if (dscp === 46) return 'bg-emerald-900/50 text-emerald-400 border-emerald-700'
  if (dscp === 34) return 'bg-sky-900/50 text-sky-400 border-sky-700'
  if (dscp === 26) return 'bg-violet-900/50 text-violet-400 border-violet-700'
  if (dscp === 0) return 'bg-slate-800/50 text-slate-400 border-slate-600'
  return 'bg-amber-900/50 text-amber-400 border-amber-700'
}

function dscpLabel(dscp: number): string {
  if (dscp === 46) return 'EF'
  if (dscp === 34) return 'AF41'
  if (dscp === 26) return 'AF31'
  if (dscp === 0) return 'BE'
  return `${dscp}`
}

// ─── DSCP Presets ─────────────────────────────────────────────────────────────

const DSCP_PRESETS = [
  { label: 'EF (46)', value: 46, desc: 'Real-time / Gaming' },
  { label: 'AF41 (34)', value: 34, desc: 'Video conferencing' },
  { label: 'AF31 (26)', value: 26, desc: 'Streaming' },
  { label: 'CS0 (0)', value: 0, desc: 'Best Effort / Low priority' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function QosTab() {
  const [policies, setPolicies] = useState<QosPolicy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [newApp, setNewApp] = useState('')
  const [newDscp, setNewDscp] = useState(46)
  const [newPort, setNewPort] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const appendLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `> [${ts}] ${msg}`])
  }, [])

  const loadPolicies = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getQosPolicies()
      setPolicies(result)
      appendLog('[INFO] QoS policies loaded')
    } catch {
      appendLog('[ERROR] Failed to load QoS policies')
    } finally {
      setIsLoading(false)
    }
  }, [appendLog])

  useEffect(() => {
    loadPolicies()
  }, [loadPolicies])

  const handleAdd = async () => {
    if (!newName.trim() || !newApp.trim()) {
      appendLog('[WARN] Policy name and app executable are required')
      return
    }
    if (newDscp < 0 || newDscp > 63) {
      appendLog('[WARN] DSCP value must be between 0 and 63')
      return
    }
    setIsAdding(true)
    try {
      const port = newPort.trim() ? parseInt(newPort, 10) : 0
      const result = await addQosPolicy(newName.trim(), newApp.trim(), newDscp, port)
      appendLog(result)
      setNewName('')
      setNewApp('')
      setNewDscp(46)
      setNewPort('')
      await loadPolicies()
    } catch {
      appendLog('[ERROR] Failed to add QoS policy')
    } finally {
      setIsAdding(false)
    }
  }

  const handleDelete = async (name: string) => {
    try {
      const result = await deleteQosPolicy(name)
      appendLog(result)
      await loadPolicies()
    } catch {
      appendLog(`[ERROR] Failed to delete policy '${name}'`)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">QoS Rules</h2>
            <p className="text-xs text-slate-400">Manage DSCP Quality-of-Service policies for network traffic prioritization</p>
          </div>
        </div>
        <button
          onClick={loadPolicies}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all duration-200 disabled:opacity-50"
        >
          <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Add Policy Card */}
      <div className="bg-[#0a0f1e] border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-medium text-slate-200">Add New Policy</h3>
        </div>

        {/* Row 1: Name + App */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Policy Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Gaming-Priority"
              className="w-full bg-[#060b19] border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition-all duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">App Executable</label>
            <input
              type="text"
              value={newApp}
              onChange={e => setNewApp(e.target.value)}
              placeholder="e.g. csgo.exe"
              className="w-full bg-[#060b19] border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition-all duration-200"
            />
          </div>
        </div>

        {/* Row 2: DSCP + Presets + Port */}
        <div className="flex items-end gap-3 mb-3">
          <div className="w-24">
            <label className="block text-xs text-slate-400 mb-1">DSCP (0-63)</label>
            <input
              type="number"
              min={0}
              max={63}
              value={newDscp}
              onChange={e => setNewDscp(Math.min(63, Math.max(0, parseInt(e.target.value, 10) || 0)))}
              className="w-full bg-[#060b19] border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-sky-500 transition-all duration-200"
            />
          </div>

          <div className="flex gap-2">
            {DSCP_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => setNewDscp(preset.value)}
                title={preset.desc}
                className={`px-2.5 py-2 text-xs rounded border transition-all duration-200 ${
                  newDscp === preset.value
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="w-28">
            <label className="block text-xs text-slate-400 mb-1">Port (optional)</label>
            <input
              type="number"
              min={0}
              max={65535}
              value={newPort}
              onChange={e => setNewPort(e.target.value)}
              placeholder="e.g. 443"
              className="w-full bg-[#060b19] border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition-all duration-200"
            />
          </div>
        </div>

        {/* Add button + info */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5" />
            <span>Requires administrator privileges. Policies apply immediately via Windows QoS.</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={isAdding || !newName.trim() || !newApp.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-sky-500 hover:bg-sky-400 text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isAdding ? 'Adding...' : 'Add Policy'}
          </button>
        </div>
      </div>

      {/* Existing Policies Card */}
      <div className="bg-[#0a0f1e] border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">
            Existing Policies
            {policies.length > 0 && (
              <span className="ml-2 text-xs text-slate-500">({policies.length})</span>
            )}
          </h3>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RotateCcw className="w-5 h-5 text-sky-400 animate-spin" />
            <span className="ml-2 text-sm text-slate-400">Loading policies...</span>
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            No QoS policies configured.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-slate-400 text-xs uppercase font-medium pb-2 pr-4">Name</th>
                  <th className="text-slate-400 text-xs uppercase font-medium pb-2 pr-4">App</th>
                  <th className="text-slate-400 text-xs uppercase font-medium pb-2 pr-4">DSCP</th>
                  <th className="text-slate-400 text-xs uppercase font-medium pb-2 pr-4">Port</th>
                  <th className="text-slate-400 text-xs uppercase font-medium pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map(policy => (
                  <tr key={policy.name} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-all duration-200">
                    <td className="py-2.5 pr-4 text-sm text-slate-200 font-medium">{policy.name}</td>
                    <td className="py-2.5 pr-4 text-sm text-slate-300 font-mono">{policy.appPathName || '-'}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${dscpBadge(policy.dscp)}`}>
                        {dscpLabel(policy.dscp)} ({policy.dscp})
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-slate-400 font-mono">
                      {policy.tcpPort > 0 ? policy.tcpPort : '-'}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(policy.name)}
                        title={`Delete policy '${policy.name}'`}
                        className="p-1.5 rounded bg-red-900/40 hover:bg-red-800/40 text-red-400 transition-all duration-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Output Area */}
      <div className="bg-[#0a0f1e] border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-200">Command Log</h3>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-slate-500 hover:text-slate-300 transition-all duration-200"
          >
            Clear
          </button>
        </div>
        <div className="bg-[#060b19] rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <span className="text-slate-600">Waiting for commands...</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={logColor(line)}>
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
