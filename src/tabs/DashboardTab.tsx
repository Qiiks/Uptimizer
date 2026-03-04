import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, RefreshCw, Server } from 'lucide-react'
import * as networkService from '../services/networkService'

const SPARKLINE_WIDTH = 140
const SPARKLINE_HEIGHT = 48

const buildSparklinePoints = (values: number[]) => {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const step = SPARKLINE_WIDTH / Math.max(values.length - 1, 1)
  return values
    .map((value, index) => {
      const x = index * step
      const y = SPARKLINE_HEIGHT - (value / max) * SPARKLINE_HEIGHT
      return `${x},${y}`
    })
    .join(' ')
}

const getLatencyColor = (value: number | null) => {
  if (value === null) return 'text-slate-500'
  if (value < 40) return 'text-emerald-400'
  if (value < 80) return 'text-amber-400'
  return 'text-red-400'
}

export default function DashboardTab() {
  const [adapter, setAdapter] = useState<networkService.NetworkAdapter | null>(null)
  const [latencyHistory, setLatencyHistory] = useState<number[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetStatus, setResetStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [resetLogs, setResetLogs] = useState<string[]>([])

  useEffect(() => {
    networkService.getActiveAdapter().then(setAdapter).catch(console.error)
  }, [])

  useEffect(() => {
    let isActive = true

    const runPing = async () => {
      const result = await networkService.pingTest('8.8.8.8')
      if (!isActive) return
      if (result.success) {
        setLatencyHistory(prev => [...prev, result.latency].slice(-60))
      }
    }

    runPing()
    const timer = setInterval(runPing, 2000)

    return () => {
      isActive = false
      clearInterval(timer)
    }
  }, [])

  const averageLatency = useMemo(() => {
    if (latencyHistory.length === 0) return null
    const total = latencyHistory.reduce((sum, value) => sum + value, 0)
    return Math.round(total / latencyHistory.length)
  }, [latencyHistory])

  const latestLatency = latencyHistory.length ? latencyHistory[latencyHistory.length - 1] : null
  const sparklinePoints = useMemo(() => buildSparklinePoints(latencyHistory), [latencyHistory])

  const handleConfirmReset = async () => {
    setShowConfirm(false)
    setResetStatus('running')
    setResetLogs(['Initiating network reset sequence...', 'Preparing to flush DNS, release/renew IP, and reset Winsock...'])

    try {
      const result = await networkService.repairNetwork()
      const logLines = result.log.split('\n')
      setResetLogs(prev => [...prev, ...logLines])

      if (result.success) {
        setResetLogs(prev => [...prev, '[SUCCESS] Network reset completed. A restart may be required.'])
        setResetStatus('success')
      } else {
        setResetLogs(prev => [...prev, '[ERROR] Network reset encountered errors. Try running as Administrator.'])
        setResetStatus('error')
      }
    } catch (error) {
      setResetLogs(prev => [...prev, `[ERROR] Unexpected error: ${error instanceof Error ? error.message : String(error)}`])
      setResetStatus('error')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 flex flex-col gap-4">
        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4" /> Active Network Adapter
          </h3>
          {adapter ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                <span className="text-slate-400">Adapter Name</span>
                <span className="text-slate-200 font-medium" title={adapter.description}>{adapter.name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                <span className="text-slate-400">IPv4 Address</span>
                <span className="text-slate-200 font-mono">{adapter.ipAddress}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-400">Current MTU</span>
                <span className={`font-mono font-medium ${adapter.mtu === 1500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {adapter.mtu} {adapter.mtu === 1500 ? '(Sub-optimal)' : '(Optimized)'}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-500 animate-pulse">Scanning interfaces...</div>
          )}
        </div>

        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-sky-500/10 p-2 rounded-lg border border-sky-500/20">
                <RefreshCw className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h4 className="text-white font-medium">Live Latency Monitor</h4>
                <p className="text-xs text-slate-500">Polling 8.8.8.8 every 2s (last 60 samples).</p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${getLatencyColor(latestLatency)}`}>
                {latestLatency !== null ? `${latestLatency} ms` : '--'}
              </div>
              <div className="text-xs text-slate-500">Latest</div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400">Average</div>
              <div className={`text-lg font-semibold ${getLatencyColor(averageLatency)}`}>
                {averageLatency !== null ? `${averageLatency} ms` : '--'}
              </div>
            </div>
            <div className="bg-[#060b19] border border-[#1e293b] rounded-lg p-3">
              {latencyHistory.length ? (
                <svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} className="overflow-visible">
                  <polyline
                    points={sparklinePoints}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <div className="text-xs text-slate-600">Collecting samples...</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-center">
          <Activity className="w-10 h-10 text-emerald-400 mb-3 opacity-80" />
          <h3 className="text-2xl font-bold text-white mb-1">{averageLatency !== null ? `${averageLatency} ms` : '--'}</h3>
          <p className="text-sm text-slate-500">Average Latency</p>
        </div>

        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h4 className="text-white font-medium">Network Reset</h4>
              <p className="text-xs text-slate-500">Flush DNS, renew IP, and reset Winsock.</p>
            </div>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={resetStatus === 'running'}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-red-500/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            {resetStatus === 'running' ? 'Resetting...' : 'Network Reset'}
          </button>

          {resetStatus !== 'idle' && (
            <div className="mt-4 bg-[#060b19] border border-[#1e293b] rounded-lg p-3 text-xs font-mono text-slate-400 max-h-40 overflow-y-auto space-y-1">
              {resetLogs.map((log, index) => (
                <div key={index} className={`
                  ${log.includes('[SUCCESS]') ? 'text-emerald-400' : ''}
                  ${log.includes('[ERROR]') ? 'text-red-400' : ''}
                  ${log.startsWith('>') ? 'text-sky-400' : ''}
                `}>
                  {log}
                </div>
              ))}
              {resetStatus === 'running' && (
                <div className="text-slate-500 animate-pulse">{'>'} _</div>
              )}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Confirm Network Reset</h4>
                <p className="text-sm text-slate-400">This will temporarily drop your connection.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
