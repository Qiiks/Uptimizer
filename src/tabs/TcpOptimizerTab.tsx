import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Cpu, RotateCcw, SlidersHorizontal, Terminal, Trash2 } from 'lucide-react'
import { getTcpSettings, applyTcpCommands, getRegistryTweakStatus, applyRegistryTweaks, revertRegistryTweaks, getWindowsVersion, supportsAdvancedTcpSettings, MIN_BUILD_FOR_ADVANCED } from '../services/networkService'
import type { TcpSettings, RegistryTweakStatus, WindowsVersion } from '../services/networkService'

// ─── Profile Definitions ──────────────────────────────────────────────────────

const PROFILES = {
  gaming: {
    label: 'Gaming',
    description: 'Reduces buffer bloat and ACK delays for competitive play.',
    commands: [
      'netsh int tcp set global autotuninglevel=highlyrestricted',
      'netsh int tcp set global congestionprovider=none',
      'netsh int tcp set global ecncapability=disabled',
      'netsh int tcp set global timestamps=enabled',
      'netsh int tcp set global initialrto=2000',
      'netsh int tcp set global rss=enabled',
    ],
  },
  streaming: {
    label: 'Streaming',
    description: 'Maximizes throughput for streaming and downloads.',
    commands: [
      'netsh int tcp set global autotuninglevel=normal',
      'netsh int tcp set global congestionprovider=default',
      'netsh int tcp set global ecncapability=enabled',
      'netsh int tcp set global timestamps=enabled',
      'netsh int tcp set global initialrto=3000',
      'netsh int tcp set global rss=enabled',
    ],
  },
  default: {
    label: 'Windows Default',
    description: 'Restores Windows factory TCP/IP defaults.',
    commands: [
      'netsh int tcp set global autotuninglevel=normal',
      'netsh int tcp set global congestionprovider=default',
      'netsh int tcp set global ecncapability=disabled',
      'netsh int tcp set global timestamps=disabled',
      'netsh int tcp set global initialrto=3000',
      'netsh int tcp set global rss=enabled',
    ],
  },
} as const

type ProfileKey = keyof typeof PROFILES

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SETTING_LABELS: Record<keyof TcpSettings, string> = {
  autotuninglevel: 'Receive Window Auto-Tuning Level',
  congestionprovider: 'Congestion Control Provider',
  ecncapability: 'ECN Capability',
  timestamps: 'RFC 1323 Timestamps',
  initialrto: 'Initial RTO',
  rss: 'Receive-Side Scaling',
}

const isPositiveValue = (key: keyof TcpSettings, value: string): boolean => {
  if (key === 'initialrto') return false // numeric — no colour positive indicator
  return value === 'enabled' || value === 'normal'
}

const isNeutralValue = (value: string): boolean =>
  value === 'disabled' || value === 'unknown' || value === 'none' || value === 'default'

function getLogColor(line: string): string {
  if (line.includes('[SUCCESS]')) return 'text-emerald-400'
  if (line.includes('[ERROR]')) return 'text-red-400'
  if (line.includes('[WARN]')) return 'text-amber-400'
  if (line.includes('[INFO]')) return 'text-sky-400'
  return 'text-slate-300'
}

// ─── Backup Persistence ───────────────────────────────────────────────────────

const BACKUP_KEY = 'uptimizer-tcp-backup'

interface TcpBackup {
  settings: TcpSettings
  timestamp: string
}

const loadBackup = (): TcpBackup | null => {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    return raw ? (JSON.parse(raw) as TcpBackup) : null
  } catch {
    return null
  }
}

const saveBackup = (settings: TcpSettings): void => {
  localStorage.setItem(
    BACKUP_KEY,
    JSON.stringify({ settings, timestamp: new Date().toISOString() })
  )
}

const deleteBackup = (): void => {
  localStorage.removeItem(BACKUP_KEY)
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function SettingRow({
  label,
  settingKey,
  value,
}: {
  label: string
  settingKey: keyof TcpSettings
  value: string
}) {
  const isRto = settingKey === 'initialrto'
  const positive = isPositiveValue(settingKey, value)
  const neutral = isNeutralValue(value)

  let dotColor = 'bg-slate-600'
  let valueColor = 'text-slate-400'

  if (!isRto) {
    if (positive) {
      dotColor = 'bg-emerald-400'
      valueColor = 'text-emerald-400'
    } else if (!neutral) {
      dotColor = 'bg-sky-400'
      valueColor = 'text-sky-400'
    }
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1e293b]/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <span className={`text-xs font-mono font-medium ${valueColor}`}>
        {value}{isRto ? ' ms' : ''}
      </span>
    </div>
  )
}

function SettingsCard({ settings }: { settings: TcpSettings }) {
  return (
    <div>
      {(Object.keys(SETTING_LABELS) as (keyof TcpSettings)[]).map(key => (
        <SettingRow
          key={key}
          label={SETTING_LABELS[key]}
          settingKey={key}
          value={settings[key]}
        />
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TcpOptimizerTab() {
  const [currentSettings, setCurrentSettings] = useState<TcpSettings | null>(null)
  const [backup, setBackup] = useState<TcpBackup | null>(loadBackup)
  const [isApplying, setIsApplying] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [windowsVersion, setWindowsVersion] = useState<WindowsVersion | null>(null)

  // Registry tweaks state
  const [regStatus, setRegStatus] = useState<RegistryTweakStatus | null>(null)
  const [regOpen, setRegOpen] = useState(false)
  const [isRegApplying, setIsRegApplying] = useState(false)

  // Timer Resolution state
  const [timerApplied, setTimerApplied] = useState(false)
  const [timerLoading, setTimerLoading] = useState(false)

  // Load current TCP settings on mount
  useEffect(() => {
    getTcpSettings().then(setCurrentSettings).catch(() => {
      setCurrentSettings(null)
    })
  }, [])

  // Load Windows version on mount
  useEffect(() => {
    getWindowsVersion().then(setWindowsVersion).catch(() => {
      setWindowsVersion(null)
    })
  }, [])

  // Load registry tweak status when section is opened
  useEffect(() => {
    if (regOpen && regStatus === null) {
      getRegistryTweakStatus().then(setRegStatus).catch(() => setRegStatus(null))
    }
  }, [regOpen, regStatus])

  const appendLogs = (newLines: string[]) =>
    setLogs(prev => [...prev, ...newLines])

  const handleApplyProfile = async (profileKey: ProfileKey) => {
    if (isApplying) return
    const profile = PROFILES[profileKey]
    setIsApplying(true)

    // Save backup before first apply
    if (!backup) {
      const live = await getTcpSettings()
      saveBackup(live)
      const newBackup = loadBackup()
      setBackup(newBackup)
    }

    appendLogs([`[INFO] Applying ${profile.label} profile...`])

    // Filter commands based on Windows version support
    const advancedSupported = await supportsAdvancedTcpSettings()
    const filteredCommands: string[] = []
    const skippedCommands: string[] = []

    for (const cmd of profile.commands) {
      const isTimestamps = /netsh int tcp set global timestamps=/i.test(cmd)
      const isInitialRto = /netsh int tcp set global initialrto=/i.test(cmd)
      if ((isTimestamps || isInitialRto) && !advancedSupported) {
        skippedCommands.push(cmd)
      } else {
        filteredCommands.push(cmd)
      }
    }

    if (skippedCommands.length > 0) {
      for (const cmd of skippedCommands) {
        const param = /initialrto/i.test(cmd) ? 'initialrto' : 'timestamps'
        appendLogs([`[INFO] Skipped ${param} command: requires Windows 10 1809+ (Build ${MIN_BUILD_FOR_ADVANCED}+)`])
      }
    }

    const results = await applyTcpCommands(filteredCommands)
    appendLogs(results)

    // Reload current settings
    const updated = await getTcpSettings()
    setCurrentSettings(updated)

    const hasError = results.some(r => r.includes('[ERROR]'))
    appendLogs([
      hasError
        ? '[ERROR] Some commands encountered errors. See details above.'
        : `[SUCCESS] ${profile.label} profile applied.`,
    ])

    setIsApplying(false)
  }

  const handleRestoreBackup = async () => {
    if (!backup || isApplying) return
    setIsApplying(true)
    appendLogs(['[INFO] Restoring backup settings...'])

    // Build commands from backup values
    const s = backup.settings
    const commands = [
      `netsh int tcp set global autotuninglevel=${s.autotuninglevel}`,
      `netsh int tcp set global congestionprovider=${s.congestionprovider}`,
      `netsh int tcp set global ecncapability=${s.ecncapability}`,
      `netsh int tcp set global timestamps=${s.timestamps}`,
      `netsh int tcp set global initialrto=${s.initialrto}`,
      `netsh int tcp set global rss=${s.rss}`,
    ]

    const results = await applyTcpCommands(commands)
    appendLogs(results)

    const updated = await getTcpSettings()
    setCurrentSettings(updated)

    const hasError = results.some(r => r.includes('[ERROR]'))
    appendLogs([hasError ? '[ERROR] Restore encountered errors.' : '[SUCCESS] Backup restored.'])

    setIsApplying(false)
  }

  const handleDeleteBackup = () => {
    deleteBackup()
    setBackup(null)
    appendLogs(['[INFO] Backup deleted.'])
  }

  const handleRefresh = async () => {
    const s = await getTcpSettings()
    setCurrentSettings(s)
    appendLogs(['[INFO] Settings refreshed.'])
  }

  const handleApplyRegTweaks = async () => {
    if (isRegApplying) return
    setIsRegApplying(true)
    appendLogs(['[INFO] Applying registry network tweaks...'])
    const results = await applyRegistryTweaks()
    appendLogs(results)
    const updated = await getRegistryTweakStatus()
    setRegStatus(updated)
    const hasError = results.some(r => r.includes('[ERROR]'))
    appendLogs([hasError ? '[ERROR] Some registry tweaks failed.' : '[SUCCESS] Registry tweaks applied.'])
    setIsRegApplying(false)
  }

  const handleRevertRegTweaks = async () => {
    if (isRegApplying) return
    setIsRegApplying(true)
    appendLogs(['[INFO] Reverting registry network tweaks to Windows defaults...'])
    const results = await revertRegistryTweaks()
    appendLogs(results)
    const updated = await getRegistryTweakStatus()
    setRegStatus(updated)
    const hasError = results.some(r => r.includes('[ERROR]'))
    appendLogs([hasError ? '[ERROR] Some reverts failed.' : '[SUCCESS] Registry tweaks reverted.'])
    setIsRegApplying(false)
  }

  const handleTimerResolution = async (apply: boolean) => {
    setTimerLoading(true)
    const cmds = apply ? [
      'bcdedit /set useplatformclock true',
      'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f'
    ] : [
      'bcdedit /deletevalue useplatformclock',
      'reg delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel" /v GlobalTimerResolutionRequests /f'
    ]
    appendLogs([`[INFO] ${apply ? 'Applying' : 'Reverting'} timer resolution tweak...`])
    const results = await applyTcpCommands(cmds)
    appendLogs(results)
    const hasError = results.some(r => r.includes('[ERROR]'))
    appendLogs([hasError ? '[ERROR] Timer resolution tweak failed.' : '[SUCCESS] Timer resolution tweak applied.'])
    setTimerApplied(apply)
    setTimerLoading(false)
  }

  const formattedBackupTime = backup
    ? new Date(backup.timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header Card ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/20 h-fit">
            <SlidersHorizontal className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">TCP/IP Optimizer</h3>
            <p className="text-sm text-slate-400 mt-1">
              Tune TCP/IP parameters with profiles. Backup before applying.
            </p>
            {windowsVersion && (
              <p className="text-xs text-slate-500 mt-1">
                {windowsVersion.version}
                {windowsVersion.build > 0 && (
                  <span className="text-slate-600"> · Build {windowsVersion.build}</span>
                )}
                {windowsVersion.build > 0 && windowsVersion.build < MIN_BUILD_FOR_ADVANCED && (
                  <span className="text-amber-500/80"> · Advanced TCP settings unavailable</span>
                )}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isApplying}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-[#1e293b]"
        >
          <RotateCcw className="w-4 h-4" />
          Refresh Settings
        </button>
      </div>

      {/* ── Current Settings + Backup ─────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-6">
        {/* Current Settings — ~40% */}
        <div className="col-span-2 bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h4 className="text-sm font-medium text-white mb-4">Current Settings</h4>
          {currentSettings ? (
            <SettingsCard settings={currentSettings} />
          ) : (
            <div className="text-xs text-slate-600 italic py-4 text-center">Loading…</div>
          )}
        </div>

        {/* Backup Status — ~60% */}
        <div className="col-span-3 bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h4 className="text-sm font-medium text-white mb-4">Backup Status</h4>

          {backup ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Saved on:{' '}
                  <span className="text-slate-200 font-medium">{formattedBackupTime}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRestoreBackup}
                    disabled={isApplying}
                    className="flex items-center gap-1.5 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 text-sky-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-sky-500/20"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore Backup
                  </button>
                  <button
                    onClick={handleDeleteBackup}
                    disabled={isApplying}
                    className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border border-red-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Backup
                  </button>
                </div>
              </div>
              {/* Compact backup settings preview */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {(Object.keys(SETTING_LABELS) as (keyof TcpSettings)[]).map(key => (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-[#1e293b]/40 last:border-0">
                    <span className="text-xs text-slate-500 truncate pr-2">{SETTING_LABELS[key]}</span>
                    <span className="text-xs font-mono text-slate-300 flex-shrink-0">
                      {backup.settings[key]}{key === 'initialrto' ? ' ms' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
              <span className="text-sm text-slate-300">No backup saved</span>
              <span className="text-xs text-slate-500 max-w-xs">
                A backup is saved automatically before the first profile is applied.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Profile Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {(Object.entries(PROFILES) as [ProfileKey, typeof PROFILES[ProfileKey]][]).map(
          ([key, profile]) => (
            <div
              key={key}
              className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-5 shadow-sm flex flex-col gap-4"
            >
              <div>
                <h4 className="text-sm font-semibold text-white mb-1">{profile.label}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{profile.description}</p>
              </div>
              <button
                onClick={() => handleApplyProfile(key)}
                disabled={isApplying}
                className="mt-auto w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
              >
                {isApplying ? 'Applying…' : `Apply ${profile.label}`}
              </button>
            </div>
          )
        )}
      </div>

      {/* ── Registry Tweaks (collapsible) ─────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl shadow-sm overflow-hidden">
        {/* Header / toggle */}
        <button
          onClick={() => setRegOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-white">Advanced Registry Tweaks</span>
            <span className="text-xs text-slate-500 bg-[#060b19] border border-[#1e293b] px-2 py-0.5 rounded-full">
              Gaming Performance
            </span>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${regOpen ? 'rotate-90' : ''}`}
          />
        </button>

        {regOpen && (
          <div className="border-t border-[#1e293b] px-5 py-5 flex flex-col gap-5">
            <p className="text-xs text-slate-400 leading-relaxed">
              These registry values reduce latency for games and real-time applications by disabling
              Nagle&apos;s algorithm, forcing immediate TCP ACKs, removing Windows network throttling,
              and maximizing foreground process priority.
            </p>

            {/* Tweak status rows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { key: 'tcpNoDelay', label: 'Disable Nagle\'s Algorithm', desc: 'TCPNoDelay = 1' },
                { key: 'tcpAckFrequency', label: 'Immediate TCP ACKs', desc: 'TcpAckFrequency = 1' },
                { key: 'networkThrottling', label: 'Disable Network Throttling', desc: 'NetworkThrottlingIndex = FFFFFFFF' },
                { key: 'systemResponsiveness', label: 'Max Foreground Priority', desc: 'SystemResponsiveness = 0' },
              ] as { key: keyof RegistryTweakStatus; label: string; desc: string }[]).map(({ key, label, desc }) => {
                const val = regStatus ? regStatus[key] : null
                const isOn = val === true
                const isOff = val === false
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between bg-[#060b19] border border-[#1e293b] rounded-lg px-4 py-3"
                  >
                    <div>
                      <p className="text-xs font-medium text-slate-300">{label}</p>
                      <p className="text-[10px] text-slate-600 font-mono mt-0.5">{desc}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                        regStatus === null
                          ? 'text-slate-600 border-slate-800 bg-transparent'
                          : isOn
                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                            : isOff
                              ? 'text-slate-500 border-slate-700 bg-slate-800/50'
                              : 'text-slate-600 border-slate-800 bg-transparent'
                      }`}
                    >
                      {regStatus === null ? '...' : isOn ? 'Active' : isOff ? 'Default' : 'Unknown'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleApplyRegTweaks}
                disabled={isRegApplying || isApplying}
                className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
              >
                {isRegApplying ? 'Applying…' : 'Apply Gaming Tweaks'}
              </button>
              <button
                onClick={handleRevertRegTweaks}
                disabled={isRegApplying || isApplying}
                className="flex items-center gap-2 bg-[#060b19] hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-slate-200 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 border border-[#1e293b]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Revert to Default
              </button>
              <button
                onClick={() => getRegistryTweakStatus().then(setRegStatus)}
                disabled={isRegApplying || isApplying}
                className="ml-auto flex items-center gap-2 bg-[#060b19] hover:bg-slate-800 disabled:opacity-50 text-slate-500 hover:text-slate-300 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border border-[#1e293b]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            <p className="text-[10px] text-slate-600 leading-relaxed">
              Note: These changes take effect after restarting affected applications.
              A reboot may be required for some settings.
              Use &quot;Revert to Default&quot; to undo all changes.
            </p>
          </div>
        )}
      </div>

      {/* ── Timer Resolution ──────────────────────────────────────────────── */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 h-fit">
              <Cpu className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Timer Resolution</h4>
              <p className="text-xs text-slate-400 mt-1">Reduce Windows timer interval from 15.6ms to ~0.5ms for lower input latency in games. Requires reboot to take effect.</p>
            </div>
          </div>
          <span className={`text-xs font-medium px-3 py-1.5 rounded-full border flex-shrink-0 ${
            timerApplied
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : 'text-slate-500 border-slate-700 bg-slate-800/50'
          }`}>
            {timerApplied ? 'Applied' : 'Not Applied'}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => handleTimerResolution(true)}
            disabled={timerLoading || timerApplied}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
          >
            {timerLoading ? 'Applying…' : 'Apply Timer Tweak'}
          </button>
          <button
            onClick={() => handleTimerResolution(false)}
            disabled={timerLoading || !timerApplied}
            className="flex items-center gap-2 bg-[#060b19] hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-slate-200 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 border border-[#1e293b]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Revert
          </button>
        </div>

        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-amber-300">Requires reboot to take effect.</span>
        </div>
      </div>

      {/* ── Terminal Log ──────────────────────────────────────────────────── */}
      <div className="bg-[#020617] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col h-[280px]">
        <div className="bg-[#060b19] px-4 py-2.5 border-b border-[#1e293b] flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-mono text-slate-400">tcp_optimizer.exe</span>
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
              {isApplying && (
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
