import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Globe, Play, RotateCcw, Server, AlertTriangle, Info, Save, Activity } from 'lucide-react'
import { runTraceroute } from '../services/networkService'
import type { TraceHop } from '../services/networkService'
import {
  WORLD_MAP_PATH,
  WORLD_MAP_VIEWBOX_W,
  WORLD_MAP_VIEWBOX_H,
  WORLD_MAP_LAT_MAX,
  WORLD_MAP_LAT_MIN,
} from '../data/worldMapPath'

// ─── Map projection constants ──────────────────────────────────────────────────
const MAP_W = WORLD_MAP_VIEWBOX_W           // 1012
const MAP_H = WORLD_MAP_VIEWBOX_H           // 394
const LAT_MAX = WORLD_MAP_LAT_MAX           // 80
const LAT_RANGE = LAT_MAX - WORLD_MAP_LAT_MIN  // 140
// Extra vertical space added above the map so arcs never brush the top border
const VIEW_PAD_TOP = 55

// ─── Helpers ──────────────────────────────────────────────────────────────────

const geoToSvg = (lat: number, lon: number): [number, number] => {
  const x = (lon + 180) * (MAP_W / 360)
  const y = (LAT_MAX - lat) * (MAP_H / LAT_RANGE)
  return [x, y]
}

const latencyColor = (latency: number | null): string => {
  if (latency === null) return '#475569'
  if (latency < 30) return '#10b981'
  if (latency <= 100) return '#f59e0b'
  return '#ef4444'
}

const latencyClass = (latency: number | null): string => {
  if (latency === null) return 'text-slate-500'
  if (latency < 30) return 'text-emerald-400'
  if (latency <= 100) return 'text-amber-400'
  return 'text-red-400'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TracerouteTab() {
  const [target, setTarget] = useState('8.8.8.8')
  const [hops, setHops] = useState<TraceHop[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredHop, setHoveredHop] = useState<number | null>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  // visibleHopCount drives the sequential arc/dot reveal animation
  const [visibleHopCount, setVisibleHopCount] = useState(0)

  const handleRun = useCallback(async () => {
    const trimmed = target.trim()
    if (!trimmed) return
    setRunning(true)
    setError(null)
    setHops([])
    setHoveredHop(null)
    try {
      const result = await runTraceroute(trimmed)
      setHops(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [target])

  const handleReset = useCallback(() => {
    setHops([])
    setError(null)
    setHoveredHop(null)
    setVisibleHopCount(0)
  }, [])

  // Sequential animation: reveal one geo-hop every 600ms after hops load
  useEffect(() => {
    if (hops.length === 0) { setVisibleHopCount(0); return }
    const geoCount = hops.filter(h => h.lat !== null && h.lon !== null).length
    if (geoCount === 0) return
    setVisibleHopCount(0)
    let i = 0
    const timer = setInterval(() => {
      i++
      setVisibleHopCount(i)
      if (i >= geoCount) clearInterval(timer)
    }, 600)
    return () => clearInterval(timer)
  }, [hops])

  // Find bottleneck (highest latency hop)
  const bottleneckHop = useMemo(() => {
    let maxLatency = -1
    let maxHopNum = -1
    for (const h of hops) {
      if (h.latency !== null && h.latency > maxLatency) {
        maxLatency = h.latency
        maxHopNum = h.hop
      }
    }
    return maxHopNum
  }, [hops])

  // Hops that have geo data for map rendering
  const geoHops = useMemo(() => hops.filter(h => h.lat !== null && h.lon !== null), [hops])

  // Hovered hop data
  const hoveredHopData = useMemo(() => {
    if (hoveredHop === null) return null
    return hops.find(h => h.hop === hoveredHop) ?? null
  }, [hops, hoveredHop])

  // CSV export
  const handleExportCsv = useCallback(() => {
    if (hops.length === 0) return
    const header = 'Hop,IP,Latency (ms),Hostname,City,Country,ISP,ASN'
    const rows = hops.map(h =>
      [
        h.hop,
        h.ip ?? '*',
        h.latency ?? 'timeout',
        h.hostname ?? '',
        h.city ?? '',
        h.country ?? '',
        h.isp ?? '',
        h.asn ?? '',
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `traceroute-${target}-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [hops, target])

  // Handle mouse move on SVG for tooltip positioning
  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!svgContainerRef.current) return
    const rect = svgContainerRef.current.getBoundingClientRect()
    setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10 })
  }, [])

  // ── Graticule lines ── (vertical only — no horizontal ocean stripes)
  const graticuleLines = useMemo(() => {
    const lines: React.JSX.Element[] = []
    // Vertical (longitude): every 30°, very subtle
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = (lon + 180) * (MAP_W / 360)
      lines.push(
        <line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke="#164e63" strokeWidth={0.3} opacity={0.5} />
      )
    }
    return lines
  }, [])

  // ── Connecting paths between geo hops (sequential reveal) ──
  const connectingPaths = useMemo(() => {
    const elements: React.JSX.Element[] = []
    for (let i = 1; i < geoHops.length; i++) {
      const prev = geoHops[i - 1]
      const curr = geoHops[i]
      if (prev.lat === null || prev.lon === null || curr.lat === null || curr.lon === null) continue
      if (i > visibleHopCount) continue

      const [x1, y1] = geoToSvg(prev.lat, prev.lon)
      const [x2, y2] = geoToSvg(curr.lat, curr.lon)

      const mx = (x1 + x2) / 2
      const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      // Clamp arc apex to at least 12px inside the top of the viewBox so arcs never clip
      const my = Math.max(12, (y1 + y2) / 2 - Math.max(24, dist * 0.28))

      const color = latencyColor(curr.latency)
      const pathD = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`
      // Stagger each arc's flow phase slightly so they don't all pulse together
      const delay = `${((i - 1) * 0.3) % 1.5}s`

      elements.push(
        <g key={`arc-${prev.hop}-${curr.hop}`}>
          {/* Wide soft glow backing */}
          <path d={pathD} stroke={color} strokeWidth={6} fill="none" opacity={0.08} />
          {/* Solid thin base line so arc is always visible */}
          <path d={pathD} stroke={color} strokeWidth={1} fill="none" opacity={0.35} />
          {/* Flowing data-stream dashes — CSS animation, reliable in Chromium/React */}
          <path
            d={pathD}
            stroke={color}
            strokeWidth={1.8}
            fill="none"
            strokeDasharray="9 6"
            opacity={0.9}
            filter="url(#trGlow)"
            style={{ animation: `arcDash 1.5s ${delay} linear infinite` }}
          />
          {/* Traveling data-packet dot */}
          <circle r={2.8} fill={color} opacity={0.95} filter="url(#trGlow)">
            <animateMotion dur="1.5s" begin={delay} repeatCount="indefinite" path={pathD} />
          </circle>
        </g>
      )
    }
    return elements
  }, [geoHops, visibleHopCount])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20">
          <Globe className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Traceroute</h2>
          <p className="text-xs text-slate-400">Visual route tracing with geolocation mapping</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={target}
            onChange={e => setTarget(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !running && handleRun()}
            placeholder="IP or hostname (e.g. 8.8.8.8)"
            disabled={running}
            className="w-full pl-10 pr-4 py-2 bg-[#0a0f1e] border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 transition-all duration-200 disabled:opacity-50"
          />
        </div>

        <button
          onClick={handleRun}
          disabled={running || !target.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all duration-200"
        >
          {running ? (
            <Activity className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {running ? 'Tracing...' : 'Run'}
        </button>

        {hops.length > 0 && (
          <>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700/50 transition-all duration-200"
            >
              <RotateCcw className="w-4 h-4" />
              Clear
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700/50 transition-all duration-200"
            >
              <Save className="w-4 h-4" />
              Export CSV
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {/* SVG World Map */}
      <div
        ref={svgContainerRef}
        className="relative rounded-xl border border-cyan-900/30 bg-[#000814] overflow-hidden"
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setHoveredHop(null)}
      >
        <svg
          viewBox={`0 ${-VIEW_PAD_TOP} ${MAP_W} ${MAP_H + VIEW_PAD_TOP}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full"
        >
          {/* ── Defs: gradients + glow filters ── */}
          <defs>
            {/* CSS keyframe for flowing arc dashes — SMIL is unreliable in React */}
            <style>{`@keyframes arcDash { to { stroke-dashoffset: -30; } }`}</style>
            <radialGradient id="trBg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#041830" />
              <stop offset="100%" stopColor="#000814" />
            </radialGradient>
            <radialGradient id="trVignette" cx="50%" cy="50%" r="55%">
              <stop offset="40%" stopColor="#000814" stopOpacity="0" />
              <stop offset="100%" stopColor="#000814" stopOpacity="0.7" />
            </radialGradient>
            <filter id="trGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="trGridGlow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="trContinentGlow" x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect x={0} y={-VIEW_PAD_TOP} width={MAP_W} height={MAP_H + VIEW_PAD_TOP} fill="url(#trBg)" />

          {/* Graticule */}
          {graticuleLines}

          {/* World countries */}
          <path
            d={WORLD_MAP_PATH}
            fill="#0b2545"
            stroke="#22d3ee"
            strokeWidth={0.8}
            opacity={0.95}
            filter="url(#trContinentGlow)"
          />

          {/* Vignette overlay */}
          <rect x={0} y={-VIEW_PAD_TOP} width={MAP_W} height={MAP_H + VIEW_PAD_TOP} fill="url(#trVignette)" pointerEvents="none" />

          {/* Scan-line sweep */}
          <rect x={0} y={-VIEW_PAD_TOP} width={MAP_W} height={3} fill="#22d3ee" opacity={0}>
            <animateTransform attributeName="transform" type="translate" values={`0,0;0,${MAP_H + VIEW_PAD_TOP};0,${MAP_H + VIEW_PAD_TOP}`} dur="5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.13;0" dur="5s" repeatCount="indefinite" />
          </rect>

          {/* Connecting paths */}
          {connectingPaths}

          {/* Bottleneck glow ring */}
          {geoHops.map((hop, idx) => {
            if (hop.hop !== bottleneckHop || hop.lat === null || hop.lon === null) return null
            if (idx + 1 > visibleHopCount) return null
            const [cx, cy] = geoToSvg(hop.lat, hop.lon)
            return (
              <circle
                key={`glow-${hop.hop}`}
                cx={cx}
                cy={cy}
                r={12}
                fill="none"
                stroke="#f97316"
                strokeWidth={1.2}
                opacity={0.6}
                filter="url(#trGlow)"
              >
                <animate attributeName="r" values="10;15;10" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
            )
          })}

          {/* Hop dots (sequential reveal) */}
          {geoHops.map((hop, idx) => {
            if (hop.lat === null || hop.lon === null) return null
            if (idx + 1 > visibleHopCount) return null
            const [cx, cy] = geoToSvg(hop.lat, hop.lon)
            const isHovered = hoveredHop === hop.hop
            const color = latencyColor(hop.latency)
            return (
              <g
                key={`hop-${hop.hop}`}
                onMouseEnter={() => setHoveredHop(hop.hop)}
                onMouseLeave={() => setHoveredHop(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Pulse ring */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={8}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.8}
                  opacity={0}
                >
                  <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 9 : 6}
                  fill={color}
                  opacity={isHovered ? 1 : 0.9}
                  stroke={isHovered ? '#fff' : color}
                  strokeWidth={isHovered ? 1.5 : 0.8}
                  filter="url(#trGlow)"
                  className="transition-all duration-150"
                />
                <text
                  x={cx}
                  y={cy - (isHovered ? 13 : 10)}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize={isHovered ? 11 : 9}
                  fontWeight={600}
                  className="select-none pointer-events-none"
                >
                  {hop.hop}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Tooltip */}
        {hoveredHopData && hoveredHopData.lat !== null && (
          <div
            className="absolute z-10 px-3 py-2 bg-slate-900/95 border border-cyan-800/40 rounded-lg shadow-xl pointer-events-none backdrop-blur-sm"
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: 'translateY(-100%)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-slate-200">Hop {hoveredHopData.hop}</span>
              <span className={`text-xs font-mono ${latencyClass(hoveredHopData.latency)}`}>
                {hoveredHopData.latency !== null ? `${hoveredHopData.latency} ms` : 'timeout'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 space-y-0.5">
              <div>IP: <span className="text-slate-300 font-mono">{hoveredHopData.ip ?? '*'}</span></div>
              {hoveredHopData.city && (
                <div>Location: <span className="text-slate-300">{hoveredHopData.city}, {hoveredHopData.country}</span></div>
              )}
              {hoveredHopData.isp && (
                <div>ISP: <span className="text-slate-300">{hoveredHopData.isp}</span></div>
              )}
            </div>
          </div>
        )}

        {/* Empty state — non-blocking, map always visible */}
        {hops.length === 0 && !running && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-cyan-600/50 font-mono tracking-widest uppercase select-none">
              [ enter target · run traceroute · visualize route ]
            </p>
          </div>
        )}

        {/* Running state — small pill, map stays visible */}
        {running && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-slate-900/85 rounded-full border border-cyan-800/50 pointer-events-none backdrop-blur-sm">
            <Activity className="w-3 h-3 text-cyan-400 animate-spin" />
            <p className="text-xs text-cyan-300 font-mono">tracing {target}...</p>
          </div>
        )}
      </div>

      {/* Stats summary */}
      {hops.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total Hops" value={String(hops.length)} icon={<Server className="w-4 h-4 text-sky-400" />} />
          <StatCard label="Timeouts" value={String(hops.filter(h => h.latency === null).length)} icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} />
          <StatCard
            label="Min Latency"
            value={(() => {
              const valid = hops.filter(h => h.latency !== null).map(h => h.latency as number)
              return valid.length > 0 ? `${Math.min(...valid)} ms` : 'N/A'
            })()}
            icon={<Activity className="w-4 h-4 text-emerald-400" />}
          />
          <StatCard
            label="Max Latency"
            value={(() => {
              const valid = hops.filter(h => h.latency !== null).map(h => h.latency as number)
              return valid.length > 0 ? `${Math.max(...valid)} ms` : 'N/A'
            })()}
            icon={<Activity className="w-4 h-4 text-red-400" />}
          />
        </div>
      )}

      {/* Hop table */}
      {hops.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-[#0a0f1e] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-medium text-slate-200">Route Hops</span>
            <span className="text-xs text-slate-500 ml-auto">{hops.length} hops</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">IP</th>
                  <th className="px-4 py-2 text-left font-medium">Latency</th>
                  <th className="px-4 py-2 text-left font-medium">Location</th>
                  <th className="px-4 py-2 text-left font-medium">ISP / ASN</th>
                </tr>
              </thead>
              <tbody>
                {hops.map(hop => {
                  const isBottleneck = hop.hop === bottleneckHop
                  return (
                    <tr
                      key={hop.hop}
                      className={`border-t border-slate-800/50 transition-colors duration-150 hover:bg-slate-800/30 ${
                        isBottleneck ? 'border-l-2 border-l-amber-500 bg-amber-500/5' : ''
                      }`}
                      onMouseEnter={() => setHoveredHop(hop.hop)}
                      onMouseLeave={() => setHoveredHop(null)}
                    >
                      <td className="px-4 py-2.5 text-slate-400 font-mono">{hop.hop}</td>
                      <td className="px-4 py-2.5">
                        {hop.ip ? (
                          <div>
                            <span className="text-slate-200 font-mono">{hop.ip}</span>
                            {hop.hostname && (
                              <span className="text-slate-500 text-xs ml-2">({hop.hostname})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">* * *</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {hop.latency !== null ? (
                          <span className={`font-mono font-medium ${latencyClass(hop.latency)}`}>
                            {hop.latency} ms
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono">* * *</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {hop.city ? (
                          <span className="text-slate-300">{hop.city}, {hop.country}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {hop.isp ? (
                          <div>
                            <span className="text-slate-300">{hop.isp}</span>
                            {hop.asn && (
                              <span className="text-slate-500 text-xs ml-2">{hop.asn}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#0a0f1e] border border-slate-700/50 rounded-lg">
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-slate-800/60">
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-200">{value}</p>
      </div>
    </div>
  )
}
