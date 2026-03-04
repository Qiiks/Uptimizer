import { useEffect, useState, useCallback } from 'react'
import { Gauge, RotateCcw, Terminal, Trash2 } from 'lucide-react'
import { getPowerPlans, setPowerPlan, deletePowerPlan } from '../services/networkService'
import type { PowerPlan } from '../services/networkService'

// ─── Built-in GUIDs (cannot be deleted) ──────────────────────────────────────

const BUILTIN_GUIDS = new Set([
  '381b4222-f694-41f0-9685-ff5bb260df2e', // Balanced
  '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', // High performance
  'a1841308-3541-4fab-bc81-f71556f20b4a', // Power saver
  'e9a42b02-d5df-448d-aa00-03f14749eb61', // Ultimate Performance
  'de0cee60-bf1d-441f-987a-7f2f0b12e2a7', // Windows 11 variant
])

// ─── Original Plan Persistence ────────────────────────────────────────────────

const ORIGINAL_KEY = 'uptimizer-power-plan-original'

interface OriginalPlan {
  guid: string
  name: string
}

const loadOriginalPlan = (): OriginalPlan | null => {
  try {
    const raw = localStorage.getItem(ORIGINAL_KEY)
    return raw ? (JSON.parse(raw) as OriginalPlan) : null
  } catch {
    return null
  }
}

const saveOriginalPlan = (plan: OriginalPlan): void => {
  localStorage.setItem(ORIGINAL_KEY, JSON.stringify(plan))
}

const clearOriginalPlan = (): void => {
  localStorage.removeItem(ORIGINAL_KEY)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLogColor(line: string): string {
  if (line.includes('[SUCCESS]')) return 'text-emerald-400'
  if (line.includes('[ERROR]')) return 'text-red-400'
  if (line.includes('[WARN]')) return 'text-amber-400'
  if (line.includes('[INFO]')) return 'text-sky-400'
  return 'text-slate-300'
}

function shortGuid(guid: string): string {
  return `${guid.slice(0, 8)}...`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PowerPlanTab() {
  const [plans, setPlans] = useState<PowerPlan[]>([])
  const [originalPlan, setOriginalPlan] = useState<OriginalPlan | null>(loadOriginalPlan)
  const [isLoading, setIsLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const appendLog = (line: string) => setLogs(prev => [...prev, line])

  const reloadPlans = useCallback(async () => {
    const updated = await getPowerPlans()
    setPlans(updated)
    return updated
  }, [])

  // Load plans on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadPlans()
  }, [reloadPlans])

  // ── Switch Plan ─────────────────────────────────────────────────────────────
  const handleSwitch = async (plan: PowerPlan) => {
    if (isLoading) return
    setIsLoading(true)

    // Save original if not yet saved
    if (!originalPlan) {
      const activePlan = plans.find(p => p.isActive)
      if (activePlan) {
        const orig: OriginalPlan = { guid: activePlan.guid, name: activePlan.name }
        saveOriginalPlan(orig)
        setOriginalPlan(orig)
      }
    }

    appendLog(`[INFO] Switching to "${plan.name}"…`)
    const success = await setPowerPlan(plan.guid)

    if (success) {
      appendLog(`[SUCCESS] Switched to "${plan.name}"`)
    } else {
      appendLog(`[ERROR] Failed to switch plan. Try running as Administrator.`)
    }

    await reloadPlans()
    setIsLoading(false)
  }

  // ── Restore Original ────────────────────────────────────────────────────────
  const handleRestoreOriginal = async () => {
    if (!originalPlan || isLoading) return
    setIsLoading(true)
    appendLog(`[INFO] Restoring original plan "${originalPlan.name}"…`)

    const success = await setPowerPlan(originalPlan.guid)
    if (success) {
      appendLog(`[SUCCESS] Restored original plan "${originalPlan.name}"`)
    } else {
      appendLog(`[ERROR] Failed to restore original plan.`)
    }

    await reloadPlans()
    setIsLoading(false)
  }

  // ── Clear Saved Original ────────────────────────────────────────────────────
  const handleClearOriginal = () => {
    clearOriginalPlan()
    setOriginalPlan(null)
    appendLog('[INFO] Saved original plan reference cleared.')
  }

  // ── Delete Plan ─────────────────────────────────────────────────────────────
  const handleDelete = async (plan: PowerPlan) => {
    if (isLoading) return

    if (BUILTIN_GUIDS.has(plan.guid)) {
      appendLog('[ERROR] Cannot delete built-in Windows plan.')
      return
    }

    setIsLoading(true)
    appendLog(`[INFO] Deleting plan "${plan.name}"…`)

    const success = await deletePowerPlan(plan.guid)
    if (success) {
      appendLog(`[SUCCESS] Deleted plan "${plan.name}"`)
    } else {
      appendLog(`[ERROR] Failed to delete plan "${plan.name}".`)
    }

    await reloadPlans()
    setIsLoading(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header Card ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/20 h-fit">
            <Gauge className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Power Plan Manager</h3>
            <p className="text-sm text-slate-400 mt-1">
              Switch Windows power plans to optimize performance or battery life.
            </p>
          </div>
        </div>
        <button
          onClick={() => reloadPlans()}
          disabled={isLoading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-[#1e293b]"
        >
          <RotateCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* ── Original Plan Banner ─────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl px-5 py-4 shadow-sm">
        {originalPlan ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <RotateCcw className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <span>
                Original Plan:{' '}
                <span className="font-medium text-white">"{originalPlan.name}"</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreOriginal}
                disabled={isLoading}
                className="flex items-center gap-1.5 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 text-sky-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-sky-500/20"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore
              </button>
              <button
                onClick={handleClearOriginal}
                disabled={isLoading}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-[#1e293b]"
                title="Clear saved reference"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Original plan is saved automatically before the first switch.
          </p>
        )}
      </div>

      {/* ── Power Plans List ──────────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
        {plans.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-600 italic">
            Loading power plans…
          </div>
        ) : (
          <div className="divide-y divide-[#1e293b]/50">
            {plans.map(plan => (
              <div
                key={plan.guid}
                className={`flex items-center justify-between px-6 py-4 transition-all duration-200 ${
                  plan.isActive
                    ? 'bg-sky-500/[0.05]'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                {/* Left: indicator + name + guid */}
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      plan.isActive ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]' : 'bg-slate-700'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200">{plan.name}</span>
                      {plan.isActive && (
                        <span className="text-[10px] uppercase tracking-wider bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full border border-sky-500/20">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-slate-600">{shortGuid(plan.guid)}</span>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!plan.isActive && (
                    <button
                      onClick={() => handleSwitch(plan)}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_10px_rgba(14,165,233,0.15)]"
                    >
                      Switch to Plan
                    </button>
                  )}
                  {!BUILTIN_GUIDS.has(plan.guid) && (
                    <button
                      onClick={() => handleDelete(plan)}
                      disabled={isLoading || plan.isActive}
                      className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-30 text-red-400 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-red-500/20"
                      title="Delete custom plan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Terminal Log ──────────────────────────────────────────────────────── */}
      <div className="bg-[#020617] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col h-[240px]">
        <div className="bg-[#060b19] px-4 py-2.5 border-b border-[#1e293b] flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-mono text-slate-400">power_plan.exe</span>
        </div>
        <div className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <div className="text-slate-600 h-full flex items-center justify-center italic">
              Waiting to begin…
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((line, i) => (
                <div key={i} className={getLogColor(line)}>
                  <span className="text-slate-600 mr-2">{'>'}</span>
                  {line}
                </div>
              ))}
              {isLoading && (
                <div className="text-slate-500 animate-pulse">
                  <span className="text-slate-600 mr-2">{'>'}</span>_
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
