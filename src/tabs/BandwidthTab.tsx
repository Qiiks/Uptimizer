import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Play, RotateCcw, Server, Info, Cpu } from 'lucide-react'
import { getAdapterStats, getProcessConnections } from '../services/networkService'
import type { AdapterStats, BandwidthSample, ProcessConnection } from '../services/networkService'

const STORAGE_KEY = 'bwHistory'
const MAX_SAMPLES = 60
const MAX_HISTORY = 500
const POLL_INTERVAL = 2000

function loadHistory(): BandwidthSample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(-MAX_HISTORY) as BandwidthSample[]
  } catch {
    return []
  }
}

function saveHistory(history: BandwidthSample[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)))
  } catch {
    // localStorage full or unavailable
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function buildLinePath(values: number[], maxVal: number, width: number, height: number): string {
  if (values.length === 0) return ''
  const safeMax = Math.max(maxVal, 0.01)
  const step = width / Math.max(values.length - 1, 1)
  return values
    .map((v, i) => {
      const x = i * step
      const y = height - (v / safeMax) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export default function BandwidthTab() {
  const [samples, setSamples] = useState<BandwidthSample[]>([])
  const [history, setHistory] = useState<BandwidthSample[]>(loadHistory)
  const [prevStats, setPrevStats] = useState<AdapterStats[] | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [currentRx, setCurrentRx] = useState(0)
  const [currentTx, setCurrentTx] = useState(0)
  const [processConnections, setProcessConnections] = useState<ProcessConnection[]>([])
  const [loadingProc, setLoadingProc] = useState(false)
  const [selectedAdapter, setSelectedAdapter] = useState('')
  const [adapterNames, setAdapterNames] = useState<string[]>([])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevStatsRef = useRef<AdapterStats[] | null>(null)
  const selectedAdapterRef = useRef(selectedAdapter)

  // Keep refs in sync
  useEffect(() => {
    prevStatsRef.current = prevStats
  }, [prevStats])

  useEffect(() => {
    selectedAdapterRef.current = selectedAdapter
  }, [selectedAdapter])

  const pollStats = useCallback(async () => {
    const stats = await getAdapterStats()
    if (stats.length === 0) return

    // Update adapter names on first poll
    const names = stats.map(s => s.name)
    setAdapterNames(prev => {
      if (prev.length === 0 || prev.join(',') !== names.join(',')) return names
      return prev
    })

    // Select first adapter if none selected
    if (!selectedAdapterRef.current && names.length > 0) {
      setSelectedAdapter(names[0])
      selectedAdapterRef.current = names[0]
    }

    const prev = prevStatsRef.current
    if (prev) {
      const adapterName = selectedAdapterRef.current
      const current = stats.find(s => s.name === adapterName)
      const previous = prev.find(s => s.name === adapterName)

      if (current && previous) {
        const deltaTime = (current.timestamp - previous.timestamp) / 1000 // seconds
        if (deltaTime > 0) {
          const rxBytes = Math.max(0, current.rxBytes - previous.rxBytes)
          const txBytes = Math.max(0, current.txBytes - previous.txBytes)
          const rxMbps = (rxBytes * 8) / (deltaTime * 1_000_000)
          const txMbps = (txBytes * 8) / (deltaTime * 1_000_000)

          const sample: BandwidthSample = {
            timestamp: Date.now(),
            rxMbps: Math.round(rxMbps * 100) / 100,
            txMbps: Math.round(txMbps * 100) / 100,
            adapterName,
          }

          setCurrentRx(sample.rxMbps)
          setCurrentTx(sample.txMbps)

          setSamples(prev => {
            const next = [...prev, sample].slice(-MAX_SAMPLES)
            return next
          })

          setHistory(prev => {
            const next = [...prev, sample].slice(-MAX_HISTORY)
            saveHistory(next)
            return next
          })
        }
      }
    }

    setPrevStats(stats)
    prevStatsRef.current = stats
  }, [])

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true)
    // Immediately poll to capture initial stats
    pollStats()
    intervalRef.current = setInterval(pollStats, POLL_INTERVAL)
  }, [pollStats])

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const refreshConnections = async () => {
    setLoadingProc(true)
    try {
      const conns = await getProcessConnections()
      setProcessConnections(conns.sort((a, b) => a.process.localeCompare(b.process)))
    } catch {
      setProcessConnections([])
    }
    setLoadingProc(false)
  }

  // Chart data
  const rxValues = samples.map(s => s.rxMbps)
  const txValues = samples.map(s => s.txMbps)
  const chartMax = Math.max(...rxValues, ...txValues, 1)
  const chartW = 600
  const chartH = 140
  const rxPath = buildLinePath(rxValues, chartMax, chartW, chartH)
  const txPath = buildLinePath(txValues, chartMax, chartW, chartH)

  // History: last 20 entries
  const recentHistory = history.slice(-20).reverse()

  return (
    <div className="space-y-4">
      {/* ── Live Stats Card ───────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-[#0a0f1e] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-400" />
            <h2 className="text-lg font-semibold text-slate-100">Live Bandwidth Monitor</h2>
          </div>
          <div className="flex items-center gap-3">
            {adapterNames.length > 1 && (
              <select
                value={selectedAdapter}
                onChange={e => setSelectedAdapter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-[#060b19] px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
              >
                {adapterNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            )}
            <button
              onClick={isMonitoring ? stopMonitoring : startMonitoring}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                isMonitoring
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-sky-500/20 text-sky-400 hover:bg-sky-500/30'
              }`}
            >
              <Play className="h-4 w-4" />
              {isMonitoring ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>

        {/* Live numbers */}
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-800 bg-[#060b19] p-4 text-center">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">Download</p>
            <p className="text-3xl font-bold text-sky-400">{currentRx.toFixed(2)}</p>
            <p className="text-xs text-slate-500">Mbps</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-[#060b19] p-4 text-center">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">Upload</p>
            <p className="text-3xl font-bold text-violet-400">{currentTx.toFixed(2)}</p>
            <p className="text-xs text-slate-500">Mbps</p>
          </div>
        </div>

        {selectedAdapter && (
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <Server className="h-3.5 w-3.5" />
            <span>Adapter: {selectedAdapter}</span>
            <span className="ml-auto">{samples.length} / {MAX_SAMPLES} samples</span>
          </div>
        )}

        {/* SVG Chart */}
        <div className="rounded-lg border border-slate-800 bg-[#060b19] p-3">
          {/* Legend */}
          <div className="mb-2 flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" />
              Download
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-400" />
              Upload
            </span>
            <span className="ml-auto text-slate-600">Max: {chartMax.toFixed(1)} Mbps</span>
          </div>

          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full"
            style={{ height: '140px' }}
            preserveAspectRatio="none"
          >
            <rect x="0" y="0" width={chartW} height={chartH} fill="#060b19" />
            {/* Grid lines */}
            {[0.25, 0.5, 0.75, 1].map(pct => (
              <line
                key={pct}
                x1="0"
                y1={chartH - pct * chartH}
                x2={chartW}
                y2={chartH - pct * chartH}
                stroke="#1e293b"
                strokeWidth="1"
              />
            ))}
            {/* Download line */}
            {rxPath && (
              <path d={rxPath} fill="none" stroke="#0ea5e9" strokeWidth="2" />
            )}
            {/* Upload line */}
            {txPath && (
              <path d={txPath} fill="none" stroke="#a78bfa" strokeWidth="2" />
            )}
          </svg>
        </div>
      </div>

      {/* ── Process Connections Card ─────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-[#0a0f1e] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-slate-100">Process Connections</h2>
          </div>
          <button
            onClick={refreshConnections}
            disabled={loadingProc}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition-all duration-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <RotateCcw className={`h-4 w-4 ${loadingProc ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Requires administrator privileges. Results may be incomplete.
        </div>

        <div className="max-h-64 overflow-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#060b19] text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Process</th>
                <th className="px-3 py-2">Local</th>
                <th className="px-3 py-2">Remote</th>
                <th className="px-3 py-2">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {processConnections.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                    Click Refresh to load connections
                  </td>
                </tr>
              ) : (
                processConnections.map((conn, idx) => (
                  <tr key={`${conn.process}-${conn.localAddress}-${idx}`} className="text-slate-300 hover:bg-slate-800/30">
                    <td className="px-3 py-1.5 font-mono text-xs text-sky-400">{conn.process}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{conn.localAddress}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{conn.foreignAddress}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-xs ${conn.state === 'ESTABLISHED' ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {conn.state || '-'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── History Card ─────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-[#0a0f1e] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Server className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-slate-100">Bandwidth History</h2>
          <span className="ml-2 text-xs text-slate-500">Last 24h usage from localStorage (approximate)</span>
        </div>

        <div className="max-h-64 overflow-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#060b19] text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Adapter</th>
                <th className="px-3 py-2 text-right">Download (Mbps)</th>
                <th className="px-3 py-2 text-right">Upload (Mbps)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {recentHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                    No history yet. Start monitoring to collect data.
                  </td>
                </tr>
              ) : (
                recentHistory.map((entry, idx) => (
                  <tr key={`${entry.timestamp}-${idx}`} className="text-slate-300 hover:bg-slate-800/30">
                    <td className="px-3 py-1.5 font-mono text-xs">{formatTime(entry.timestamp)}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-400">{entry.adapterName}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-sky-400">{entry.rxMbps.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-violet-400">{entry.txMbps.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
