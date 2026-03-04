import { useState, useCallback } from 'react'
import { Server, RotateCcw, Info, XCircle, Wifi } from 'lucide-react'
import { scanLan } from '../services/networkService'
import type { LanDevice } from '../services/networkService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Numeric sort by IP address */
const ipToNum = (ip: string): number => {
  const parts = ip.split('.')
  return (
    (parseInt(parts[0], 10) << 24) +
    (parseInt(parts[1], 10) << 16) +
    (parseInt(parts[2], 10) << 8) +
    parseInt(parts[3], 10)
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LanScannerTab() {
  const [devices, setDevices] = useState<LanDevice[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const [progress, setProgress] = useState<{ scanned: number; total: number }>({ scanned: 0, total: 0 })

  const handleScan = useCallback(async () => {
    setIsScanning(true)
    setError(null)
    setDevices([])
    setProgress({ scanned: 0, total: 0 })
    try {
      const result = await scanLan((scanned, total, newDevice) => {
        setProgress({ scanned, total })
        if (newDevice) {
          setDevices(prev => [...prev, newDevice].sort((a, b) => ipToNum(a.ip) - ipToNum(b.ip)))
        }
      })
      setDevices(result.sort((a, b) => ipToNum(a.ip) - ipToNum(b.ip)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsScanning(false)
      setLastScan(new Date())
    }
  }, [])

  const pct = progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0

  return (
    <div className="flex flex-col gap-6 h-full pb-4">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Server className="w-6 h-6 text-sky-400" />
          <h2 className="text-xl font-semibold text-white">LAN Scanner</h2>
        </div>
        <p className="text-sm text-slate-400 ml-9">Discover all devices on your local network</p>
      </div>

      {/* ── Scan Card ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.2)] outline-none"
            >
              <RotateCcw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning...' : 'Scan Network'}
            </button>
            {lastScan && !isScanning && (
              <span className="text-xs text-slate-500">
                Last scan: {lastScan.toLocaleTimeString()}
              </span>
            )}
          </div>
          {devices.length > 0 && !isScanning && (
            <span className="text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 px-3 py-1 rounded-full">
              {devices.length} device{devices.length !== 1 ? 's' : ''} found
            </span>
          )}
        </div>

        {/* Progress bar while scanning */}
        {isScanning && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400">
                Scanning {progress.scanned} / {progress.total || '...'} addresses
              </span>
              {progress.total > 0 && (
                <span className="text-xs font-mono text-sky-400">{pct}%</span>
              )}
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              {progress.total > 0 ? (
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-full bg-sky-500/60 rounded-full animate-pulse w-1/3" />
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* ── Results Table ─────────────────────────────────────────────────── */}
      {devices.length > 0 ? (
        <div className="bg-[#0a0f1e] border border-slate-800 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#060b19] border-b border-slate-800">
                  <th className="text-slate-400 text-xs uppercase font-medium px-4 py-3 tracking-wider">
                    IP Address
                  </th>
                  <th className="text-slate-400 text-xs uppercase font-medium px-4 py-3 tracking-wider">
                    MAC Address
                  </th>
                  <th className="text-slate-400 text-xs uppercase font-medium px-4 py-3 tracking-wider">
                    Vendor
                  </th>
                  <th className="text-slate-400 text-xs uppercase font-medium px-4 py-3 tracking-wider">
                    Hostname
                  </th>
                  <th className="text-slate-400 text-xs uppercase font-medium px-4 py-3 tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device, idx) => {
                  const isOnline = device.status === 'online'
                  const macPrefix = device.mac ? device.mac.substring(0, 8) : null
                  return (
                    <tr
                      key={device.ip}
                      className={`${
                        idx % 2 === 0 ? 'bg-[#0a0f1e]' : 'bg-[#060b19]'
                      } border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors`}
                    >
                      {/* IP */}
                      <td className="px-4 py-3 text-slate-200 font-mono">
                        <div className="flex items-center gap-2">
                          {device.ip}
                          {device.isOwn && (
                            <span className="text-[10px] font-medium bg-sky-500/15 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>
                      {/* MAC */}
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {device.mac ?? <span className="text-slate-600">N/A</span>}
                      </td>
                      {/* Vendor */}
                      <td className="px-4 py-3 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span>{device.vendor ?? <span className="text-slate-600">Unknown</span>}</span>
                          {macPrefix && (
                            <span className="group relative">
                              <Info className="w-3.5 h-3.5 text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
                              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
                                OUI: {macPrefix}
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Hostname */}
                      <td className="px-4 py-3 text-slate-300">
                        {device.hostname ?? <span className="text-slate-600">-</span>}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {isOnline ? (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
                            <span className="text-emerald-400 text-xs font-medium">Online</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-600" />
                            <span className="text-slate-500 text-xs font-medium">
                              {device.status === 'arp-only' ? 'ARP Only' : 'Offline'}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Empty State ──────────────────────────────────────────────────── */
        !isScanning && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Wifi className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">
                No devices found. Click &apos;Scan Network&apos; to discover devices on your LAN.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  )
}
