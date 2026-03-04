import { useState, useEffect } from 'react'
import { RefreshCw, Activity } from 'lucide-react'
import * as networkService from '../services/networkService'

export default function NetstatTab() {
  const [connections, setConnections] = useState<networkService.NetstatConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConnections = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await networkService.getNetstatConnections()
      setConnections(data)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch connections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConnections()
  }, [])

  return (
    <div className="flex flex-col gap-6 h-full pb-4">
      {/* Header / Controls */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white">Active Connections</h3>
          <p className="text-sm text-slate-400 mt-1">Real-time view of all active TCP/UDP connections on your system.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={fetchConnections}
            disabled={loading}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.2)] outline-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm flex items-center gap-2">
          <Activity className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Results Table */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        <div className="overflow-y-auto max-h-[600px] flex-1">
          <table className="w-full text-sm text-left relative">
            <thead className="bg-[#060b19] text-xs text-slate-400 uppercase tracking-wider border-b border-[#1e293b] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-medium">Protocol</th>
                <th className="px-6 py-4 font-medium">Local Address</th>
                <th className="px-6 py-4 font-medium">Foreign Address</th>
                <th className="px-6 py-4 font-medium">State</th>
                <th className="px-6 py-4 font-medium">PID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]/50">
              {loading && connections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin text-sky-400/50" />
                      Loading connections...
                    </div>
                  </td>
                </tr>
              ) : connections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No active connections found.
                  </td>
                </tr>
              ) : (
                connections.map((conn, i) => (
                  <tr key={`${conn.pid}-${conn.localAddress}-${conn.foreignAddress}-${i}`} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        conn.protocol.startsWith('TCP') ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                        'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}>
                        {conn.protocol}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-300 font-mono text-xs">{conn.localAddress}</td>
                    <td className="px-6 py-3 text-slate-300 font-mono text-xs">{conn.foreignAddress}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs ${
                        conn.state === 'ESTABLISHED' ? 'text-emerald-400 font-medium' :
                        conn.state === 'LISTENING' ? 'text-amber-400' :
                        conn.state === 'TIME_WAIT' || conn.state === 'CLOSE_WAIT' ? 'text-slate-400' :
                        'text-slate-500'
                      }`}>
                        {conn.state || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400 font-mono text-xs">{conn.pid}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-[#060b19] border-t border-[#1e293b] px-6 py-3 flex justify-between items-center text-xs text-slate-500">
          <span>Total Connections: <strong className="text-slate-300">{connections.length}</strong></span>
          <span>Only showing connections visible to current user context.</span>
        </div>
      </div>
    </div>
  )
}
