import { useState, useEffect, useCallback } from 'react'
import { Shield, Trash2, RotateCcw, CheckCircle2, XCircle, Play, Info, AlertTriangle, Terminal } from 'lucide-react'
import { getFirewallRules, addFirewallBlockRule, deleteFirewallRule, setFirewallRuleEnabled } from '../services/networkService'
import type { FirewallRule } from '../services/networkService'

function logColor(line: string): string {
  if (line.includes('[SUCCESS]')) return 'text-emerald-400'
  if (line.includes('[ERROR]')) return 'text-red-400'
  if (line.includes('[WARN]')) return 'text-amber-400'
  if (line.includes('[INFO]')) return 'text-sky-400'
  return 'text-slate-300'
}

function baseName(fullPath: string): string {
  const parts = fullPath.split(/[/\\]/)
  return parts[parts.length - 1] || fullPath
}

export default function AppFirewallTab() {
  const [rules, setRules] = useState<FirewallRule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [newAppPath, setNewAppPath] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const appendLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `> ${msg}`])
  }, [])

  const loadRules = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getFirewallRules()
      setRules(data)
    } catch (err) {
      appendLog(`[ERROR] Failed to load rules: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsLoading(false)
    }
  }, [appendLog])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleAdd = async () => {
    const trimmed = newAppPath.trim()
    if (!trimmed) return
    setIsAdding(true)
    appendLog(`[INFO] Adding block rule for: ${trimmed}`)
    try {
      const result = await addFirewallBlockRule(trimmed)
      appendLog(result)
      setNewAppPath('')
      await loadRules()
    } catch (err) {
      appendLog(`[ERROR] ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsAdding(false)
    }
  }

  const handleDelete = async (rule: FirewallRule) => {
    appendLog(`[INFO] Deleting rule: ${rule.name}`)
    try {
      const result = await deleteFirewallRule(rule.name)
      appendLog(result)
      await loadRules()
    } catch (err) {
      appendLog(`[ERROR] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleToggle = async (rule: FirewallRule) => {
    const newEnabled = !rule.enabled
    // Optimistic update
    setRules(prev => prev.map(r => r.name === rule.name ? { ...r, enabled: newEnabled } : r))
    appendLog(`[INFO] ${newEnabled ? 'Enabling' : 'Disabling'} rule: ${rule.name}`)
    try {
      const result = await setFirewallRuleEnabled(rule.name, newEnabled)
      appendLog(result)
    } catch (err) {
      // Revert on failure
      setRules(prev => prev.map(r => r.name === rule.name ? { ...r, enabled: !newEnabled } : r))
      appendLog(`[ERROR] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Rule Card */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex gap-4 mb-5">
          <div className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/20 h-fit">
            <Shield className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Block Application</h3>
            <p className="text-sm text-slate-400 mt-1">Block outbound network access for a specific application.</p>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={newAppPath}
            onChange={e => setNewAppPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Full path to application (e.g. C:\Program Files\App\app.exe)"
            className="flex-1 bg-[#060b19] border border-[#1e293b] rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 transition-colors font-mono"
          />
          <button
            onClick={handleAdd}
            disabled={isAdding || !newAppPath.trim()}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.3)] whitespace-nowrap"
          >
            <Shield className="w-4 h-4" />
            {isAdding ? 'Blocking...' : 'Block App'}
          </button>
        </div>

        <div className="flex items-start gap-2 text-xs text-slate-500 mb-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Creates an outbound block rule. Requires administrator. Rule name prefixed with &quot;Uptimizer-Block-&quot;.</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-amber-500/80">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Blocking system apps may cause instability.</span>
        </div>
      </div>

      {/* Rules Table Card */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1e293b] flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Active Firewall Rules</h3>
          <button
            onClick={loadRules}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Shield className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No firewall rules configured. Block apps above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e293b] text-left">
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">App Name</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Full Path</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {rules.map(rule => (
                  <tr key={rule.name} className="hover:bg-[#060b19] transition-colors">
                    <td className="px-6 py-3 text-slate-200 font-medium whitespace-nowrap">
                      {baseName(rule.appPath)}
                    </td>
                    <td className="px-6 py-3 text-slate-400 font-mono text-xs max-w-xs truncate" title={rule.appPath}>
                      {rule.appPath}
                    </td>
                    <td className="px-6 py-3">
                      {rule.enabled ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
                          <XCircle className="w-3 h-3" />
                          Blocking
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(rule)}
                          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                            rule.enabled
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 hover:bg-slate-700 border-slate-700'
                          }`}
                        >
                          <Play className="w-3 h-3" />
                          {rule.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Area */}
      <div className="bg-[#020617] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col h-[260px]">
        <div className="bg-[#060b19] px-4 py-2.5 border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-mono text-slate-400">firewall_log.exe</span>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {logs.length === 0 ? (
            <span className="text-slate-600">Waiting for activity...</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={logColor(line)}>{line}</div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
