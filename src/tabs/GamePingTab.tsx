import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Gamepad2, Info, Loader2, Play } from 'lucide-react'
import * as networkService from '../services/networkService'

interface GameServerTarget {
  region: string
  ip: string
  port: number
  protocol: 'udp' | 'tcp'
  label?: string
}

interface GameServerResult extends GameServerTarget {
  icmp: networkService.ProtocolResult
  tcp: networkService.ProtocolResult
  udp: networkService.ProtocolResult
  score: number
}

interface GameProfile {
  id: string
  name: string
  targets: GameServerTarget[]
}

const gameProfiles: GameProfile[] = [
  {
    id: 'valorant',
    name: 'Valorant',
    targets: [
      { region: 'NA', ip: '192.207.0.1', port: 7000, protocol: 'udp' },
      { region: 'EU', ip: '162.249.72.1', port: 7000, protocol: 'udp' },
      { region: 'AP', ip: '43.229.65.1', port: 7000, protocol: 'udp' },
      { region: 'Singapore', ip: '151.106.248.1', port: 7000, protocol: 'udp' },
      { region: 'Korea', ip: '103.219.128.1', port: 7000, protocol: 'udp' },
      { region: 'Brazil', ip: '45.7.37.1', port: 7000, protocol: 'udp' },
      { region: 'Chile', ip: '151.106.249.1', port: 7000, protocol: 'udp' },
      { region: 'Bahrain', ip: '99.83.199.240', port: 7000, protocol: 'udp' },
      { region: 'Mumbai', ip: '75.2.66.166', port: 7000, protocol: 'udp' }
    ]
  },
  {
    id: 'cs2',
    name: 'CS2',
    targets: [
      { region: 'US East (IAD)', ip: '162.254.192.102', port: 27015, protocol: 'udp' },
      { region: 'US West (LAX)', ip: '162.254.195.52', port: 27015, protocol: 'udp' },
      { region: 'EU West (LHR)', ip: '162.254.196.66', port: 27015, protocol: 'udp' },
      { region: 'EU Central (FRA)', ip: '155.133.226.68', port: 27015, protocol: 'udp' },
      { region: 'Asia (TYO)', ip: '45.121.184.5', port: 27015, protocol: 'udp' },
      { region: 'Australia (SYD)', ip: '103.10.125.20', port: 27015, protocol: 'udp' }
    ]
  },
  {
    id: 'lol',
    name: 'League of Legends',
    targets: [
      { region: 'NA', ip: '104.160.131.3', port: 5000, protocol: 'udp' },
      { region: 'EUW', ip: '104.160.141.3', port: 5000, protocol: 'udp' },
      { region: 'EUNE', ip: '104.160.142.3', port: 5000, protocol: 'udp' },
      { region: 'OCE', ip: '104.160.156.1', port: 5000, protocol: 'udp' },
      { region: 'KR', ip: '110.45.191.1', port: 5000, protocol: 'udp' }
    ]
  },
  {
    id: 'apex',
    name: 'Apex Legends',
    targets: [
      { region: 'US East', ip: 'dynamodb.us-east-1.amazonaws.com', port: 37001, protocol: 'udp' },
      { region: 'US West', ip: 'dynamodb.us-west-2.amazonaws.com', port: 37001, protocol: 'udp' },
      { region: 'EU West', ip: 'dynamodb.eu-west-2.amazonaws.com', port: 37001, protocol: 'udp' },
      { region: 'Japan', ip: 'dynamodb.ap-northeast-1.amazonaws.com', port: 37001, protocol: 'udp' }
    ]
  },
  {
    id: 'overwatch',
    name: 'Overwatch 2',
    targets: [
      { region: 'US West', ip: '34.16.128.42', port: 3724, protocol: 'udp', label: 'LAS1' },
      { region: 'US Central', ip: '8.34.210.23', port: 3724, protocol: 'udp', label: 'ORD1' },
      { region: 'US East', ip: '8.228.65.52', port: 3724, protocol: 'udp', label: 'GUE4' },
      { region: 'EU West', ip: '137.221.78.60', port: 3724, protocol: 'udp', label: 'AMS1' },
      { region: 'EU North', ip: '34.88.0.1', port: 3724, protocol: 'udp', label: 'GEN1' },
      { region: 'Korea', ip: '34.64.64.15', port: 3724, protocol: 'udp', label: 'ICN1' },
      { region: 'Japan', ip: '34.84.0.0', port: 3724, protocol: 'udp', label: 'GTK1' },
      { region: 'Australia', ip: '34.40.128.34', port: 3724, protocol: 'udp', label: 'SYD2' },
      { region: 'Brazil', ip: '34.39.128.0', port: 3724, protocol: 'udp', label: 'GBR1' },
      { region: 'Singapore', ip: '34.1.128.4', port: 3724, protocol: 'udp', label: 'GSG1' },
      { region: 'Saudi Arabia', ip: '34.166.0.84', port: 3724, protocol: 'udp', label: 'GMEC2' },
      { region: 'Taiwan', ip: '34.80.0.0', port: 3724, protocol: 'udp', label: 'TPE1' }
    ]
  }
]

// Composite key used to correlate targets, statuses, and results
const rowKey = (target: GameServerTarget) => `${target.ip}-${target.region}`

const getLatencyScore = (icmp?: number, tcp?: number) => {
  const validIcmp = typeof icmp === 'number' ? icmp : null
  const validTcp = typeof tcp === 'number' ? tcp : null
  if (validIcmp === null && validTcp === null) return Number.POSITIVE_INFINITY
  if (validIcmp === null) return validTcp ?? Number.POSITIVE_INFINITY
  if (validTcp === null) return validIcmp
  return Math.min(validIcmp, validTcp)
}

const getLatencyColor = (score: number) => {
  if (score < 40) return 'text-emerald-400'
  if (score < 80) return 'text-amber-400'
  return 'text-red-400'
}

type RowStatus = 'idle' | 'testing' | 'done'

export default function GamePingTab() {
  const [activeGameId, setActiveGameId] = useState(gameProfiles[0]?.id ?? 'valorant')
  const [isTesting, setIsTesting] = useState(false)
  // Keyed by rowKey(); holds finished results only — used for display after completion
  const [resultMap, setResultMap] = useState<Map<string, GameServerResult>>(new Map())
  // Tracks per-row test progress: idle → testing → done
  const [rowStatuses, setRowStatuses] = useState<Map<string, RowStatus>>(new Map())
  // How many rows have completed in the current run
  const [completedCount, setCompletedCount] = useState(0)

  const activeGame = useMemo(
    () => gameProfiles.find(game => game.id === activeGameId) ?? gameProfiles[0],
    [activeGameId]
  )

  // Whether the full test run is done (all rows are 'done')
  const testComplete = useMemo(() => {
    if (!isTesting && completedCount > 0 && activeGame) {
      return completedCount === activeGame.targets.length
    }
    return false
  }, [isTesting, completedCount, activeGame])

  const handleRunTest = async () => {
    if (!activeGame) return

    const targets = activeGame.targets
    const total = targets.length

    // Reset all state for a fresh run — keep rows visible (they read from activeGame.targets)
    setIsTesting(true)
    setCompletedCount(0)
    setResultMap(new Map())
    // Mark every row as idle at the start so the table is always fully populated
    setRowStatuses(new Map(targets.map(t => [rowKey(t), 'idle'])))

    const freshResultMap = new Map<string, GameServerResult>()

    for (let i = 0; i < total; i++) {
      const target = targets[i]
      const key = rowKey(target)

      // Mark this row as actively being tested
      setRowStatuses(prev => new Map(prev).set(key, 'testing'))

      const data = await networkService.pingMultiProtocol(target.ip, target.port)
      const score = getLatencyScore(data.icmp.latency, data.tcp.latency)

      freshResultMap.set(key, { ...target, icmp: data.icmp, tcp: data.tcp, udp: data.udp, score })

      // Mark done and publish the updated result map
      setRowStatuses(prev => new Map(prev).set(key, 'done'))
      setResultMap(new Map(freshResultMap))
      setCompletedCount(i + 1)
    }

    // Sort the final result map by score (best latency first) and re-publish
    const sorted = [...freshResultMap.entries()].sort((a, b) => a[1].score - b[1].score)
    setResultMap(new Map(sorted))
    setIsTesting(false)
  }

  // Derive the ordered rows to render:
  // - During/after a test: use activeGame order (unsorted) so rows stay stable while testing;
  //   after sorting is applied we re-publish resultMap which React re-renders in sorted order.
  // - Always show every target, regardless of whether a result exists yet.
  const displayRows: GameServerResult[] = useMemo(() => {
    // After the test is fully done the resultMap is sorted — use that order
    if (testComplete && resultMap.size > 0) {
      return [...resultMap.values()]
    }
    // During a test (or before any test) keep the original target order so rows don't jump
    return (activeGame?.targets ?? []).map(target => {
      const existing = resultMap.get(rowKey(target))
      if (existing) return existing
      return {
        ...target,
        icmp: { success: false, latency: undefined },
        tcp: { success: false, latency: undefined },
        udp: { success: false, latency: undefined, unsupported: false },
        score: Number.POSITIVE_INFINITY
      }
    })
  }, [activeGame, resultMap, testComplete])

  const totalCount = activeGame?.targets.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header card: game selector + run button */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/20 h-fit">
            <Gamepad2 className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Game Server Ping Checker</h3>
            <p className="text-sm text-slate-400 mt-1">
              Test multiple regions and compare ICMP, TCP, and UDP reachability.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={activeGameId}
            onChange={(event) => {
              setActiveGameId(event.target.value)
              // Clear results when switching games so the new game's rows show as idle
              setResultMap(new Map())
              setRowStatuses(new Map())
              setCompletedCount(0)
            }}
            className="bg-[#060b19] border border-[#1e293b] text-slate-200 text-sm rounded-lg px-3 py-2 outline-none"
          >
            {gameProfiles.map((game) => (
              <option key={game.id} value={game.id}>{game.name}</option>
            ))}
          </select>

          <button
            onClick={handleRunTest}
            disabled={isTesting}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.2)]"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing {completedCount} / {totalCount}...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Test
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results table */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#060b19] text-xs text-slate-400 uppercase tracking-wider border-b border-[#1e293b]">
            <tr>
              <th className="px-6 py-4 font-medium">Region</th>
              <th className="px-6 py-4 font-medium">Server</th>
              <th className="px-6 py-4 font-medium text-right">ICMP</th>
              <th className="px-6 py-4 font-medium text-right">TCP</th>
              <th className="px-6 py-4 font-medium text-right">UDP</th>
              <th className="px-6 py-4 font-medium text-right">Best Latency</th>
            </tr>
            {/* Protocol legend — gives users context on what each column means */}
            <tr className="border-t border-[#1e293b]/40">
              <td colSpan={6} className="px-6 py-2">
                <span className="flex items-center gap-1.5 text-slate-500 text-xs">
                  <Info className="w-3 h-3 shrink-0" />
                  ICMP = ping latency&nbsp;&middot;&nbsp;TCP = port reachability time&nbsp;&middot;&nbsp;UDP = port open/closed
                </span>
              </td>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#1e293b]/50">
            {displayRows.map((entry) => {
              const key = rowKey(entry)
              const status = rowStatuses.get(key) ?? 'idle'
              const isDone = status === 'done'
              const isTested = isDone
              const isCurrentlyTesting = status === 'testing'

              return (
                <tr
                  key={key}
                  className={`transition-colors hover:bg-white/[0.02] ${isCurrentlyTesting ? 'bg-sky-500/[0.04]' : ''}`}
                >
                  {/* Region — with spinner when this row is being tested */}
                  <td className="px-6 py-4 text-slate-200 font-medium">
                    <span className="flex items-center gap-2">
                      {isCurrentlyTesting && (
                        <Loader2 className="w-3 h-3 animate-spin text-sky-400 inline shrink-0" />
                      )}
                      {entry.region}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                    {entry.ip}:{entry.port}
                    {entry.label ? <span className="text-slate-600 ml-2">{entry.label}</span> : null}
                  </td>

                  {/* ICMP */}
                  <td className="px-6 py-4 text-right">
                    {!isTested ? (
                      <span className="text-slate-700">—</span>
                    ) : entry.icmp.success && typeof entry.icmp.latency === 'number' ? (
                      <span className="text-slate-200 font-mono">{entry.icmp.latency} ms</span>
                    ) : (
                      <span className="text-slate-600">Blocked</span>
                    )}
                  </td>

                  {/* TCP */}
                  <td className="px-6 py-4 text-right">
                    {!isTested ? (
                      <span className="text-slate-700">—</span>
                    ) : entry.tcp.success && typeof entry.tcp.latency === 'number' ? (
                      <span className="text-slate-200 font-mono">{entry.tcp.latency} ms</span>
                    ) : (
                      <span className="text-slate-600">Blocked</span>
                    )}
                  </td>

                  {/* UDP */}
                  <td className="px-6 py-4 text-right">
                    {!isTested ? (
                      <span className="text-slate-700">—</span>
                    ) : entry.udp.unsupported ? (
                      <span className="text-slate-500 font-medium flex justify-end gap-2 items-center">
                        <AlertTriangle className="w-4 h-4" /> Unsupported
                      </span>
                    ) : entry.udp.success ? (
                      <span className="text-emerald-400 font-medium flex justify-end gap-2 items-center">
                        <CheckCircle2 className="w-4 h-4" /> Reachable
                      </span>
                    ) : (
                      <span className="text-red-400 font-medium flex justify-end gap-2 items-center">
                        <AlertTriangle className="w-4 h-4" /> Blocked
                      </span>
                    )}
                  </td>

                  {/* Best Latency — shows — until this row has been tested */}
                  <td className={`px-6 py-4 text-right font-mono font-medium ${isTested ? getLatencyColor(entry.score) : 'text-slate-700'}`}>
                    {isTested && Number.isFinite(entry.score) ? `${Math.round(entry.score)} ms` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
