import { useState, useEffect, useCallback } from 'react'
import { Wifi, AlertTriangle, RotateCcw, CheckCircle2, Shield, Globe, Info } from 'lucide-react'
import { getWifiNetworks } from '../services/networkService'
import type { WifiNetwork } from '../services/networkService'

// ─── Channel Congestion Chart ─────────────────────────────────────────────────

const CHANNELS_24 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const CHANNELS_5 = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 149, 153, 157, 161, 165]

function barColor(count: number): string {
  if (count === 0) return '#1e293b'
  if (count === 1) return '#0ea5e9'
  if (count === 2) return '#f59e0b'
  return '#ef4444'
}

interface ChannelChartProps {
  channels: number[]
  counts: Record<number, number>
  connectedChannel: number | null
  label: string
}

function ChannelChart({ channels, counts, connectedChannel, label }: ChannelChartProps) {
  const maxCount = Math.max(1, ...channels.map(ch => counts[ch] ?? 0))
  const barAreaHeight = 80
  const barWidth = 20
  const barGap = channels.length > 14 ? 4 : 8
  const svgWidth = channels.length * (barWidth + barGap) + barGap
  const svgHeight = barAreaHeight + 28

  return (
    <div className="mb-4">
      <p className="text-xs text-slate-400 mb-2 font-medium">{label}</p>
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="block">
          {channels.map((ch, i) => {
            const count = counts[ch] ?? 0
            const fillH = count === 0 ? 4 : Math.max(4, (count / maxCount) * barAreaHeight)
            const x = barGap + i * (barWidth + barGap)
            const y = barAreaHeight - fillH
            const isConnected = ch === connectedChannel
            return (
              <g key={ch}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={fillH}
                  fill={barColor(count)}
                  rx={3}
                  opacity={count === 0 ? 0.4 : 1}
                />
                {isConnected && (
                  <rect
                    x={x - 1}
                    y={0}
                    width={barWidth + 2}
                    height={barAreaHeight}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                    rx={3}
                    opacity={0.7}
                  />
                )}
                <text
                  x={x + barWidth / 2}
                  y={svgHeight - 4}
                  textAnchor="middle"
                  fontSize={channels.length > 14 ? 7 : 9}
                  fill={isConnected ? '#0ea5e9' : '#64748b'}
                  fontWeight={isConnected ? 'bold' : 'normal'}
                >
                  {ch}
                </text>
                {count > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#cbd5e1"
                  >
                    {count}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Signal Bars ──────────────────────────────────────────────────────────────

function SignalBars({ signal }: { signal: number }) {
  const filled = Math.round((signal / 100) * 5)
  return (
    <div className="flex items-end gap-0.5">
      {[1, 2, 3, 4, 5].map(bar => (
        <div
          key={bar}
          style={{ height: `${bar * 3 + 4}px`, width: '5px' }}
          className={`rounded-sm ${bar <= filled ? 'bg-sky-400' : 'bg-slate-700'}`}
        />
      ))}
      <span className="ml-1.5 text-xs text-slate-400">{signal}%</span>
    </div>
  )
}

// ─── Security Badge ───────────────────────────────────────────────────────────

function SecurityBadge({ auth }: { auth: string }) {
  const lower = auth.toLowerCase()
  let cls = 'bg-slate-700 text-slate-300'
  let icon = <Shield className="w-3 h-3" />

  if (lower === 'open' || lower.includes('open')) {
    cls = 'bg-red-900/60 text-red-400 border border-red-700/40'
    icon = <Globe className="w-3 h-3" />
  } else if (lower.includes('wpa3')) {
    cls = 'bg-emerald-900/60 text-emerald-400 border border-emerald-700/40'
  } else if (lower.includes('wpa2')) {
    cls = 'bg-sky-900/60 text-sky-400 border border-sky-700/40'
  } else {
    cls = 'bg-slate-700/60 text-slate-400 border border-slate-600/40'
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {icon}
      {auth}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WifiAnalyzerTab() {
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<Date | null>(null)

  const refreshNetworks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getWifiNetworks()
      setNetworks(data)
      setLastScan(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to scan WiFi networks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshNetworks()
  }, [refreshNetworks])

  // Evil twin detection: SSID with 2+ distinct BSSIDs
  const evilTwins = new Set<string>()
  const ssidBssidMap = new Map<string, Set<string>>()
  for (const net of networks) {
    if (!ssidBssidMap.has(net.ssid)) ssidBssidMap.set(net.ssid, new Set())
    ssidBssidMap.get(net.ssid)!.add(net.bssid)
  }
  for (const [ssid, bssids] of ssidBssidMap.entries()) {
    if (bssids.size >= 2) evilTwins.add(ssid)
  }

  // Sorted by signal desc
  const sortedNetworks = [...networks].sort((a, b) => b.signal - a.signal)

  // Connected channel
  const connectedNetwork = networks.find(n => n.isConnected)
  const connectedChannel = connectedNetwork?.channel ?? null

  // Channel counts
  const channelCounts: Record<number, number> = {}
  for (const net of networks) {
    if (net.channel > 0) channelCounts[net.channel] = (channelCounts[net.channel] ?? 0) + 1
  }

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex flex-col gap-4 p-4 min-h-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="w-5 h-5 text-sky-400" />
          <h2 className="text-lg font-semibold text-slate-100">WiFi Analyzer</h2>
          {networks.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-sky-900/50 text-sky-400 text-xs font-medium border border-sky-700/30">
              {networks.length} {networks.length === 1 ? 'network' : 'networks'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastScan && (
            <span className="text-xs text-slate-500">Last scan: {formatTime(lastScan)}</span>
          )}
          <button
            onClick={refreshNetworks}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/40 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Evil Twin Alert ── */}
      {evilTwins.size > 0 && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span className="text-amber-400 font-semibold text-sm">Possible Evil Twin Detected</span>
          </div>
          <p className="text-slate-400 text-xs mb-3">
            The following SSIDs are broadcasting from multiple access points with different BSSIDs.
            This may indicate an evil twin attack — a rogue AP impersonating a legitimate network to intercept traffic.
          </p>
          <ul className="flex flex-col gap-1">
            {Array.from(evilTwins).map(ssid => (
              <li key={ssid} className="flex items-center gap-2 text-sm text-amber-300 font-mono">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                {ssid}
                <span className="text-slate-500 font-sans text-xs">({ssidBssidMap.get(ssid)?.size} access points)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Networks Table ── */}
      <div className="rounded-xl border border-slate-800 bg-[#0a0f1e] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <Wifi className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Nearby Networks</span>
        </div>

        {sortedNetworks.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
            <Info className="w-8 h-8 opacity-50" />
            <span className="text-sm">No networks found. Click Scan to refresh.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="text-left px-4 py-2.5 font-medium">SSID</th>
                  <th className="text-left px-4 py-2.5 font-medium">Signal</th>
                  <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                  <th className="text-left px-4 py-2.5 font-medium">Band</th>
                  <th className="text-left px-4 py-2.5 font-medium">Security</th>
                  <th className="text-left px-4 py-2.5 font-medium">BSSID</th>
                </tr>
              </thead>
              <tbody>
                {sortedNetworks.map((net, idx) => {
                  const isEvilTwin = evilTwins.has(net.ssid)
                  return (
                    <tr
                      key={`${net.bssid}-${idx}`}
                      className={`border-b border-slate-800/60 transition-colors duration-150 hover:bg-slate-800/30 ${
                        net.isConnected
                          ? 'border-l-2 border-l-sky-500 bg-sky-500/5'
                          : ''
                      }`}
                    >
                      {/* SSID */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {net.isConnected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          )}
                          <span className={`font-medium ${net.isConnected ? 'text-sky-300' : 'text-slate-200'}`}>
                            {net.ssid || <span className="text-slate-500 italic">Hidden</span>}
                          </span>
                          {isEvilTwin && (
                            <span title="Possible evil twin — same SSID detected on multiple access points">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Signal */}
                      <td className="px-4 py-3">
                        <SignalBars signal={net.signal} />
                      </td>

                      {/* Channel */}
                      <td className="px-4 py-3 text-slate-300 font-mono">
                        {net.channel > 0 ? net.channel : '—'}
                      </td>

                      {/* Band */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          net.band === '2.4 GHz'
                            ? 'bg-violet-900/50 text-violet-400'
                            : net.band === '5 GHz'
                            ? 'bg-sky-900/50 text-sky-400'
                            : net.band === '6 GHz'
                            ? 'bg-emerald-900/50 text-emerald-400'
                            : 'bg-slate-700/50 text-slate-400'
                        }`}>
                          {net.band}
                        </span>
                      </td>

                      {/* Security */}
                      <td className="px-4 py-3">
                        <SecurityBadge auth={net.authentication} />
                      </td>

                      {/* BSSID */}
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {net.bssid}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Channel Congestion ── */}
      {networks.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-[#0a0f1e] p-4">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-200">Channel Congestion</span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-xs text-slate-400 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#0ea5e9' }} />
              <span>1 AP</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }} />
              <span>2 APs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: '#ef4444' }} />
              <span>3+ APs (congested)</span>
            </div>
            {connectedChannel !== null && (
              <div className="flex items-center gap-1.5 text-sky-400">
                <div className="w-3 h-3 rounded-sm border border-sky-400 border-dashed" />
                <span>Your channel ({connectedChannel})</span>
              </div>
            )}
          </div>

          <ChannelChart
            channels={CHANNELS_24}
            counts={channelCounts}
            connectedChannel={connectedChannel}
            label="2.4 GHz Channels"
          />
          <ChannelChart
            channels={CHANNELS_5}
            counts={channelCounts}
            connectedChannel={connectedChannel}
            label="5 GHz Channels"
          />
        </div>
      )}
    </div>
  )
}
