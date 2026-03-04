import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Globe, Play, Shield, Terminal, AlertCircle } from 'lucide-react'
import * as networkService from '../services/networkService'

export default function RepairTab() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [logs, setLogs] = useState<string[]>([])

  // IPv6 Manager state
  const [ipv6Logs, setIpv6Logs] = useState<string[]>([])
  const [ipv6Loading, setIpv6Loading] = useState(false)

  // Lockdown Mode state
  const [lockdownActive, setLockdownActive] = useState(false)
  const [lockdownLoading, setLockdownLoading] = useState(false)
  const [showLockdownConfirm, setShowLockdownConfirm] = useState(false)

  const handleStartRepair = async () => {
    setStatus('running')
    setLogs(['Initiating network repair sequence...', 'Preparing to flush DNS, release/renew IP, and reset Winsock...'])

    try {
      const result = await networkService.repairNetwork()
      
      const logLines = result.log.split('\n')
      setLogs(prev => [...prev, ...logLines])

      if (result.success) {
        setLogs(prev => [...prev, '[SUCCESS] Network repair completed successfully. A restart may be required.'])
        setStatus('success')
      } else {
        setLogs(prev => [...prev, '[ERROR] Network repair encountered errors. Please try running as Administrator.'])
        setStatus('error')
      }
    } catch (error) {
      setLogs(prev => [...prev, `[ERROR] Unexpected error: ${error instanceof Error ? error.message : String(error)}`])
      setStatus('error')
    }
  }

  const handleDisableTeredo = async () => {
    setIpv6Loading(true)
    const result = window.networkingApi
      ? await window.networkingApi.executeCommand('netsh interface teredo set state disabled')
      : { stdout: '[MOCK] Teredo disabled', stderr: '', error: null }
    setIpv6Logs(prev => [...prev, result.error ? `[ERROR] ${result.error}` : `[SUCCESS] Teredo disabled`])
    setIpv6Loading(false)
  }

  const handleDisableIPv6 = async () => {
    setIpv6Loading(true)
    const result = window.networkingApi
      ? await window.networkingApi.executeCommand('netsh interface ipv6 set global randomizeidentifiers=disabled store=active')
      : { stdout: '[MOCK] IPv6 privacy extensions disabled', stderr: '', error: null }
    setIpv6Logs(prev => [...prev, result.error ? `[ERROR] ${result.error}` : `[SUCCESS] IPv6 privacy extensions disabled`])
    setIpv6Loading(false)
  }

  const handleLockdown = async (activate: boolean) => {
    setLockdownLoading(true)
    const policy = activate ? 'blockinbound,blockoutbound' : 'blockinbound,allowoutbound'
    const result = window.networkingApi
      ? await window.networkingApi.executeCommand(`netsh advfirewall set allprofiles firewallpolicy ${policy}`)
      : { stdout: '[MOCK] Firewall policy updated', stderr: '', error: null }
    if (!result.error) setLockdownActive(activate)
    setLockdownLoading(false)
    setShowLockdownConfirm(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Control Panel */}
        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
          <div className="flex gap-4 mb-6">
            <div className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/20 h-fit">
              <Shield className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Network Repair Toolkit</h3>
              <p className="text-sm text-slate-400 mt-1">Resolve connectivity issues by flushing DNS, renewing IP leases, and resetting the Winsock catalog.</p>
            </div>
          </div>

          {status === 'success' ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-5 mb-6 text-center animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <h4 className="text-emerald-400 font-medium mb-1">Repair Successful</h4>
              <p className="text-xs text-slate-400">Network configuration has been reset. You may need to restart your computer for all changes to take effect.</p>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-5 mb-6 text-center animate-in fade-in slide-in-from-bottom-2">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <h4 className="text-red-400 font-medium mb-1">Repair Failed</h4>
              <p className="text-xs text-slate-400">Some commands failed to execute. Try running the application as an Administrator.</p>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button 
              onClick={handleStartRepair}
              disabled={status === 'running'}
              className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.3)]"
            >
              <Play className="w-4 h-4" />
              {status === 'running' ? 'Running Repair...' : status === 'idle' ? 'Start Repair' : 'Run Again'}
            </button>
          </div>
        </div>

        {/* Live Terminal / Logs */}
        <div className="bg-[#020617] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
          <div className="bg-[#060b19] px-4 py-2.5 border-b border-[#1e293b] flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-mono text-slate-400">repair_console.exe</span>
          </div>
          <div className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {logs.length === 0 ? (
              <div className="text-slate-600 h-full flex items-center justify-center italic">Waiting to begin...</div>
            ) : (
              <div className="space-y-1.5">
                {logs.map((log, i) => (
                  <div key={i} className={`
                    ${log.includes('[SUCCESS]') ? 'text-emerald-400' : ''}
                    ${log.includes('[ERROR]') ? 'text-red-400' : ''}
                    ${!log.includes('[') && !log.startsWith('>') ? 'text-slate-300' : ''}
                    ${log.startsWith('>') ? 'text-sky-400' : ''}
                  `}>
                    {log && !log.startsWith('>') && <span className="text-slate-600 mr-2">{'>'}</span>}
                    {log}
                  </div>
                ))}
                {status === 'running' && (
                  <div className="text-slate-500 animate-pulse"><span className="text-slate-600 mr-2">{'>'}</span>_</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── IPv6 Manager ──────────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-sky-500/10 p-2.5 rounded-lg border border-sky-500/20 h-fit">
            <Globe className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">IPv6 Manager</h4>
            <p className="text-xs text-slate-400 mt-0.5">Teredo is a tunneling protocol that can add latency. IPv6 privacy extensions rotate your IP frequently.</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <button
              onClick={handleDisableTeredo}
              disabled={ipv6Loading}
              className="flex-1 flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
            >
              {ipv6Loading ? 'Working…' : 'Disable Teredo'}
            </button>
            <button
              onClick={handleDisableIPv6}
              disabled={ipv6Loading}
              className="flex-1 flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
            >
              {ipv6Loading ? 'Working…' : 'Disable IPv6 Privacy Extensions'}
            </button>
          </div>

          {ipv6Logs.length > 0 && (
            <div className="bg-[#020617] border border-[#1e293b] rounded-lg p-3 flex flex-col h-24 overflow-y-auto">
              <div className="font-mono text-xs space-y-1">
                {ipv6Logs.map((log, i) => (
                  <div key={i} className={`${
                    log.includes('[SUCCESS]') ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    <span className="text-slate-600 mr-2">{'>'}</span>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Lockdown Mode ────────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20 h-fit">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Lockdown Mode</h4>
              <p className="text-xs text-slate-400 mt-0.5">Only use this to immediately cut off all network access in an emergency.</p>
            </div>
          </div>
          <span className={`text-sm font-bold px-4 py-2 rounded-full border flex-shrink-0 ${
            lockdownActive
              ? 'text-red-400 border-red-500/30 bg-red-500/10 animate-pulse'
              : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          }`}>
            {lockdownActive ? 'LOCKDOWN ACTIVE' : 'Normal Mode'}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowLockdownConfirm(true)}
            disabled={lockdownLoading || lockdownActive}
            className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
          >
            {lockdownLoading ? 'Working…' : 'Enable Lockdown'}
          </button>
          {lockdownActive && (
            <button
              onClick={() => handleLockdown(false)}
              disabled={lockdownLoading}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
            >
              {lockdownLoading ? 'Working…' : 'Disable Lockdown'}
            </button>
          )}
        </div>

        {showLockdownConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-[#0a0f1e] border border-red-500/30 rounded-lg p-6 max-w-md">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <h3 className="text-base font-semibold text-white">Enable Lockdown Mode?</h3>
              </div>
              <p className="text-sm text-slate-300 mb-6">This will block ALL inbound AND outbound network traffic. You will lose internet access immediately.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleLockdown(true)}
                  disabled={lockdownLoading}
                  className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200"
                >
                  {lockdownLoading ? 'Enabling…' : 'Yes, Lock Down'}
                </button>
                <button
                  onClick={() => setShowLockdownConfirm(false)}
                  disabled={lockdownLoading}
                  className="flex-1 bg-[#060b19] hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-slate-200 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 border border-[#1e293b]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
