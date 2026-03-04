import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, Play, RotateCcw, Zap, Wifi, Globe } from 'lucide-react'
import { pingTest } from '../services/networkService'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpeedResult {
  timestamp: string
  download: number
  upload: number
  ping: number
  jitter: number
  loss: number
}

type TestPhase =
  | 'idle'
  | 'ping'
  | 'download'
  | 'upload'
  | 'loss'
  | 'done'

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'uptimizer_speedtest_history'
const MAX_HISTORY = 20
const CF_BASE = 'https://speed.cloudflare.com'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isElectron = () =>
  typeof window !== 'undefined' && window.networkingApi !== undefined

const loadHistory = (): SpeedResult[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SpeedResult[]) : []
  } catch {
    return []
  }
}

const saveHistory = (results: SpeedResult[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results.slice(0, MAX_HISTORY)))
  } catch {
    // ignore quota errors
  }
}

const fmt = (n: number, dec = 1) => n.toFixed(dec)

// ─── Animated Ring ────────────────────────────────────────────────────────────

interface RingProps {
  value: number
  maxValue: number
  label: string
  unit: string
  color: 'sky' | 'emerald'
  animating: boolean
}

function SpeedRing({ value, maxValue, label, unit, color, animating }: RingProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    if (animating) {
      // During animation phase, tick up a live counter
      fromRef.current = displayValue
      return
    }

    // Animate to the final value
    const target = value
    const from = fromRef.current
    const duration = 900

    const step = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(from + (target - from) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        setDisplayValue(target)
        startRef.current = null
        fromRef.current = target
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = null
    rafRef.current = requestAnimationFrame(step)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, animating, displayValue]) // intentionally omit displayValue to avoid re-triggering

  // Live tick during test phase
  useEffect(() => {
    if (!animating) return
    let ticking = true
    const tick = () => {
      if (!ticking) return
      setDisplayValue(prev => {
        // oscillate randomly within ±30% of a plausible mid value
        const mid = maxValue * 0.4
        const delta = (Math.random() - 0.5) * mid * 0.3
        return Math.max(0, Math.min(maxValue, prev + delta))
      })
      setTimeout(tick, 120)
    }
    tick()
    return () => { ticking = false }
  }, [animating, maxValue])

  const radius = 54
  const stroke = 8
  const normalised = radius - stroke / 2
  const circumference = 2 * Math.PI * normalised
  const pct = Math.min(displayValue / maxValue, 1)
  const dash = pct * circumference
  const gap = circumference - dash

  const strokeColor = color === 'sky' ? '#0ea5e9' : '#10b981'
  const glowColor   = color === 'sky' ? 'rgba(14,165,233,0.35)' : 'rgba(16,185,129,0.35)'

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{label}</p>
      <div className="relative" style={{ width: 128, height: 128 }}>
        <svg width={128} height={128} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={64}
            cy={64}
            r={normalised}
            fill="none"
            stroke="#1e293b"
            strokeWidth={stroke}
          />
          {/* Progress arc */}
          <circle
            cx={64}
            cy={64}
            r={normalised}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            style={{
              filter: `drop-shadow(0 0 6px ${glowColor})`,
              transition: animating ? 'none' : 'stroke-dasharray 0.05s ease-out',
            }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold tabular-nums leading-none"
            style={{
              fontSize: displayValue >= 1000 ? '1.35rem' : '1.6rem',
              color: strokeColor,
            }}
          >
            {fmt(displayValue)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 font-medium">{unit}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SpeedtestTab() {
  const [phase, setPhase]           = useState<TestPhase>('idle')
  const [step, setStep]             = useState(0)       // 1-4
  const [stepLabel, setStepLabel]   = useState('')
  const [progress, setProgress]     = useState(0)

  const [download, setDownload]     = useState(0)
  const [upload, setUpload]         = useState(0)
  const [ping, setPing]             = useState(0)
  const [jitter, setJitter]         = useState(0)
  const [loss, setLoss]             = useState(0)

  const [history, setHistory]       = useState<SpeedResult[]>(() => loadHistory())

  const isTesting = phase !== 'idle' && phase !== 'done'

  // ── Measurement functions ──────────────────────────────────────────────────

  const measurePingJitter = useCallback(async (): Promise<{ pingMs: number; jitterMs: number }> => {
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      try {
        await fetch(`${CF_BASE}/__down?bytes=0`, { method: 'HEAD', cache: 'no-store' })
      } catch {
        // count as a missed sample
        continue
      }
      samples.push(performance.now() - t0)
    }

    if (samples.length === 0) return { pingMs: 999, jitterMs: 0 }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    const variance = samples.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / samples.length
    return { pingMs: Math.round(avg), jitterMs: Math.round(Math.sqrt(variance)) }
  }, [])

  const measureDownload = useCallback(async (): Promise<number> => {
    const bytes = 25_000_000
    const t0 = performance.now()
    try {
      const res = await fetch(`${CF_BASE}/__down?bytes=${bytes}`, { cache: 'no-store' })
      if (!res.body) {
        const t1 = performance.now()
        return (bytes * 8) / ((t1 - t0) / 1000) / 1_000_000
      }
      const reader = res.body.getReader()
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value?.byteLength ?? 0
      }
      const elapsed = performance.now() - t0
      return (received * 8) / (elapsed / 1000) / 1_000_000
    } catch {
      return 0
    }
  }, [])

  const measureUpload = useCallback(async (): Promise<number> => {
    const size = 5_000_000
    const body = new Uint8Array(size)
    // fill with pseudo-random bytes so it cannot be compressed by network stack
    for (let i = 0; i < size; i++) body[i] = Math.floor(Math.random() * 256)

    const t0 = performance.now()
    try {
      await fetch(`${CF_BASE}/__up`, {
        method: 'POST',
        body,
        cache: 'no-store',
      })
    } catch {
      return 0
    }
    const elapsed = performance.now() - t0
    return (size * 8) / (elapsed / 1000) / 1_000_000
  }, [])

  const measurePacketLoss = useCallback(async (): Promise<number> => {
    if (!isElectron()) return 0

    const total = 20
    let successes = 0
    // Fire all pings concurrently in batches of 5 to keep it fast
    const batches = Array.from({ length: Math.ceil(total / 5) }, (_, i) =>
      Array.from({ length: Math.min(5, total - i * 5) }, () =>
        pingTest('1.1.1.1', 32, false).then(r => { if (r.success) successes++ })
      )
    )
    for (const batch of batches) {
      await Promise.all(batch)
    }
    return parseFloat(((total - successes) / total * 100).toFixed(1))
  }, [])

  // ── Run test sequence ──────────────────────────────────────────────────────

  const runTest = useCallback(async () => {
    // Reset display
    setDownload(0)
    setUpload(0)
    setPing(0)
    setJitter(0)
    setLoss(0)
    setProgress(0)

    // Step 1 — Ping & Jitter
    setPhase('ping')
    setStep(1)
    setStepLabel('Measuring ping & jitter...')
    setProgress(5)
    const { pingMs, jitterMs } = await measurePingJitter()
    setPing(pingMs)
    setJitter(jitterMs)
    setProgress(25)

    // Step 2 — Download
    setPhase('download')
    setStep(2)
    setStepLabel('Testing download speed...')
    const dlMbps = await measureDownload()
    setDownload(dlMbps)
    setProgress(55)

    // Step 3 — Upload
    setPhase('upload')
    setStep(3)
    setStepLabel('Testing upload speed...')
    const ulMbps = await measureUpload()
    setUpload(ulMbps)
    setProgress(80)

    // Step 4 — Packet loss
    setPhase('loss')
    setStep(4)
    setStepLabel('Measuring packet loss...')
    const lossVal = await measurePacketLoss()
    setLoss(lossVal)
    setProgress(100)

    // Done — persist result
    const result: SpeedResult = {
      timestamp: new Date().toLocaleString(),
      download: parseFloat(dlMbps.toFixed(1)),
      upload: parseFloat(ulMbps.toFixed(1)),
      ping: pingMs,
      jitter: jitterMs,
      loss: lossVal,
    }

    setHistory(prev => {
      const next = [result, ...prev].slice(0, MAX_HISTORY)
      saveHistory(next)
      return next
    })

    setPhase('done')
    setStepLabel('Test complete')
  }, [measurePingJitter, measureDownload, measureUpload, measurePacketLoss])

  const handleStart = () => {
    if (isTesting) return
    runTest().catch(console.error)
  }

  const handleReset = () => {
    setPhase('idle')
    setStep(0)
    setStepLabel('')
    setProgress(0)
    setDownload(0)
    setUpload(0)
    setPing(0)
    setJitter(0)
    setLoss(0)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  // During the download phase the ring should "animate"; during upload phase the upload ring animates
  const dlAnimating = phase === 'download'
  const ulAnimating = phase === 'upload'

  const shown10 = history.slice(0, 10)

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── Hero card ── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-8 shadow-sm">

        {/* Rings */}
        <div className="flex items-center justify-center gap-16 mb-10">
          <SpeedRing
            value={download}
            maxValue={200}
            label="Download"
            unit="Mbps"
            color="sky"
            animating={dlAnimating}
          />

          {/* Centre divider */}
          <div className="flex flex-col items-center gap-2 select-none">
            <Wifi className="w-5 h-5 text-slate-600" />
            <div className="w-px h-12 bg-slate-800" />
            <Globe className="w-5 h-5 text-slate-600" />
          </div>

          <SpeedRing
            value={upload}
            maxValue={100}
            label="Upload"
            unit="Mbps"
            color="emerald"
            animating={ulAnimating}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Ping', value: ping,   unit: 'ms',  active: phase === 'ping' || phase === 'done' || (phase !== 'idle' && step > 1) },
            { label: 'Jitter', value: jitter, unit: 'ms', active: phase === 'ping' || phase === 'done' || (phase !== 'idle' && step > 1) },
            { label: 'Packet Loss', value: loss, unit: '%', active: phase === 'loss' || phase === 'done' },
          ].map(stat => (
            <div
              key={stat.label}
              className="bg-[#060b19] border border-[#1e293b] rounded-lg px-4 py-4 text-center"
            >
              <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-1 font-medium">{stat.label}</p>
              <p className={`text-2xl font-bold tabular-nums transition-colors duration-300 ${
                stat.active ? 'text-white' : 'text-slate-600'
              }`}>
                {fmt(stat.value)}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">{stat.unit}</p>
            </div>
          ))}
        </div>

        {/* Progress bar + step label */}
        {(isTesting || phase === 'done') && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-slate-500 mb-2 font-mono">
              <span>{stepLabel}</span>
              {isTesting && step > 0 && (
                <span className="text-slate-600">Step {step} of 4</span>
              )}
              {phase === 'done' && (
                <span className="text-emerald-400">Done</span>
              )}
            </div>
            <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden border border-[#1e293b]">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                  phase === 'done' ? 'bg-emerald-500' : 'bg-sky-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleStart}
            disabled={isTesting}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg text-sm font-medium transition-colors shadow-[0_0_20px_rgba(14,165,233,0.3)] outline-none"
          >
            {isTesting
              ? <Activity className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />
            }
            {isTesting ? 'Testing...' : phase === 'done' ? 'Run Again' : 'Run Test'}
          </button>

          {phase === 'done' && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 bg-[#060b19] hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-5 py-3 rounded-lg text-sm font-medium transition-colors border border-[#1e293b] outline-none"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── History table ── */}
      {shown10.length > 0 && (
        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
          <div className="bg-[#060b19] px-6 py-4 border-b border-[#1e293b] flex items-center gap-2">
            <Zap className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-300">Recent Tests</span>
            <span className="ml-auto text-xs text-slate-600 font-mono">
              {shown10.length} of {history.length} results
            </span>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase tracking-wider border-b border-[#1e293b]">
              <tr>
                <th className="px-6 py-3 font-medium">Date / Time</th>
                <th className="px-6 py-3 font-medium text-sky-400/70">Download</th>
                <th className="px-6 py-3 font-medium text-emerald-400/70">Upload</th>
                <th className="px-6 py-3 font-medium">Ping</th>
                <th className="px-6 py-3 font-medium">Jitter</th>
                <th className="px-6 py-3 font-medium">Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]/50">
              {shown10.map((row, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                    {row.timestamp}
                  </td>
                  <td className="px-6 py-3 font-mono font-medium text-sky-400">
                    {fmt(row.download)} <span className="text-slate-600 text-xs">Mbps</span>
                  </td>
                  <td className="px-6 py-3 font-mono font-medium text-emerald-400">
                    {fmt(row.upload)} <span className="text-slate-600 text-xs">Mbps</span>
                  </td>
                  <td className="px-6 py-3 font-mono text-slate-300">
                    {row.ping} <span className="text-slate-600 text-xs">ms</span>
                  </td>
                  <td className="px-6 py-3 font-mono text-slate-400">
                    {row.jitter} <span className="text-slate-600 text-xs">ms</span>
                  </td>
                  <td className="px-6 py-3 font-mono">
                    <span className={row.loss > 5 ? 'text-red-400' : row.loss > 1 ? 'text-amber-400' : 'text-slate-400'}>
                      {fmt(row.loss)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state for history */}
      {shown10.length === 0 && phase === 'idle' && (
        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl px-6 py-10 text-center">
          <Zap className="w-8 h-8 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No test history yet. Run your first test above.</p>
        </div>
      )}
    </div>
  )
}
