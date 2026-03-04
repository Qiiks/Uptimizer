import { useState, useEffect } from 'react'
import {
  Shield,
  Globe,
  Activity,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
} from 'lucide-react'
import * as networkService from '../services/networkService'
import type { WarpStatus, WarpPop, LatencyStats } from '../services/networkService'

type LoadState = 'idle' | 'loading' | 'error'

export default function WarpTab() {
  const [warpStatus, setWarpStatus] = useState<WarpStatus | null>(null)
  const [statusLoad, setStatusLoad] = useState<LoadState>('loading')

  const [pop, setPop] = useState<WarpPop | null>(null)
  const [popLoad, setPopLoad] = useState<LoadState>('loading')

  const [latency, setLatency] = useState<LatencyStats | null>(null)
  const [latencyLoad, setLatencyLoad] = useState<LoadState>('idle')
  const [measuredAt, setMeasuredAt] = useState<string | null>(null)

  const [toggling, setToggling] = useState(false)

  const refreshStatus = async () => {
    setStatusLoad('loading')
    try {
      const s = await networkService.getWarpStatus()
      setWarpStatus(s)
      setStatusLoad('idle')
    } catch {
      setStatusLoad('error')
    }
  }

  const refreshPop = async () => {
    setPopLoad('loading')
    try {
      const p = await networkService.getWarpPop()
      setPop(p)
      setPopLoad('idle')
    } catch {
      setPopLoad('error')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void refreshStatus()
    void refreshPop()
  }, [])

  const toggle = async () => {
    if (!warpStatus || warpStatus === 'not-installed' || toggling) return
    const shouldConnect = warpStatus !== 'connected'
    setToggling(true)
    try {
      await networkService.setWarpConnection(shouldConnect)
      // Allow WARP daemon time to fully connect / disconnect
      await new Promise<void>(r => setTimeout(r, 2500))
      await refreshStatus()
      await refreshPop()
    } finally {
      setToggling(false)
    }
  }

  const measureLat = async () => {
    setLatencyLoad('loading')
    try {
      const l = await networkService.measureLatency('1.1.1.1', 5)
      setLatency(l)
      setMeasuredAt(new Date().toLocaleTimeString())
      setLatencyLoad(l ? 'idle' : 'error')
    } catch {
      setLatencyLoad('error')
    }
  }

  const downloadWarp = async () => {
    if (window.networkingApi) {
      await window.networkingApi.executeCommand('start "" https://1.1.1.1/WARP')
    } else {
      window.open('https://1.1.1.1/WARP', '_blank')
    }
  }

  const isConnected = warpStatus === 'connected'
  const isNotInstalled = warpStatus === 'not-installed'

  return (
    <div className="space-y-6">

      {/* ── Row 1: Status + PoP ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Status Card */}
        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-sky-500/10 p-2.5 rounded-lg border border-sky-500/20">
              <Shield className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-base font-medium text-white">WARP Status</h3>
              <p className="text-xs text-slate-500 mt-0.5">Cloudflare WARP tunnel</p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="mb-6 min-h-[56px] flex items-center">
            {statusLoad === 'loading' ? (
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-slate-700 animate-pulse" />
                <span className="text-slate-500 text-sm">Checking status...</span>
              </div>
            ) : warpStatus === 'connected' ? (
              <div className="flex items-center gap-3 w-full">
                <div className="relative flex-shrink-0">
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-60" />
                </div>
                <div className="flex-1">
                  <div className="text-emerald-400 font-semibold text-lg leading-none">Connected</div>
                  <div className="text-slate-500 text-xs mt-1">Traffic is routed through Cloudflare</div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              </div>
            ) : warpStatus === 'disconnected' ? (
              <div className="flex items-center gap-3 w-full">
                <div className="w-3 h-3 rounded-full bg-slate-500 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-slate-300 font-semibold text-lg leading-none">Disconnected</div>
                  <div className="text-slate-500 text-xs mt-1">Using your normal ISP route</div>
                </div>
                <XCircle className="w-5 h-5 text-slate-500 flex-shrink-0" />
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <div className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-amber-400 font-semibold text-lg leading-none">Not Installed</div>
                  <div className="text-slate-500 text-xs mt-1">Cloudflare WARP client not found</div>
                </div>
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            {isNotInstalled ? (
              <button
                onClick={downloadWarp}
                className="flex-1 flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.25)]"
              >
                <ArrowRight className="w-4 h-4" />
                Download WARP
              </button>
            ) : (
              <>
                <button
                  onClick={toggle}
                  disabled={toggling || statusLoad !== 'idle'}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isConnected
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600'
                      : 'bg-sky-500 hover:bg-sky-400 text-white shadow-[0_0_15px_rgba(14,165,233,0.25)]'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  {toggling
                    ? (isConnected ? 'Disconnecting...' : 'Connecting...')
                    : (isConnected ? 'Disconnect' : 'Connect')
                  }
                </button>
                <button
                  onClick={refreshStatus}
                  disabled={statusLoad === 'loading'}
                  title="Refresh status"
                  className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className={`w-4 h-4 ${statusLoad === 'loading' ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* PoP Card */}
        <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-sky-500/10 p-2.5 rounded-lg border border-sky-500/20">
                <Globe className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-base font-medium text-white">Connection Point</h3>
                <p className="text-xs text-slate-500 mt-0.5">Nearest Cloudflare PoP</p>
              </div>
            </div>
            <button
              onClick={refreshPop}
              disabled={popLoad === 'loading'}
              title="Refresh PoP"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${popLoad === 'loading' ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {popLoad === 'loading' ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-8 bg-slate-800 rounded-lg w-2/3" />
              <div className="h-5 bg-slate-800 rounded w-2/5" />
              <div className="h-4 bg-slate-800 rounded w-full mt-4" />
            </div>
          ) : pop ? (
            <div>
              <div className="text-3xl font-bold text-white mb-2 leading-tight">{pop.city}</div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sky-400 font-mono text-sm font-medium bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                  {pop.iata}
                </span>
                {pop.warpActive ? (
                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    WARP Active
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    Direct
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Cloudflare selects the nearest PoP automatically via Anycast BGP routing.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-400">
                Unable to reach{' '}
                <span className="font-mono text-xs text-slate-300">cloudflare.com/cdn-cgi/trace</span>.
                {' '}Check your network connection.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Latency Card ───────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-sky-500/10 p-2.5 rounded-lg border border-sky-500/20">
              <Activity className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-base font-medium text-white">Latency to 1.1.1.1</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isConnected ? 'Measured via WARP tunnel' : 'Measured via direct ISP route'}
              </p>
            </div>
          </div>
          <button
            onClick={measureLat}
            disabled={latencyLoad === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-[0_0_12px_rgba(14,165,233,0.2)]"
          >
            <Activity className="w-3.5 h-3.5" />
            {latencyLoad === 'loading' ? 'Measuring...' : 'Measure'}
          </button>
        </div>

        {latencyLoad === 'idle' && !latency && (
          <p className="text-center py-8 text-slate-600 text-sm">
            Click Measure to ping 1.1.1.1 five times and compute avg / min / max.
          </p>
        )}

        {latencyLoad === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-8">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Pinging 1.1.1.1 × 5...</span>
          </div>
        )}

        {latencyLoad === 'error' && (
          <div className="flex items-center gap-2 py-4">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm">All pings timed out. Check your connection to 1.1.1.1.</span>
          </div>
        )}

        {latency && latencyLoad !== 'loading' && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {([
                { label: 'Average', value: latency.avg, color: 'text-sky-400' },
                { label: 'Minimum', value: latency.min, color: 'text-emerald-400' },
                { label: 'Maximum', value: latency.max, color: 'text-amber-400' },
              ] as const).map(({ label, value, color }) => (
                <div key={label} className="bg-[#060b19] border border-[#1e293b] rounded-lg p-4 text-center">
                  <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
                  <div className="text-xs text-slate-500 mt-1">ms · {label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="text-xs text-slate-500">
                Measured {isConnected ? 'via WARP' : 'direct'}
                {measuredAt ? ` · ${measuredAt}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Row 3: Info ──────────────────────────────────────────────────────── */}
      <div className="bg-[#060b19] border border-[#1e293b] rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-slate-300 font-medium">About Cloudflare WARP: </span>
          WARP routes your traffic through Cloudflare's global network via WireGuard. The nearest PoP
          is selected automatically via Anycast BGP — manual server selection is not available in the
          free client. WARP+ adds bandwidth priority on the same infrastructure. The PoP shown above
          is queried live from{' '}
          <span className="font-mono text-[11px] text-sky-400/80">cloudflare.com/cdn-cgi/trace</span>.
        </p>
      </div>

    </div>
  )
}
