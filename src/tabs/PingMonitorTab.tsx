// src/tabs/PingMonitorTab.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import type { PingSample } from '../services/networkService'
import { singlePing } from '../services/networkService'
import {
  Activity,
  AlertTriangle,
  Play,
  RotateCcw,
  Save,
  Globe,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHART_SAMPLES = 60
const MAX_HISTORY_SAMPLES = 500
const HISTORY_KEY = 'pingHistory'
const CHART_WIDTH = 600
const CHART_HEIGHT = 120
const CHART_MAX_LATENCY = 300
const CHART_Y_PADDING = 10

// ─── Helpers ───────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function latencyToY(latency: number): number {
  // Map 0..CHART_MAX_LATENCY → CHART_HEIGHT - CHART_Y_PADDING..CHART_Y_PADDING (inverted)
  const ratio = clamp(latency, 0, CHART_MAX_LATENCY) / CHART_MAX_LATENCY
  return CHART_HEIGHT - CHART_Y_PADDING - ratio * (CHART_HEIGHT - CHART_Y_PADDING * 2)
}

function sampleToX(index: number, total: number): number {
  if (total <= 1) return 0
  return index * (CHART_WIDTH / (MAX_CHART_SAMPLES - 1))
}

function dotColor(latency: number | null): string {
  if (latency === null) return '#475569'
  if (latency < 50) return '#10b981'
  if (latency <= 150) return '#f59e0b'
  return '#ef4444'
}

function latencyTextColor(latency: number | null): string {
  if (latency === null) return 'text-slate-500'
  if (latency < 50) return 'text-emerald-400'
  if (latency <= 150) return 'text-amber-400'
  return 'text-red-400'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

function loadHistoryFromStorage(): PingSample[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as PingSample[]
  } catch {
    return []
  }
}

// ─── SVG Polyline Chart ─────────────────────────────────────────────────────────

interface LiveChartProps {
  samples: PingSample[]
  threshold: number
}

function LiveChart({ samples, threshold }: LiveChartProps) {
  const hasSpike = samples.some(s => s.latency !== null && s.latency > threshold)
  const lineColor = hasSpike ? '#f59e0b' : '#0ea5e9'

  // Build segments: split on null (timeout) values
  const segments: Array<Array<{ x: number; y: number; idx: number }>> = []
  let current: Array<{ x: number; y: number; idx: number }> = []

  samples.forEach((s, idx) => {
    if (s.latency === null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
    } else {
      current.push({ x: sampleToX(idx, samples.length), y: latencyToY(s.latency), idx })
    }
  })
  if (current.length > 0) segments.push(current)

  const validLatencies = samples.filter(s => s.latency !== null).map(s => s.latency as number)
  const minLat = validLatencies.length > 0 ? Math.min(...validLatencies) : null
  const maxLat = validLatencies.length > 0 ? Math.max(...validLatencies) : null

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width="100%"
      height="120"
      style={{ background: '#060b19', display: 'block', borderRadius: '6px' }}
    >
      {/* Grid lines at 25%, 50%, 75% */}
      {[0.25, 0.5, 0.75].map(pct => {
        const y = CHART_HEIGHT - CHART_Y_PADDING - pct * (CHART_HEIGHT - CHART_Y_PADDING * 2)
        return (
          <line
            key={pct}
            x1={0}
            y1={y}
            x2={CHART_WIDTH}
            y2={y}
            stroke="#1e293b"
            strokeWidth={1}
          />
        )
      })}

      {/* Threshold line */}
      {threshold <= CHART_MAX_LATENCY && (
        <line
          x1={0}
          y1={latencyToY(threshold)}
          x2={CHART_WIDTH}
          y2={latencyToY(threshold)}
          stroke="#f59e0b"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
        />
      )}

      {/* Polyline segments */}
      {segments.map((seg, i) => {
        if (seg.length < 2) return null
        const points = seg.map(p => `${p.x},${p.y}`).join(' ')
        return (
          <polyline
            key={i}
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        )
      })}

      {/* Dots */}
      {samples.map((s, idx) => {
        const x = sampleToX(idx, samples.length)
        const y = s.latency !== null ? latencyToY(s.latency) : CHART_HEIGHT / 2
        return (
          <circle
            key={idx}
            cx={x}
            cy={y}
            r={2}
            fill={dotColor(s.latency)}
          />
        )
      })}

      {/* Axis labels */}
      {minLat !== null && (
        <text x={4} y={CHART_HEIGHT - 4} fontSize={9} fill="#64748b">
          {minLat}ms
        </text>
      )}
      {maxLat !== null && (
        <text x={4} y={14} fontSize={9} fill="#64748b">
          {maxLat}ms
        </text>
      )}
    </svg>
  )
}

// ─── Session Stats ──────────────────────────────────────────────────────────────

interface SessionStats {
  avg: number
  min: number
  max: number
  spikes: number
}

function computeStats(samples: PingSample[], threshold: number): SessionStats | null {
  const valid = samples.filter(s => s.latency !== null).map(s => s.latency as number)
  if (valid.length === 0) return null
  const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const spikes = valid.filter(l => l > threshold).length
  return { avg, min, max, spikes }
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function PingMonitorTab() {
  const [target, setTarget] = useState('1.1.1.1')
  const [intervalSec, setIntervalSec] = useState(2)
  const [threshold, setThreshold] = useState(150)
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [samples, setSamples] = useState<PingSample[]>([])
  const [history, setHistory] = useState<PingSample[]>(() => loadHistoryFromStorage())
  const [currentLatency, setCurrentLatency] = useState<number | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const targetRef = useRef(target)
  const thresholdRef = useRef(threshold)
  const alertsRef = useRef(alertsEnabled)
  const samplesRef = useRef<PingSample[]>([])

  // Keep refs in sync
  useEffect(() => { targetRef.current = target }, [target])
  useEffect(() => { thresholdRef.current = threshold }, [threshold])
  useEffect(() => { alertsRef.current = alertsEnabled }, [alertsEnabled])
  useEffect(() => { samplesRef.current = samples }, [samples])

  const firePing = useCallback(async () => {
    const t = targetRef.current
    const latency = await singlePing(t)
    const sample: PingSample = { timestamp: Date.now(), latency, target: t }

    // Update samples (rolling 60)
    setSamples(prev => {
      const next = [...prev, sample].slice(-MAX_CHART_SAMPLES)
      samplesRef.current = next
      setSessionStats(computeStats(next, thresholdRef.current))
      return next
    })

    // Update history (rolling 500) and persist
    setHistory(prev => {
      const next = [...prev, sample].slice(-MAX_HISTORY_SAMPLES)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // storage quota exceeded — silently ignore
      }
      return next
    })

    setCurrentLatency(latency)

    // Notification on spike
    if (
      latency !== null &&
      latency > thresholdRef.current &&
      alertsRef.current &&
      'Notification' in window &&
      Notification.permission !== 'denied'
    ) {
      new Notification('Uptimizer — Latency Spike', {
        body: `${t}: ${latency}ms (threshold: ${thresholdRef.current}ms)`,
        silent: false,
      })
    }
  }, [])

  // Start / stop interval
  useEffect(() => {
    if (isRunning) {
      // Request notification permission if needed
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined)
      }
      firePing()
      intervalRef.current = setInterval(firePing, intervalSec * 1000)
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, intervalSec])

  const handleReset = () => {
    setIsRunning(false)
    setSamples([])
    setCurrentLatency(null)
    setSessionStats(null)
  }

  const handleExportCsv = () => {
    const header = 'Timestamp,Target,Latency(ms)'
    const rows = history.map(s =>
      `${new Date(s.timestamp).toISOString()},${s.target},${s.latency ?? 'timeout'}`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ping-history-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const displayedHistory = history.slice(-20).reverse()

  return (
    <div className="flex flex-col gap-4 p-4">

      {/* ── Control Card ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#1e293b] bg-[#0a0f1e] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-sky-500" />
          <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            Ping Monitor
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Target */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Target Host / IP</label>
            <input
              type="text"
              value={target}
              disabled={isRunning}
              onChange={e => setTarget(e.target.value)}
              className="rounded-lg bg-[#060b19] border border-[#1e293b] text-slate-200 text-sm px-3 py-2 focus:outline-none focus:border-sky-500 disabled:opacity-50 transition-all duration-200"
              placeholder="e.g. 1.1.1.1"
            />
          </div>

          {/* Current Latency */}
          <div className="flex flex-col gap-1 items-end justify-center">
            <span className="text-xs text-slate-400">Current Latency</span>
            <span
              className={`text-4xl font-bold tabular-nums transition-colors duration-300 ${latencyTextColor(currentLatency)}`}
            >
              {currentLatency !== null ? `${currentLatency}` : '--'}
              <span className="text-base text-slate-500 ml-1">ms</span>
            </span>
          </div>

          {/* Interval Slider */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">
              Interval: <span className="text-slate-300">{intervalSec}s</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={intervalSec}
              disabled={isRunning}
              onChange={e => setIntervalSec(Number(e.target.value))}
              className="accent-sky-500 disabled:opacity-50"
            />
          </div>

          {/* Threshold Slider */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">
              Spike Threshold: <span className="text-slate-300">{threshold}ms</span>
            </label>
            <input
              type="range"
              min={50}
              max={500}
              step={10}
              value={threshold}
              disabled={isRunning}
              onChange={e => setThreshold(Number(e.target.value))}
              className="accent-amber-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Alerts toggle + Start/Stop/Reset */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button
            onClick={() => setAlertsEnabled(v => !v)}
            disabled={isRunning}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border transition-all duration-200 disabled:opacity-50 ${
              alertsEnabled
                ? 'bg-sky-500/10 border-sky-500/40 text-sky-400'
                : 'bg-slate-800 border-[#1e293b] text-slate-400'
            }`}
          >
            {alertsEnabled
              ? <CheckCircle2 className="w-3.5 h-3.5" />
              : <XCircle className="w-3.5 h-3.5" />
            }
            Spike Alerts {alertsEnabled ? 'On' : 'Off'}
          </button>

          <div className="flex-1" />

          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium bg-slate-800 border border-[#1e293b] text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-all duration-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            onClick={() => setIsRunning(v => !v)}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-200 ${
              isRunning
                ? 'bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20'
                : 'bg-sky-500 text-white hover:bg-sky-400'
            }`}
          >
            {isRunning ? (
              <>
                <AlertTriangle className="w-4 h-4" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Live Chart Card ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#1e293b] bg-[#0a0f1e] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-sky-500" />
          <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            Live Chart
          </h2>
          {isRunning && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>

        <LiveChart samples={samples} threshold={threshold} />

        {/* Session Stats */}
        {sessionStats !== null ? (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { label: 'Avg', value: `${sessionStats.avg}ms`, color: 'text-slate-300' },
              { label: 'Min', value: `${sessionStats.min}ms`, color: 'text-emerald-400' },
              { label: 'Max', value: `${sessionStats.max}ms`, color: 'text-red-400' },
              { label: 'Spikes', value: String(sessionStats.spikes), color: 'text-amber-400' },
            ].map(stat => (
              <div key={stat.label} className="rounded-lg bg-[#060b19] border border-[#1e293b] px-3 py-2 text-center">
                <div className="text-xs text-slate-500">{stat.label}</div>
                <div className={`text-sm font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-center text-xs text-slate-600">
            Start monitoring to see session statistics
          </div>
        )}
      </div>

      {/* ── History Card ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#1e293b] bg-[#0a0f1e] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-sky-500" />
          <h2 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            History
          </h2>
          <span className="ml-2 text-xs text-slate-500">{history.length} samples</span>
          <div className="flex-1" />
          <button
            onClick={handleExportCsv}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {displayedHistory.length === 0 ? (
          <div className="text-center text-xs text-slate-600 py-6">
            No history yet — start monitoring to collect samples
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e293b]">
                  <th className="text-left text-slate-500 font-medium pb-2 pr-4">Time</th>
                  <th className="text-left text-slate-500 font-medium pb-2 pr-4">Target</th>
                  <th className="text-right text-slate-500 font-medium pb-2">Latency</th>
                </tr>
              </thead>
              <tbody>
                {displayedHistory.map((s, idx) => (
                  <tr key={idx} className="border-b border-[#1e293b]/50 hover:bg-white/[0.02] transition-colors">
                    <td className="text-slate-400 py-1.5 pr-4 font-mono">{formatTime(s.timestamp)}</td>
                    <td className="text-slate-300 py-1.5 pr-4">{s.target}</td>
                    <td className={`text-right py-1.5 font-mono font-semibold tabular-nums ${latencyTextColor(s.latency)}`}>
                      {s.latency !== null ? `${s.latency}ms` : 'timeout'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
