import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Play, RotateCcw } from 'lucide-react'
import { getActiveAdapter, pingTest, applyDns, flushDns, getCurrentDns } from '../services/networkService'
import type { NetworkAdapter } from '../services/networkService'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DnsServer {
  id: string
  name: string
  ip: string
  sec: string
  latency: string
  color: string
  category: ('gaming' | 'privacy' | 'general' | 'security' | 'family')[]
}

// ─── DNS Providers ────────────────────────────────────────────────────────────

const INITIAL_PROVIDERS: DnsServer[] = [
  { id: 'google',             name: 'Google Public DNS',              ip: '8.8.8.8',          sec: '8.8.4.4',             latency: '-', color: 'bg-blue-600',    category: ['general', 'gaming'] },
  { id: 'cf',                 name: 'Cloudflare (Standard)',          ip: '1.1.1.1',          sec: '1.0.0.1',             latency: '-', color: 'bg-orange-500',  category: ['general', 'privacy', 'gaming'] },
  { id: 'cf-privacy',         name: 'Cloudflare (Malware Blocking)',  ip: '1.1.1.2',          sec: '1.0.0.2',             latency: '-', color: 'bg-red-500',     category: ['security'] },
  { id: 'cf-family',          name: 'Cloudflare (Family)',            ip: '1.1.1.3',          sec: '1.0.0.3',             latency: '-', color: 'bg-green-500',   category: ['family', 'security'] },
  { id: 'quad9',              name: 'Quad9 (Filtered + DNSSEC)',      ip: '9.9.9.9',          sec: '149.112.112.112',     latency: '-', color: 'bg-red-600',     category: ['security', 'privacy'] },
  { id: 'quad9-unsec',        name: 'Quad9 (Unsecured)',              ip: '9.9.9.10',         sec: '149.112.112.10',      latency: '-', color: 'bg-gray-500',    category: ['general'] },
  { id: 'quad9-ecs',          name: 'Quad9 (ECS Support)',            ip: '9.9.9.11',         sec: '149.112.112.11',      latency: '-', color: 'bg-blue-400',    category: ['general'] },
  { id: 'opendns',            name: 'OpenDNS Home',                   ip: '208.67.222.222',   sec: '208.67.220.220',      latency: '-', color: 'bg-indigo-500',  category: ['general', 'security'] },
  { id: 'opendns-family',     name: 'OpenDNS FamilyShield',           ip: '208.67.222.123',   sec: '208.67.220.123',      latency: '-', color: 'bg-emerald-500', category: ['family', 'security'] },
  { id: 'adguard',            name: 'AdGuard DNS (Default)',          ip: '94.140.14.14',     sec: '94.140.15.15',        latency: '-', color: 'bg-green-600',   category: ['privacy', 'security'] },
  { id: 'adguard-family',     name: 'AdGuard DNS (Family)',           ip: '94.140.14.15',     sec: '94.140.15.16',        latency: '-', color: 'bg-lime-500',    category: ['family', 'security'] },
  { id: 'adguard-unfilt',     name: 'AdGuard DNS (Non-filtering)',    ip: '94.140.14.140',    sec: '94.140.14.141',       latency: '-', color: 'bg-neutral-400', category: ['general', 'gaming'] },
  { id: 'cb-security',        name: 'CleanBrowsing Security',         ip: '185.228.168.9',    sec: '185.228.169.9',       latency: '-', color: 'bg-rose-500',    category: ['security'] },
  { id: 'cb-family',          name: 'CleanBrowsing Family',           ip: '185.228.168.168',  sec: '185.228.169.168',     latency: '-', color: 'bg-pink-500',    category: ['family', 'security'] },
  { id: 'cb-adult',           name: 'CleanBrowsing Adult',            ip: '185.228.168.10',   sec: '185.228.169.11',      latency: '-', color: 'bg-fuchsia-500', category: ['family'] },
  { id: 'controld',           name: 'ControlD (No Filtering)',        ip: '76.76.2.0',        sec: '76.76.10.0',          latency: '-', color: 'bg-sky-500',     category: ['general', 'gaming'] },
  { id: 'controld-malware',   name: 'ControlD (Malware Blocking)',    ip: '76.76.2.1',        sec: '76.76.10.1',          latency: '-', color: 'bg-amber-600',   category: ['security'] },
  { id: 'controld-ads',       name: 'ControlD (Ads & Malware)',       ip: '76.76.2.2',        sec: '76.76.10.2',          latency: '-', color: 'bg-amber-500',   category: ['security', 'privacy'] },
  { id: 'mullvad',            name: 'Mullvad DNS (Standard)',         ip: '194.242.2.2',      sec: '194.242.2.3',         latency: '-', color: 'bg-purple-600',  category: ['privacy'] },
  { id: 'mullvad-ext',        name: 'Mullvad DNS (Extended)',         ip: '194.242.2.5',      sec: '194.242.2.9',         latency: '-', color: 'bg-violet-600',  category: ['privacy', 'security', 'family'] },
  { id: 'neustar-gen',        name: 'Vercara / Neustar General',      ip: '64.6.64.6',        sec: '64.6.65.6',           latency: '-', color: 'bg-zinc-600',    category: ['general'] },
  { id: 'neustar-threat',     name: 'Vercara Threat Protection',      ip: '156.154.70.2',     sec: '156.154.71.2',        latency: '-', color: 'bg-red-700',     category: ['security'] },
  { id: 'neustar-family',     name: 'Vercara Family Secure',          ip: '156.154.70.3',     sec: '156.154.71.3',        latency: '-', color: 'bg-teal-600',    category: ['family'] },
  { id: 'nextdns',            name: 'NextDNS',                        ip: '45.90.28.0',       sec: '45.90.30.0',          latency: '-', color: 'bg-blue-500',    category: ['privacy', 'security', 'gaming'] },
  { id: 'twnic',              name: 'TWNIC Quad 101',                 ip: '101.101.101.101',  sec: '101.102.103.104',     latency: '-', color: 'bg-cyan-500',    category: ['general', 'gaming'] },
  { id: 'cira',               name: 'CIRA Canadian Shield',           ip: '149.112.121.10',   sec: '149.112.122.10',      latency: '-', color: 'bg-red-400',     category: ['security', 'privacy'] },
  { id: 'yandex-basic',       name: 'Yandex DNS Basic',               ip: '77.88.8.8',        sec: '77.88.8.1',           latency: '-', color: 'bg-yellow-500',  category: ['general'] },
  { id: 'yandex-safe',        name: 'Yandex DNS Safe',                ip: '77.88.8.88',       sec: '77.88.8.2',           latency: '-', color: 'bg-orange-600',  category: ['security'] },
  { id: 'yandex-family',      name: 'Yandex DNS Family',              ip: '77.88.8.7',        sec: '77.88.8.3',           latency: '-', color: 'bg-red-400',     category: ['family'] },
  { id: 'level3',             name: 'CenturyLink / Level3',           ip: '4.2.2.1',          sec: '4.2.2.2',             latency: '-', color: 'bg-blue-700',    category: ['general', 'gaming'] },
  { id: 'comodo',             name: 'Comodo Secure DNS',              ip: '8.26.56.26',       sec: '8.20.247.20',         latency: '-', color: 'bg-cyan-600',    category: ['security'] },
  { id: 'dns-watch',          name: 'DNS.Watch',                      ip: '84.200.69.80',     sec: '84.200.70.40',        latency: '-', color: 'bg-stone-500',   category: ['privacy'] },
  { id: 'he',                 name: 'Hurricane Electric',             ip: '74.82.42.42',      sec: '74.82.42.1',          latency: '-', color: 'bg-slate-600',   category: ['general'] },
  { id: 'ali-dns',            name: 'Alibaba DNS (AliDNS)',           ip: '223.5.5.5',        sec: '223.6.6.6',           latency: '-', color: 'bg-blue-800',    category: ['general'] },
  { id: 'dnspod',             name: 'Tencent DNSPod',                 ip: '119.29.29.29',     sec: '182.254.116.116',     latency: '-', color: 'bg-cyan-700',    category: ['general'] },
  { id: '114dns',             name: '114DNS (Standard)',              ip: '114.114.114.114',  sec: '114.114.115.115',     latency: '-', color: 'bg-blue-900',    category: ['general'] },
  { id: 'freenom',            name: 'Freenom World',                  ip: '80.80.80.80',      sec: '80.80.81.81',         latency: '-', color: 'bg-teal-400',    category: ['privacy', 'general'] },
  { id: 'gcore',              name: 'Gcore DNS',                      ip: '95.85.95.85',      sec: '2.56.220.2',          latency: '-', color: 'bg-blue-300',    category: ['general', 'gaming'] },
  { id: 'dns-sb',             name: 'DNS.SB',                         ip: '185.222.222.222',  sec: '45.11.45.11',         latency: '-', color: 'bg-zinc-500',    category: ['privacy'] },
  { id: 'safedns',            name: 'SafeDNS',                        ip: '195.46.39.39',     sec: '195.46.39.40',        latency: '-', color: 'bg-slate-500',   category: ['security', 'family'] },
  { id: 'alternate-dns',      name: 'Alternate DNS',                  ip: '76.76.19.19',      sec: '76.223.122.150',      latency: '-', color: 'bg-rose-600',    category: ['security', 'general'] },
  { id: 'dyn',                name: 'Dyn (Oracle) DNS',               ip: '216.146.35.35',    sec: '216.146.36.36',       latency: '-', color: 'bg-indigo-400',  category: ['general'] },
  { id: 'opennic',            name: 'OpenNIC',                        ip: '185.121.177.177',  sec: '169.239.202.202',     latency: '-', color: 'bg-emerald-700', category: ['privacy', 'general'] },
]

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'gaming',   label: 'Gaming' },
  { id: 'privacy',  label: 'Privacy' },
  { id: 'security', label: 'Security' },
  { id: 'family',   label: 'Family' },
  { id: 'general',  label: 'General' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseLatencyMs = (latency: string): number => {
  if (latency === '-' || latency === 'Timeout') return Infinity
  return parseInt(latency.replace(' ms', ''), 10)
}

const sortByLatency = (servers: DnsServer[]): DnsServer[] =>
  [...servers].sort((a, b) => parseLatencyMs(a.latency) - parseLatencyMs(b.latency))

// ─── Component ────────────────────────────────────────────────────────────────

export default function DnsTab() {
  const [isBenchmarking, setIsBenchmarking] = useState(false)
  const [progress, setProgress]             = useState(0)
  const [adapter, setAdapter]               = useState<NetworkAdapter | null>(null)
  const [dnsServers, setDnsServers]         = useState<DnsServer[]>(INITIAL_PROVIDERS)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [isFlushing, setIsFlushing]         = useState(false)
  const [flushStatus, setFlushStatus]       = useState<'idle' | 'success' | 'error'>('idle')
  const [applyStatus, setApplyStatus]       = useState<{ id: string; status: 'success' | 'error' } | null>(null)
  const [currentDns, setCurrentDns]         = useState<{ primary: string; secondary: string } | null>(null)
  const [benchmarkDone, setBenchmarkDone]   = useState(false)

  useEffect(() => {
    getActiveAdapter()
      .then(a => { setAdapter(a); return getCurrentDns(a.name) })
      .then(dns => setCurrentDns(dns))
      .catch(console.error)
  }, [])

  const filteredServers = activeCategory === 'all'
    ? dnsServers
    : dnsServers.filter(s => s.category.includes(activeCategory as DnsServer['category'][number]))

  const bestInFilter = (() => {
    let best: DnsServer | null = null
    let minLat = Infinity
    for (const s of filteredServers) {
      const lat = parseLatencyMs(s.latency)
      if (lat < minLat) { minLat = lat; best = s }
    }
    return best as DnsServer | null
  })()

  const runBenchmark = async () => {
    setIsBenchmarking(true)
    setBenchmarkDone(false)
    setProgress(0)
    setApplyStatus(null)
    setDnsServers(INITIAL_PROVIDERS)

    const updated: DnsServer[] = [...INITIAL_PROVIDERS]

    for (let i = 0; i < INITIAL_PROVIDERS.length; i++) {
      const server = INITIAL_PROVIDERS[i]
      let total = 0
      let pings = 0
      for (let j = 0; j < 3; j++) {
        const res = await pingTest(server.ip)
        if (res.success) { total += res.latency; pings++ }
      }
      const avg = pings > 0 ? Math.round(total / pings) : Infinity
      updated[i] = { ...updated[i], latency: avg === Infinity ? 'Timeout' : `${avg} ms` }
      setDnsServers(sortByLatency([...updated]))
      setProgress(((i + 1) / INITIAL_PROVIDERS.length) * 100)
    }

    setDnsServers(sortByLatency([...updated]))
    setBenchmarkDone(true)
    setIsBenchmarking(false)
  }

  const handleApply = async (server: DnsServer) => {
    if (!adapter) return
    setApplyStatus(null)
    const success = await applyDns(adapter.name, server.ip, server.sec)
    setApplyStatus({ id: server.id, status: success ? 'success' : 'error' })
    if (success) setCurrentDns({ primary: server.ip, secondary: server.sec })
  }

  const handleFlush = async () => {
    setIsFlushing(true)
    setFlushStatus('idle')
    const success = await flushDns()
    setFlushStatus(success ? 'success' : 'error')
    setIsFlushing(false)
    setTimeout(() => setFlushStatus('idle'), 3000)
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Controls ── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-medium text-white">DNS Speed Test</h3>
            <p className="text-sm text-slate-400 mt-1">
              Runs 3 pings against {INITIAL_PROVIDERS.length} global resolvers — auto-sorted by speed.
            </p>
            {currentDns && (
              <p className="text-xs text-slate-500 mt-2 font-mono">
                Current DNS:{' '}
                <span className="text-slate-300">{currentDns.primary}</span>
                {currentDns.secondary !== 'None' && (
                  <> · <span className="text-slate-400">{currentDns.secondary}</span></>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Flush DNS */}
            <button
              onClick={handleFlush}
              disabled={isFlushing || isBenchmarking}
              className="flex items-center gap-2 bg-[#060b19] hover:bg-slate-800 disabled:opacity-50 text-slate-300 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border border-[#1e293b] outline-none"
            >
              {isFlushing
                ? <Activity className="w-4 h-4 animate-spin" />
                : flushStatus === 'success'
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : flushStatus === 'error'
                    ? <AlertTriangle className="w-4 h-4 text-red-400" />
                    : <RotateCcw className="w-4 h-4" />
              }
              {flushStatus === 'success' ? 'Flushed' : flushStatus === 'error' ? 'Failed' : 'Flush DNS'}
            </button>

            {/* Run Benchmark */}
            <button
              onClick={runBenchmark}
              disabled={isBenchmarking}
              className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.2)] outline-none"
            >
              {isBenchmarking ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isBenchmarking ? 'Testing...' : 'Run Benchmark'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {(isBenchmarking || benchmarkDone) && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-mono">
              <span>{benchmarkDone ? `Complete — ${INITIAL_PROVIDERS.length} providers tested` : 'Testing resolvers...'}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-slate-800/50 rounded-full h-1.5 overflow-hidden border border-[#1e293b]">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${benchmarkDone ? 'bg-emerald-500' : 'bg-sky-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Apply Best CTA ── */}
      {benchmarkDone && bestInFilter && parseLatencyMs(bestInFilter.latency) < Infinity && (
        <div className="bg-sky-500/[0.06] border border-sky-500/20 rounded-xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-sky-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-white">
                Fastest:{' '}
                <span className="text-sky-400">{bestInFilter.name}</span>
                <span className="ml-2 text-slate-400 font-mono text-xs">{bestInFilter.ip}</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{bestInFilter.latency} average ping</p>
            </div>
          </div>
          <button
            onClick={() => handleApply(bestInFilter)}
            disabled={!adapter}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.3)] outline-none"
          >
            Apply Best
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Apply status inline toast ── */}
      {applyStatus && (
        <div className={`rounded-lg px-5 py-3 text-sm font-medium flex items-center gap-2 ${
          applyStatus.status === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {applyStatus.status === 'success'
            ? <><CheckCircle2 className="w-4 h-4" /> DNS applied to {adapter?.name ?? 'adapter'}. Effective immediately.</>
            : <><AlertTriangle className="w-4 h-4" /> Failed to apply DNS. Run Uptimizer as Administrator.</>
          }
        </div>
      )}

      {/* ── Category Filter ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors outline-none ${
                isActive
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'bg-[#060b19] text-slate-400 hover:text-slate-200 border border-[#1e293b]'
              }`}
            >
              {cat.label}
            </button>
          )
        })}
        <span className="ml-auto text-xs text-slate-600 font-mono">
          {filteredServers.length} / {dnsServers.length} providers
        </span>
      </div>

      {/* ── Results Table ── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#060b19] text-xs text-slate-400 uppercase tracking-wider border-b border-[#1e293b]">
            <tr>
              <th className="px-6 py-4 font-medium">Provider</th>
              <th className="px-6 py-4 font-medium">Primary IPv4</th>
              <th className="px-6 py-4 font-medium">Secondary IPv4</th>
              <th className="px-6 py-4 font-medium text-right">Avg Latency</th>
              <th className="px-6 py-4 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e293b]/50">
            {filteredServers.map(server => {
              const isBest   = benchmarkDone && server.id === bestInFilter?.id
              const applied  = applyStatus?.id === server.id
              const latMs    = parseLatencyMs(server.latency)

              return (
                <tr
                  key={server.id}
                  className={`transition-colors ${isBest ? 'bg-sky-500/[0.03]' : 'hover:bg-white/[0.02]'}`}
                >
                  <td className="px-6 py-4 font-medium text-white">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 flex-shrink-0 rounded-full ${server.color} opacity-80`} />
                      {server.name}
                      {isBest && (
                        <span className="text-[10px] uppercase tracking-wider bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full border border-sky-500/20">
                          Fastest
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-mono">{server.ip}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">{server.sec}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono font-medium ${
                      isBest              ? 'text-sky-400' :
                      server.latency === 'Timeout' ? 'text-red-400/60' :
                      latMs < 30          ? 'text-emerald-400' :
                      latMs < 80          ? 'text-amber-400' :
                                            'text-slate-300'
                    }`}>
                      {server.latency}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {applied ? (
                      <span className={`text-xs font-medium ${
                        applyStatus?.status === 'success' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {applyStatus?.status === 'success' ? 'Applied' : 'Failed'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleApply(server)}
                        disabled={server.latency === '-' || isBenchmarking || server.latency === 'Timeout' || !adapter}
                        className="group flex items-center justify-end gap-1 w-full text-slate-400 hover:text-sky-400 disabled:opacity-30 disabled:hover:text-slate-400 font-medium px-2 py-1 transition-colors outline-none"
                      >
                        Apply
                        <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </button>
                    )}
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
