// src/services/networkService.ts

// Fallback utility to check if running in Electron
const isElectron = () => typeof window !== 'undefined' && window.networkingApi !== undefined;

export interface NetworkAdapter {
  name: string;
  ipAddress: string;
  mtu: number;
  description: string;
}

export interface ProtocolResult {
  success: boolean;
  latency?: number;
  unsupported?: boolean;
}

export interface MultiProtocolPingResult {
  icmp: ProtocolResult;
  tcp: ProtocolResult;
  udp: ProtocolResult;
}

let cachedPowerShellMajor: number | null = null

const getPowerShellMajor = async () => {
  if (!isElectron()) {
    return 7
  }

  if (cachedPowerShellMajor !== null) {
    return cachedPowerShellMajor
  }

  const result = await window.networkingApi.executeCommand('powershell -Command "$PSVersionTable.PSVersion.Major"')
  const value = parseInt(result.stdout?.trim() ?? '', 10)
  cachedPowerShellMajor = Number.isNaN(value) ? null : value
  return cachedPowerShellMajor
}

export const getActiveAdapter = async (): Promise<NetworkAdapter> => {
  if (!isElectron()) {
    // Return mock data for browser preview
    return {
      name: 'Wi-Fi',
      ipAddress: '192.168.1.100',
      mtu: 1500,
      description: 'Intel(R) Wi-Fi 6 AX200 160MHz'
    };
  }

  // Get active interface using PowerShell
  const cmd = `powershell -Command "Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name, InterfaceDescription | ConvertTo-Json"`;
  const result = await window.networkingApi.executeCommand(cmd);
  
  if (result.error || !result.stdout) {
    throw new Error('Failed to get network adapter');
  }

  try {
    const adapters = JSON.parse(result.stdout);
    const adapter = Array.isArray(adapters) ? adapters[0] : adapters;
    const name = adapter.Name;
    const description = adapter.InterfaceDescription;

    // Get IP Address
    const ipCmd = `powershell -Command "(Get-NetIPAddress -InterfaceAlias '${name}' -AddressFamily IPv4).IPAddress"`;
    const ipResult = await window.networkingApi.executeCommand(ipCmd);
    const ipAddress = ipResult.stdout?.trim() || 'Unknown';

    // Get MTU
    const mtuCmd = `netsh interface ipv4 show subinterfaces "${name}"`;
    const mtuResult = await window.networkingApi.executeCommand(mtuCmd);
    let mtu = 1500;
    
    if (mtuResult.stdout) {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const mtuRegex = new RegExp(`(\\d+)\\s+\\d+\\s+\\d+\\s+\\d+\\s+.*${escapedName}`, 'i')
      const match = mtuResult.stdout.match(mtuRegex)
      if (match && match[1]) {
        mtu = parseInt(match[1], 10);
      }
    }

    return { name, ipAddress, mtu, description };
  } catch (e) {
    console.error('Parse error:', e);
    throw new Error('Failed to parse network adapter data');
  }
};

export const pingTest = async (target: string, packetSize: number = 32, preventFragmentation: boolean = false): Promise<{ success: boolean; latency: number; fragmented: boolean }> => {
  if (!isElectron()) {
    // Return mock data for browser preview
    await new Promise(r => setTimeout(r, 500));
    if (preventFragmentation && packetSize > 1472) {
      return { success: false, latency: 0, fragmented: true };
    }
    return { success: true, latency: Math.floor(Math.random() * 20) + 10, fragmented: false };
  }

  // Windows ping command
  // -n 1 (1 ping)
  // -w 1000 (1000ms timeout)
  // -l size (packet size)
  // -f (set Do Not Fragment flag in packet)
  const flags = `-n 1 -w 1000 -l ${packetSize} ${preventFragmentation ? '-f' : ''}`;
  const cmd = `ping ${flags} ${target}`;
  
  const result = await window.networkingApi.executeCommand(cmd);
  const output = result.stdout;

  if (!output) {
    return { success: false, latency: 0, fragmented: false };
  }

  // Check for fragmentation message
  if (output.includes('Packet needs to be fragmented but DF set') || output.includes('100% loss')) {
    return { success: false, latency: 0, fragmented: true };
  }

  // Parse latency
  const match = output.match(/time[=<](\d+)ms/i);
  if (match && match[1]) {
    return { success: true, latency: parseInt(match[1], 10), fragmented: false };
  }

  return { success: false, latency: 0, fragmented: false };
};

const runTestNetConnection = async (target: string, port: number, protocol: 'tcp' | 'udp') => {
  if (protocol === 'udp') {
    const psMajor = await getPowerShellMajor()
    if (!psMajor || psMajor < 7) {
      return { success: false, unsupported: true }
    }

    const cmd = `powershell -Command "Test-NetConnection -ComputerName '${target}' -UdpPort ${port} -WarningAction SilentlyContinue -InformationLevel Detailed | ConvertTo-Json"`
    const result = await window.networkingApi.executeCommand(cmd)
    if (!result.stdout) {
      return { success: false }
    }

    try {
      const parsed = JSON.parse(result.stdout)
      return { success: Boolean(parsed.UdpTestSucceeded) }
    } catch (e) {
      console.error('Parse error:', e)
      return { success: false }
    }
  }

  const cmd = `powershell -Command "Test-NetConnection -ComputerName '${target}' -Port ${port} -WarningAction SilentlyContinue -InformationLevel Detailed | ConvertTo-Json"`
  const result = await window.networkingApi.executeCommand(cmd)
  if (!result.stdout) {
    return { success: false }
  }

  try {
    const parsed = JSON.parse(result.stdout)
    return { success: Boolean(parsed.TcpTestSucceeded) }
  } catch (e) {
    console.error('Parse error:', e)
    return { success: false }
  }
}

export const pingMultiProtocol = async (target: string, port: number): Promise<MultiProtocolPingResult> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 300))
    return {
      icmp: { success: true, latency: Math.floor(Math.random() * 30) + 10 },
      tcp: { success: true, latency: Math.floor(Math.random() * 40) + 15 },
      udp: { success: Math.random() > 0.2 }
    }
  }

  const icmpResult = await pingTest(target)
  const tcpStart = Date.now()
  const tcpResult = await runTestNetConnection(target, port, 'tcp')
  const tcpLatency = tcpResult.success ? Date.now() - tcpStart : undefined

  const udpResult = await runTestNetConnection(target, port, 'udp')

  return {
    icmp: { success: icmpResult.success, latency: icmpResult.success ? icmpResult.latency : undefined },
    tcp: { success: tcpResult.success, latency: tcpLatency },
    udp: { success: udpResult.success, unsupported: udpResult.unsupported }
  }
}

export const applyMtu = async (adapterName: string, mtu: number): Promise<boolean> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 1000));
    return true;
  }

  // Requires admin privileges. We'll try it and if it fails, the user might need to run the app as Admin.
  const cmd = `netsh interface ipv4 set subinterface "${adapterName}" mtu=${mtu} store=persistent`;
  const result = await window.networkingApi.executeCommand(cmd);
  
  return !result.error && !result.stderr?.includes('requires elevation');
};

export const applyDns = async (adapterName: string, primary: string, secondary: string): Promise<boolean> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 1000));
    return true;
  }

  const cmdPrimary = `netsh interface ipv4 set dnsservers name="${adapterName}" static ${primary} primary`;
  const cmdSecondary = `netsh interface ipv4 add dnsservers name="${adapterName}" ${secondary} index=2`;
  
  const res1 = await window.networkingApi.executeCommand(cmdPrimary);
  const res2 = await window.networkingApi.executeCommand(cmdSecondary);
  
  return !res1.error && !res2.error && !res1.stderr?.includes('requires elevation');
};

export interface NetstatConnection {
  protocol: string;
  localAddress: string;
  foreignAddress: string;
  state: string;
  pid: number;
}

export const getNetstatConnections = async (): Promise<NetstatConnection[]> => {
  if (!isElectron()) {
    return [
      { protocol: 'TCP', localAddress: '192.168.1.100:443', foreignAddress: '104.21.34.12:443', state: 'ESTABLISHED', pid: 1234 },
      { protocol: 'UDP', localAddress: '0.0.0.0:53', foreignAddress: '*:*', state: '', pid: 890 }
    ];
  }

  const result = await window.networkingApi.executeCommand('netstat -ano');
  
  if (result.error || !result.stdout) {
    throw new Error('Failed to run netstat');
  }

  const lines = result.stdout.split('\n');
  const connections: NetstatConnection[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Proto') || trimmed.startsWith('Active Connections')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 4) {
      const protocol = parts[0];
      const localAddress = parts[1];
      const foreignAddress = parts[2];
      
      let state = '';
      let pidStr = '';

      if (protocol.startsWith('UDP')) {
        pidStr = parts[3];
      } else if (parts.length >= 5) {
        state = parts[3];
        pidStr = parts[4];
      }

      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid)) {
        connections.push({ protocol, localAddress, foreignAddress, state, pid });
      }
    }
  }

  return connections;
};

// ─── TCP/IP Optimizer ────────────────────────────────────────────────────────

export interface TcpSettings {
  autotuninglevel: string
  congestionprovider: string
  ecncapability: string
  timestamps: string
  initialrto: string
  rss: string
}

export const getTcpSettings = async (): Promise<TcpSettings> => {
  if (!isElectron()) {
    return {
      autotuninglevel: 'normal',
      congestionprovider: 'none',
      ecncapability: 'disabled',
      timestamps: 'disabled',
      initialrto: '3000',
      rss: 'enabled',
    }
  }
  const result = await window.networkingApi.executeCommand('netsh int tcp show global')
  const out = result.stdout ?? ''
  const extract = (label: string) => {
    const match = out.match(new RegExp(`${label}\\s*:\\s*(.+)`, 'i'))
    return match ? match[1].trim().toLowerCase() : 'unknown'
  }
  return {
    autotuninglevel: extract('Receive Window Auto-Tuning Level'),
    congestionprovider: extract('Add-On Congestion Control Provider'),
    ecncapability: extract('ECN Capability'),
    timestamps: extract('RFC 1323 Timestamps'),
    initialrto: extract('Initial RTO'),
    rss: extract('Receive-Side Scaling State'),
  }
}

// Returns array of log strings (each prefixed with [SUCCESS] or [ERROR])
export const applyTcpCommands = async (commands: string[]): Promise<string[]> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 800))
    return commands.map(cmd => `[SUCCESS] ${cmd}`)
  }
  const logs: string[] = []
  for (const cmd of commands) {
    const result = await window.networkingApi.executeCommand(cmd)
    if (result.error || result.stderr?.includes('requires elevation') || result.stderr?.includes('invalid')) {
      logs.push(`[ERROR] ${cmd}`)
      if (result.error) logs.push(`  ${result.error}`)
    } else {
      logs.push(`[SUCCESS] ${cmd}`)
    }
  }
  return logs
}

// Windows build number for version-aware TCP settings
// initialrto and timestamps require Windows 10 1809+ (Build 17763+)
export interface WindowsVersion {
  build: number
  version: string
}

// Get Windows build number
export const getWindowsVersion = async (): Promise<WindowsVersion> => {
  if (!isElectron()) {
    // Mock for browser - return a high version
    return { build: 26100, version: '10.0 (Mock)' }
  }
  try {
    const result = await window.networkingApi.executeCommand(
      'powershell -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\').CurrentBuild"'
    )
    const build = parseInt(result.stdout?.trim() || '0', 10)
    const versionResult = await window.networkingApi.executeCommand(
      'powershell -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\').ProductName"'
    )
    const version = versionResult.stdout?.trim() || 'Unknown'
    return { build, version }
  } catch (e) {
    console.error('Failed to get Windows version:', e)
    return { build: 0, version: 'Unknown' }
  }
}

// Minimum build for advanced TCP settings (timestamps, initialrto)
// Windows 10 1809 (October 2018 Update)
export const MIN_BUILD_FOR_ADVANCED = 17763

// Check if advanced TCP settings are supported
export const supportsAdvancedTcpSettings = async (): Promise<boolean> => {
  const { build } = await getWindowsVersion()
  return build >= MIN_BUILD_FOR_ADVANCED
}

// ─── Power Plan Manager ───────────────────────────────────────────────────────

export interface PowerPlan {
  guid: string
  name: string
  isActive: boolean
}

export const getPowerPlans = async (): Promise<PowerPlan[]> => {
  if (!isElectron()) {
    return [
      { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced', isActive: true },
      { guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', name: 'High performance', isActive: false },
      { guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: 'Power saver', isActive: false },
    ]
  }
  const result = await window.networkingApi.executeCommand('powercfg /list')
  const out = result.stdout ?? ''
  const plans: PowerPlan[] = []
  const lines = out.split('\n')
  for (const line of lines) {
    const match = line.match(/GUID:\s*([a-f0-9-]{36})\s+\(([^)]+)\)(\s*\*)?/i)
    if (match) {
      plans.push({
        guid: match[1].trim(),
        name: match[2].trim(),
        isActive: !!match[3],
      })
    }
  }
  return plans
}

export const setPowerPlan = async (guid: string): Promise<boolean> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 500))
    return true
  }
  const result = await window.networkingApi.executeCommand(`powercfg /setactive ${guid}`)
  return !result.error && !result.stderr?.includes('Error')
}

export const deletePowerPlan = async (guid: string): Promise<boolean> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 500))
    return true
  }
  const result = await window.networkingApi.executeCommand(`powercfg /delete ${guid}`)
  return !result.error && !result.stderr?.includes('Error')
}

// ─── DNS Utilities ────────────────────────────────────────────────────────────

export const flushDns = async (): Promise<boolean> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 400))
    return true
  }
  const result = await window.networkingApi.executeCommand('ipconfig /flushdns')
  return !result.error
}

export const getCurrentDns = async (adapterName: string): Promise<{ primary: string; secondary: string } | null> => {
  if (!isElectron()) {
    return { primary: '8.8.8.8', secondary: '8.8.4.4' }
  }
  const result = await window.networkingApi.executeCommand(
    `netsh interface ipv4 show dnsservers "${adapterName}"`
  )
  if (result.error || !result.stdout) return null
  const ips = [...result.stdout.matchAll(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g)].map(m => m[1])
  if (ips.length === 0) return null
  return { primary: ips[0], secondary: ips[1] ?? 'None' }
}

// ─── Registry Tweaks ──────────────────────────────────────────────────────────

export interface RegistryTweakStatus {
  tcpNoDelay: boolean | null       // HKLM\...\Tcpip\Parameters → TCPNoDelay = 1
  tcpAckFrequency: boolean | null  // HKLM\...\Tcpip\Parameters → TcpAckFrequency = 1
  networkThrottling: boolean | null // HKLM\...\SystemProfile → NetworkThrottlingIndex = 0xFFFFFFFF
  systemResponsiveness: boolean | null // HKLM\...\SystemProfile → SystemResponsiveness = 0
}

const REG_TCP = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters'
const REG_MMCSS = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'

const queryDword = async (key: string, value: string): Promise<number | null> => {
  const result = await window.networkingApi.executeCommand(
    `reg query "${key}" /v "${value}"`
  )
  if (result.error || !result.stdout) return null
  const match = result.stdout.match(/REG_DWORD\s+(0x[\da-fA-F]+|\d+)/)
  if (!match) return null
  return parseInt(match[1], 16)
}

export const getRegistryTweakStatus = async (): Promise<RegistryTweakStatus> => {
  if (!isElectron()) {
    return { tcpNoDelay: false, tcpAckFrequency: false, networkThrottling: false, systemResponsiveness: false }
  }
  const [noDelay, ackFreq, throttle, sysResp] = await Promise.all([
    queryDword(REG_TCP, 'TCPNoDelay'),
    queryDword(REG_TCP, 'TcpAckFrequency'),
    queryDword(REG_MMCSS, 'NetworkThrottlingIndex'),
    queryDword(REG_MMCSS, 'SystemResponsiveness'),
  ])
  return {
    tcpNoDelay: noDelay === null ? null : noDelay === 1,
    tcpAckFrequency: ackFreq === null ? null : ackFreq === 1,
    networkThrottling: throttle === null ? null : throttle === 0xFFFFFFFF,
    systemResponsiveness: sysResp === null ? null : sysResp === 0,
  }
}

export const applyRegistryTweaks = async (): Promise<string[]> => {
  const commands = [
    `reg add "${REG_TCP}" /v TCPNoDelay /t REG_DWORD /d 1 /f`,
    `reg add "${REG_TCP}" /v TcpAckFrequency /t REG_DWORD /d 1 /f`,
    `reg add "${REG_MMCSS}" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f`,
    `reg add "${REG_MMCSS}" /v SystemResponsiveness /t REG_DWORD /d 0 /f`,
  ]
  return applyTcpCommands(commands)
}

export const revertRegistryTweaks = async (): Promise<string[]> => {
  // Revert to safe Windows defaults by deleting the overrides
  // (Windows falls back to built-in defaults when the values are absent)
  const deleteCommands = [
    `reg delete "${REG_TCP}" /v TCPNoDelay /f`,
    `reg delete "${REG_TCP}" /v TcpAckFrequency /f`,
  ]
  const restoreCommands = [
    `reg add "${REG_MMCSS}" /v NetworkThrottlingIndex /t REG_DWORD /d 10 /f`,
    `reg add "${REG_MMCSS}" /v SystemResponsiveness /t REG_DWORD /d 20 /f`,
  ]
  return applyTcpCommands([...deleteCommands, ...restoreCommands])
}

// ─── Cloudflare WARP ──────────────────────────────────────────────────────────

export type WarpStatus = 'connected' | 'disconnected' | 'not-installed'

export interface WarpPop {
  iata: string
  city: string
  warpActive: boolean
}

export interface LatencyStats {
  avg: number
  min: number
  max: number
}

// ~120 Cloudflare PoP cities (IATA → city name)
const WARP_IATA_CITIES: Record<string, string> = {
  // North America
  ATL: 'Atlanta', BOS: 'Boston', BUF: 'Buffalo', CLT: 'Charlotte',
  CMH: 'Columbus', DEN: 'Denver', DFW: 'Dallas', DTW: 'Detroit',
  EWR: 'Newark', IAD: 'Washington DC', IAH: 'Houston', JFK: 'New York',
  LAX: 'Los Angeles', MCI: 'Kansas City', MCO: 'Orlando', MIA: 'Miami',
  MSP: 'Minneapolis', OAK: 'Oakland', ORD: 'Chicago', PDX: 'Portland',
  PHX: 'Phoenix', RIC: 'Richmond', SEA: 'Seattle', SFO: 'San Francisco',
  SJC: 'San Jose', TPA: 'Tampa',
  // Canada
  YUL: 'Montreal', YVR: 'Vancouver', YYZ: 'Toronto',
  // Latin America
  BOG: 'Bogota', EZE: 'Buenos Aires', GRU: 'São Paulo', LIM: 'Lima',
  MDE: 'Medellín', MEX: 'Mexico City', MVD: 'Montevideo', SCL: 'Santiago',
  // Europe
  AMS: 'Amsterdam', ARN: 'Stockholm', ATH: 'Athens', BCN: 'Barcelona',
  BER: 'Berlin', BRU: 'Brussels', BUD: 'Budapest', CDG: 'Paris',
  CPH: 'Copenhagen', DUB: 'Dublin', DUS: 'Dusseldorf', EDI: 'Edinburgh',
  FCO: 'Rome', FRA: 'Frankfurt', GVA: 'Geneva', HAM: 'Hamburg',
  HEL: 'Helsinki', IST: 'Istanbul', KBP: 'Kyiv', LHR: 'London',
  LIS: 'Lisbon', MAD: 'Madrid', MAN: 'Manchester', MRS: 'Marseille',
  MUC: 'Munich', MXP: 'Milan', OSL: 'Oslo', OTP: 'Bucharest',
  PRG: 'Prague', SOF: 'Sofia', TLV: 'Tel Aviv', VIE: 'Vienna',
  WAW: 'Warsaw', ZRH: 'Zurich',
  // Asia Pacific
  AKL: 'Auckland', BKK: 'Bangkok', BLR: 'Bangalore', BNE: 'Brisbane',
  BOM: 'Mumbai', CAN: 'Guangzhou', CGK: 'Jakarta', CMB: 'Colombo',
  CTU: 'Chengdu', DEL: 'New Delhi', HAN: 'Hanoi', HKG: 'Hong Kong',
  HND: 'Tokyo', HYD: 'Hyderabad', ICN: 'Seoul', KIX: 'Osaka',
  KUL: 'Kuala Lumpur', MAA: 'Chennai', MEL: 'Melbourne', MNL: 'Manila',
  NRT: 'Tokyo', PEK: 'Beijing', PER: 'Perth', PVG: 'Shanghai',
  RGN: 'Yangon', SGN: 'Ho Chi Minh City', SIN: 'Singapore', SYD: 'Sydney',
  TPE: 'Taipei', WUH: 'Wuhan',
  // Middle East & Africa
  AMM: 'Amman', BAH: 'Bahrain', CAI: 'Cairo', CPT: 'Cape Town',
  DOH: 'Doha', DXB: 'Dubai', JNB: 'Johannesburg', KWI: 'Kuwait City',
  LOS: 'Lagos', MCT: 'Muscat', NBO: 'Nairobi', RUH: 'Riyadh',
}

// Helper: try warp-cli from PATH first, fall back to known Windows install path
const runWarpCli = async (args: string): Promise<{ stdout?: string; stderr?: string; error?: string }> => {
  const r1 = await window.networkingApi.executeCommand(`warp-cli ${args}`)
  const out1 = ((r1.stdout ?? '') + (r1.stderr ?? '')).toLowerCase()
  // Fall back to the known Cloudflare WARP install path if not in PATH
  if (r1.error || out1.includes('not recognized') || out1.includes('cannot find')) {
    return window.networkingApi.executeCommand(
      `"C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe" ${args}`
    )
  }
  return r1
}

export const getWarpStatus = async (): Promise<WarpStatus> => {
  if (!isElectron()) return 'disconnected'
  const result = await runWarpCli('status')
  const out = ((result.stdout ?? '') + (result.stderr ?? '')).toLowerCase()
  if (!out || (result.error && out.includes('not recognized'))) return 'not-installed'
  // warp-cli output: "Status update: Connected" / "Status update: Disconnected"
  if (out.includes('connected') && !out.includes('disconnected')) return 'connected'
  if (out.includes('disconnected')) return 'disconnected'
  return 'not-installed'
}

export const setWarpConnection = async (connect: boolean): Promise<boolean> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 1200))
    return true
  }
  const result = await runWarpCli(connect ? 'connect' : 'disconnect')
  return !result.error
}

export const getWarpPop = async (): Promise<WarpPop | null> => {
  if (!isElectron()) {
    return { iata: 'SIN', city: 'Singapore', warpActive: false }
  }
  try {
    const result = await window.networkingApi.executeCommand(
      `powershell -Command "(Invoke-WebRequest -Uri 'https://cloudflare.com/cdn-cgi/trace' -UseBasicParsing).Content"`
    )
    if (result.error || !result.stdout) return null
    const coloMatch = result.stdout.match(/colo=([A-Z]{3,4})/)
    const warpMatch = result.stdout.match(/warp=(\w+)/)
    if (!coloMatch) return null
    const iata = coloMatch[1]
    const city = WARP_IATA_CITIES[iata] ?? iata
    const warpActive = warpMatch ? warpMatch[1] === 'on' : false
    return { iata, city, warpActive }
  } catch {
    return null
  }
}

export const measureLatency = async (
  target: string,
  samples = 5
): Promise<LatencyStats | null> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 800))
    const base = Math.floor(Math.random() * 30) + 10
    return { avg: base + 2, min: base, max: base + 8 }
  }
  const latencies: number[] = []
  for (let i = 0; i < samples; i++) {
    const res = await pingTest(target, 32, false)
    if (res.success && res.latency > 0) latencies.push(res.latency)
  }
  if (latencies.length === 0) return null
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
  const min = Math.min(...latencies)
  const max = Math.max(...latencies)
  return { avg, min, max }
}

// ─── Network Repair ───────────────────────────────────────────────────────────

export const repairNetwork = async (): Promise<{ success: boolean; log: string }> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 2000));
    return {
      success: true,
      log: 'Mock network repair completed successfully.\nFlushed DNS.\nReleased IP.\nRenewed IP.\nReset Winsock.'
    };
  }

  let fullLog = '';
  let success = true;

  const commands = [
    'ipconfig /flushdns',
    'ipconfig /release',
    'ipconfig /renew',
    'netsh winsock reset'
  ];

  for (const cmd of commands) {
    try {
      const result = await window.networkingApi.executeCommand(cmd);
      fullLog += `> ${cmd}\n${result.stdout || result.stderr || ''}\n\n`;
      if (result.error) {
        success = false;
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      fullLog += `> ${cmd}\nFailed to execute: ${errorMessage}\n\n`;
      success = false;
    }
  }

  return { success, log: fullLog.trim() };
};

// ─── Ping Monitor ─────────────────────────────────────────────────────────────

export interface PingSample {
  timestamp: number   // Date.now()
  latency: number | null  // null = timeout
  target: string
}

export const singlePing = async (target: string): Promise<number | null> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 200))
    return Math.floor(Math.random() * 40) + 10
  }
  const result = await window.networkingApi.executeCommand(`ping -n 1 -w 2000 ${target}`)
  const out = result.stdout ?? ''
  if (out.includes('100% loss') || out.includes('timed out') || !out) return null
  const match = out.match(/time[=<](\d+)ms/i)
  return match ? parseInt(match[1], 10) : null
}

// ─── Bandwidth Monitor ────────────────────────────────────────────────────────

export interface AdapterStats {
  name: string
  rxBytes: number
  txBytes: number
  timestamp: number
}

export interface BandwidthSample {
  timestamp: number
  rxMbps: number
  txMbps: number
  adapterName: string
}

export const getAdapterStats = async (): Promise<AdapterStats[]> => {
  if (!isElectron()) {
    return [
      { name: 'Wi-Fi', rxBytes: Math.floor(Math.random() * 1e9), txBytes: Math.floor(Math.random() * 5e8), timestamp: Date.now() },
    ]
  }
  const cmd = `powershell -Command "Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json"`
  const result = await window.networkingApi.executeCommand(cmd)
  if (result.error || !result.stdout) return []
  try {
    const raw = JSON.parse(result.stdout)
    const arr = Array.isArray(raw) ? raw : [raw]
    return arr.map((item: { Name: string; ReceivedBytes: number; SentBytes: number }) => ({
      name: item.Name,
      rxBytes: item.ReceivedBytes,
      txBytes: item.SentBytes,
      timestamp: Date.now()
    }))
  } catch {
    return []
  }
}

export interface ProcessConnection {
  process: string
  pid: number
  localAddress: string
  foreignAddress: string
  state: string
}

export const getProcessConnections = async (): Promise<ProcessConnection[]> => {
  if (!isElectron()) {
    return [
      { process: 'chrome.exe', pid: 1234, localAddress: '192.168.1.100:52431', foreignAddress: '142.250.80.46:443', state: 'ESTABLISHED' },
      { process: 'discord.exe', pid: 5678, localAddress: '192.168.1.100:52432', foreignAddress: '162.159.135.234:443', state: 'ESTABLISHED' },
      { process: 'steam.exe', pid: 9012, localAddress: '192.168.1.100:27015', foreignAddress: '162.254.197.35:27015', state: 'ESTABLISHED' },
    ]
  }
  // netstat -b requires admin, may fail gracefully
  const result = await window.networkingApi.executeCommand('netstat -b -n')
  const out = result.stdout ?? ''
  if (!out) return []

  const connections: ProcessConnection[] = []
  const lines = out.split('\n')
  let currentProcess = ''
  const currentPid = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Process name line: [process.exe]
    const processMatch = line.match(/^\[(.+\.exe)\]/i)
    if (processMatch) {
      currentProcess = processMatch[1]
      continue
    }
    // PID from previous netstat line
    const connMatch = line.match(/^(TCP|UDP)\s+([\d.:]+)\s+([\d.*:]+)\s+(\w+)?\s*(\d+)?$/i)
    if (connMatch && currentProcess) {
      connections.push({
        process: currentProcess,
        pid: currentPid,
        localAddress: connMatch[2],
        foreignAddress: connMatch[3],
        state: connMatch[4] ?? ''
      })
    }
  }
  return connections.slice(0, 50) // Limit to 50
}

// ─── WiFi Analyzer ────────────────────────────────────────────────────────────

export interface WifiNetwork {
  ssid: string
  bssid: string
  signal: number        // 0–100
  channel: number
  band: '2.4 GHz' | '5 GHz' | '6 GHz' | 'Unknown'
  authentication: string
  radioType: string
  isConnected: boolean
}

export const getWifiNetworks = async (): Promise<WifiNetwork[]> => {
  if (!isElectron()) {
    return [
      { ssid: 'HomeNetwork', bssid: 'AA:BB:CC:DD:EE:01', signal: 85, channel: 6, band: '2.4 GHz', authentication: 'WPA2-Personal', radioType: '802.11n', isConnected: true },
      { ssid: 'NeighborWifi', bssid: 'AA:BB:CC:DD:EE:02', signal: 42, channel: 11, band: '2.4 GHz', authentication: 'WPA2-Personal', radioType: '802.11n', isConnected: false },
      { ssid: 'HomeNetwork', bssid: 'AA:BB:CC:DD:EE:03', signal: 78, channel: 36, band: '5 GHz', authentication: 'WPA2-Personal', radioType: '802.11ac', isConnected: false },
      { ssid: 'CoffeeShop', bssid: 'AA:BB:CC:DD:EE:04', signal: 60, channel: 1, band: '2.4 GHz', authentication: 'Open', radioType: '802.11n', isConnected: false },
    ]
  }

  // Get connected BSSID
  const ifaceResult = await window.networkingApi.executeCommand('netsh wlan show interfaces')
  const connectedBssid = (ifaceResult.stdout ?? '').match(/BSSID\s*:\s*([\w:]+)/i)?.[1]?.toUpperCase() ?? ''

  const result = await window.networkingApi.executeCommand('netsh wlan show networks mode=bssid')
  const out = result.stdout ?? ''
  const networks: WifiNetwork[] = []

  // Split by SSID blocks
  const blocks = out.split(/(?=^SSID \d+)/m)
  for (const block of blocks) {
    if (!block.trim() || !block.includes('SSID')) continue
    const ssidMatch = block.match(/^SSID \d+\s*:\s*(.+)/m)
    if (!ssidMatch) continue
    const ssid = ssidMatch[1].trim()

    // Find all BSSID sub-entries within this block
    const bssidBlocks = block.split(/(?=^\s+BSSID \d+)/m)
    for (const bblock of bssidBlocks) {
      const bssidMatch = bblock.match(/BSSID \d+\s*:\s*([\w:]+)/i)
      if (!bssidMatch) continue
      const bssid = bssidMatch[1].trim().toUpperCase()

      const signalMatch = bblock.match(/Signal\s*:\s*(\d+)%/i)
      const signal = signalMatch ? parseInt(signalMatch[1], 10) : 0

      const radioMatch = bblock.match(/Radio type\s*:\s*(.+)/i)
      const radioType = radioMatch ? radioMatch[1].trim() : 'Unknown'

      const channelMatch = bblock.match(/Channel\s*:\s*(\d+)/i)
      const channel = channelMatch ? parseInt(channelMatch[1], 10) : 0

      // Determine band from channel
      let band: WifiNetwork['band'] = 'Unknown'
      if (channel >= 1 && channel <= 14) band = '2.4 GHz'
      else if (channel >= 36 && channel <= 177) band = '5 GHz'
      else if (channel >= 1 && radioType.includes('802.11ax')) band = '6 GHz'

      const authMatch = block.match(/Authentication\s*:\s*(.+)/i)
      const authentication = authMatch ? authMatch[1].trim() : 'Unknown'

      networks.push({
        ssid, bssid, signal, channel, band, authentication, radioType,
        isConnected: bssid === connectedBssid
      })
    }
  }

  return networks
}

// ─── Traceroute ───────────────────────────────────────────────────────────────

export interface TraceHop {
  hop: number
  ip: string | null       // null = * (no reply)
  latency: number | null  // ms, null = timeout
  hostname: string | null
  // Geo (populated after API call)
  lat: number | null
  lon: number | null
  city: string | null
  country: string | null
  isp: string | null
  asn: string | null
}

// ─── Traceroute mock routes ──────────────────────────────────────────────────
// Each route simulates a different real-world path from Sri Lanka (origin).
// We pick a route deterministically based on the target string so the same
// target always yields the same path, but different targets yield different paths.

type MockHop = Omit<TraceHop, 'hop'>

const MOCK_ROUTES: MockHop[][] = [
  // Route 0 — Sri Lanka → Singapore → US (Google / 8.8.8.8)
  [
    { ip: '192.168.1.1',   latency: 1,  hostname: 'router.local',        lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Dialog Axiata', asn: 'AS45489' },
    { ip: '10.10.0.1',     latency: 4,  hostname: null,                   lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Dialog Axiata', asn: 'AS45489' },
    { ip: '175.157.32.1',  latency: 12, hostname: null,                   lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Dialog Axiata', asn: 'AS45489' },
    { ip: '203.116.0.1',   latency: 28, hostname: null,                   lat: 1.3521,  lon: 103.8198,  city: 'Singapore',     country: 'SG', isp: 'Singtel',       asn: 'AS9506'  },
    { ip: '72.14.215.165', latency: 52, hostname: null,                   lat: 37.4056, lon: -122.0775, city: 'Mountain View', country: 'US', isp: 'Google',        asn: 'AS15169' },
    { ip: '8.8.8.8',       latency: 58, hostname: 'dns.google',           lat: 37.4056, lon: -122.0775, city: 'Mountain View', country: 'US', isp: 'Google',        asn: 'AS15169' },
  ],
  // Route 1 — Sri Lanka → India → Frankfurt → Cloudflare (1.1.1.1)
  [
    { ip: '192.168.1.1',   latency: 1,  hostname: 'router.local',        lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Sri Lanka Telecom', asn: 'AS9329' },
    { ip: '10.0.0.1',      latency: 3,  hostname: null,                   lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Sri Lanka Telecom', asn: 'AS9329' },
    { ip: '116.206.64.1',  latency: 15, hostname: null,                   lat: 19.0760, lon: 72.8777,   city: 'Mumbai',        country: 'IN', isp: 'Tata Communications', asn: 'AS6453' },
    { ip: '80.231.90.1',   latency: 90, hostname: null,                   lat: 50.1109, lon: 8.6821,    city: 'Frankfurt',     country: 'DE', isp: 'Tata Communications', asn: 'AS6453' },
    { ip: '162.158.0.1',   latency: 98, hostname: null,                   lat: 50.1109, lon: 8.6821,    city: 'Frankfurt',     country: 'DE', isp: 'Cloudflare',     asn: 'AS13335' },
    { ip: '1.1.1.1',       latency: 105,hostname: 'one.one.one.one',      lat: 50.1109, lon: 8.6821,    city: 'Frankfurt',     country: 'DE', isp: 'Cloudflare',     asn: 'AS13335' },
  ],
  // Route 2 — Sri Lanka → Singapore → Tokyo → US (Amazon / AWS)
  [
    { ip: '192.168.0.1',   latency: 1,  hostname: 'router.local',        lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Mobitel',        asn: 'AS38182' },
    { ip: '10.1.1.1',      latency: 6,  hostname: null,                   lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Mobitel',        asn: 'AS38182' },
    { ip: null,            latency: null,hostname: null,                   lat: null,    lon: null,       city: null,            country: null, isp: null,             asn: null      }, // hop 3 timeout
    { ip: '203.116.1.5',   latency: 30, hostname: null,                   lat: 1.3521,  lon: 103.8198,  city: 'Singapore',     country: 'SG', isp: 'Singtel',        asn: 'AS9506'  },
    { ip: '210.251.0.1',   latency: 62, hostname: null,                   lat: 35.6762, lon: 139.6503,  city: 'Tokyo',         country: 'JP', isp: 'NTT',            asn: 'AS2914'  },
    { ip: '52.95.0.1',     latency: 88, hostname: null,                   lat: 47.6062, lon: -122.3321, city: 'Seattle',       country: 'US', isp: 'Amazon',         asn: 'AS16509' },
    { ip: '54.239.0.1',    latency: 95, hostname: 's3.amazonaws.com',     lat: 47.6062, lon: -122.3321, city: 'Seattle',       country: 'US', isp: 'Amazon',         asn: 'AS16509' },
  ],
  // Route 3 — Sri Lanka → India → London → EU target
  [
    { ip: '192.168.1.1',   latency: 1,  hostname: 'router.local',        lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Dialog Axiata',  asn: 'AS45489' },
    { ip: '175.157.32.5',  latency: 5,  hostname: null,                   lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Dialog Axiata',  asn: 'AS45489' },
    { ip: '116.206.68.1',  latency: 18, hostname: null,                   lat: 13.0827, lon: 80.2707,   city: 'Chennai',       country: 'IN', isp: 'Bharti Airtel',  asn: 'AS9498'  },
    { ip: '213.46.0.1',    latency: 95, hostname: null,                   lat: 51.5074, lon: -0.1278,   city: 'London',        country: 'GB', isp: 'BT',             asn: 'AS2856'  },
    { ip: '5.57.80.1',     latency: 108,hostname: null,                   lat: 48.8566, lon: 2.3522,    city: 'Paris',         country: 'FR', isp: 'OVH',            asn: 'AS16276' },
    { ip: '51.77.0.1',     latency: 115,hostname: null,                   lat: 48.8566, lon: 2.3522,    city: 'Paris',         country: 'FR', isp: 'OVH',            asn: 'AS16276' },
  ],
  // Route 4 — short local-ish route (private target / LAN)
  [
    { ip: '192.168.1.1',   latency: 1,  hostname: 'router.local',        lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Dialog Axiata',  asn: 'AS45489' },
    { ip: '192.168.1.254', latency: 2,  hostname: 'gateway.local',       lat: 6.9271,  lon: 79.8612,   city: 'Colombo',       country: 'LK', isp: 'Dialog Axiata',  asn: 'AS45489' },
  ],
]

// Pick a route index 0-3 based on the target string (deterministic, no external call)
const pickMockRoute = (target: string): MockHop[] => {
  // Private / LAN targets → short route
  if (
    /^192\.168\./.test(target) ||
    /^10\./.test(target) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(target) ||
    target === 'localhost' ||
    target === '127.0.0.1'
  ) return MOCK_ROUTES[4]

  // Hash the target string to pick deterministically among routes 0-3
  let hash = 0
  for (let i = 0; i < target.length; i++) hash = (hash * 31 + target.charCodeAt(i)) >>> 0
  return MOCK_ROUTES[hash % 4]
}

export const runTraceroute = async (target: string): Promise<TraceHop[]> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 1500))
    const route = pickMockRoute(target)
    return route.map((h, i) => ({ ...h, hop: i + 1 }))
  }
  // Run tracert
  const result = await window.networkingApi.executeCommand(`tracert -d -h 30 -w 2000 ${target}`)
  const out = result.stdout ?? ''
  const hops: TraceHop[] = []

  for (const line of out.split('\n')) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Timeout line: "  2     *        *        *     Request timed out."
    // Also handle partial timeouts where some probes reply and some don't
    const timeoutMatch = trimmedLine.match(/^(\d+)\s+(?:\*\s+){3}/)
    if (timeoutMatch) {
      hops.push({ hop: parseInt(timeoutMatch[1], 10), ip: null, latency: null, hostname: null, lat: null, lon: null, city: null, country: null, isp: null, asn: null })
      continue
    }
    // Hop line examples:
    //   "  1     1 ms     1 ms     1 ms  192.168.1.1"
    //   "  2    <1 ms    <1 ms    <1 ms  10.0.0.1"
    //   "  3     *       15 ms    14 ms  203.116.0.1"   (partial timeout)
    //   "  4    <1 ms     *        1 ms  172.16.0.1"
    // Strategy: find all ms values on the line (including <1), take the last one, and grab the trailing IP
    const hopNumMatch = trimmedLine.match(/^(\d+)\s+/)
    // Improved IP regex: match IP after latency values, handle trailing spaces/characters more flexibly
    const ipMatch = trimmedLine.match(/([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})(?:\s+|$)/)
    const msValues = [...trimmedLine.matchAll(/<?\s*(\d+)\s*ms/gi)]

    console.log('[traceroute] Parsing line:', trimmedLine)
    console.log('[traceroute] hopNumMatch:', hopNumMatch?.[1], 'ipMatch:', ipMatch?.[1], 'msValues:', msValues.map(m => m[1]))

    if (hopNumMatch && ipMatch && msValues.length > 0) {
      // Use the median ms value (middle probe) for best accuracy; fall back to last
      const latencies = msValues.map(m => parseInt(m[1], 10))
      const latency = latencies[Math.floor(latencies.length / 2)]
      const hopNum = parseInt(hopNumMatch[1], 10)
      const ip = ipMatch[1]
      console.log('[traceroute] Extracted hop:', hopNum, 'IP:', ip, 'latency:', latency)
      hops.push({
        hop: hopNum,
        ip,
        latency,
        hostname: null,
        lat: null, lon: null, city: null, country: null, isp: null, asn: null
      })
    }
  }

  // Geolocate all non-private IPs in batch via dedicated IPC handler (Node https → ip-api.com)
  const publicHops = hops.filter(h => h.ip && !isPrivateIp(h.ip))
  console.log('[traceroute] Public hops to geolocate:', publicHops.map(h => h.ip))
  if (publicHops.length > 0) {
    try {
      const ips = publicHops.map(h => h.ip!)
      console.log('[traceroute] Requesting geolocation for IPs:', ips)
      const geoData = await window.networkingApi.geolocateIps(ips) as Array<{
        status: string; lat: number; lon: number; city: string; country: string; isp: string; as: string
      }>
      console.log('[traceroute] Received geoData:', geoData)
      publicHops.forEach((hop, i) => {
        const geo = geoData[i]
        if (geo?.status === 'success') {
          hop.lat = geo.lat
          hop.lon = geo.lon
          hop.city = geo.city
          hop.country = geo.country
          hop.isp = geo.isp
          hop.asn = geo.as
          console.log('[traceroute] Applied geo to hop', hop.hop, ':', geo.city, geo.country)
        } else if (hop.ip && FALLBACK_GEOLOCATION[hop.ip]) {
          // API returned non-success for this IP — use fallback if available
          const fb = FALLBACK_GEOLOCATION[hop.ip]
          hop.lat = fb.lat; hop.lon = fb.lon; hop.city = fb.city
          hop.country = fb.country; hop.isp = fb.isp; hop.asn = fb.asn
          console.log('[traceroute] Using fallback geo for hop', hop.hop, ':', fb.city, fb.country)
        }
      })
    } catch (err) {
      // ip-api.com request failed — apply fallback data for any known IPs
      console.warn('[traceroute] Geolocation API failed, using fallback data where available:', err)
      publicHops.forEach(hop => {
        if (hop.ip && FALLBACK_GEOLOCATION[hop.ip]) {
          const fb = FALLBACK_GEOLOCATION[hop.ip]
          hop.lat = fb.lat; hop.lon = fb.lon; hop.city = fb.city
          hop.country = fb.country; hop.isp = fb.isp; hop.asn = fb.asn
        }
      })
    }
  }

  return hops
}

// Fallback geolocation data for well-known public IPs (used when ip-api.com is unavailable)
const FALLBACK_GEOLOCATION: Record<string, { lat: number; lon: number; city: string; country: string; isp: string; asn: string }> = {
  // Google DNS
  '8.8.8.8':    { lat: 37.4056, lon: -122.0775, city: 'Mountain View', country: 'United States', isp: 'Google LLC', asn: 'AS15169 Google LLC' },
  '8.8.4.4':    { lat: 37.4056, lon: -122.0775, city: 'Mountain View', country: 'United States', isp: 'Google LLC', asn: 'AS15169 Google LLC' },
  // Cloudflare DNS
  '1.1.1.1':    { lat: -33.8688, lon: 151.2093, city: 'Sydney',         country: 'Australia',     isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '1.0.0.1':    { lat: -33.8688, lon: 151.2093, city: 'Sydney',         country: 'Australia',     isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  // OpenDNS (Cisco)
  '208.67.222.222': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Cisco OpenDNS', asn: 'AS36692 Cisco OpenDNS' },
  '208.67.220.220': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Cisco OpenDNS', asn: 'AS36692 Cisco OpenDNS' },
  // Quad9
  '9.9.9.9':    { lat: 48.1351, lon: 11.5820,  city: 'Munich',         country: 'Germany',       isp: 'Quad9', asn: 'AS19281 Quad9' },
  '149.112.112.112': { lat: 48.1351, lon: 11.5820, city: 'Munich',     country: 'Germany',       isp: 'Quad9', asn: 'AS19281 Quad9' },
  // Level3 / Lumen (common backbone)
  '4.2.2.1':    { lat: 39.7684, lon: -86.1581, city: 'Indianapolis',   country: 'United States', isp: 'Lumen Technologies', asn: 'AS3356 Lumen Technologies' },
  '4.2.2.2':    { lat: 39.7684, lon: -86.1581, city: 'Indianapolis',   country: 'United States', isp: 'Lumen Technologies', asn: 'AS3356 Lumen Technologies' },
  // Cloudflare anycast (1.1.1.3 malware blocking)
  '1.1.1.2':    { lat: -33.8688, lon: 151.2093, city: 'Sydney',        country: 'Australia',     isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '1.1.1.3':    { lat: -33.8688, lon: 151.2093, city: 'Sydney',        country: 'Australia',     isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  // AdGuard DNS
  '94.140.14.14':  { lat: 55.7558, lon: 37.6173, city: 'Moscow',       country: 'Russia',        isp: 'Adguard Software Ltd', asn: 'AS61697 Adguard Software Ltd' },
  '94.140.15.15':  { lat: 55.7558, lon: 37.6173, city: 'Moscow',       country: 'Russia',        isp: 'Adguard Software Ltd', asn: 'AS61697 Adguard Software Ltd' },

  // AWS (Amazon Web Services) - US East (Virginia)
  '3.80.0.0':      { lat: 39.0437, lon: -77.4875, city: 'Ashburn',     country: 'United States', isp: 'Amazon.com Inc', asn: 'AS14618 Amazon.com Inc' },
  '52.0.0.0':      { lat: 39.0437, lon: -77.4875, city: 'Ashburn',     country: 'United States', isp: 'Amazon.com Inc', asn: 'AS14618 Amazon.com Inc' },
  '54.0.0.0':      { lat: 39.0437, lon: -77.4875, city: 'Ashburn',     country: 'United States', isp: 'Amazon.com Inc', asn: 'AS14618 Amazon.com Inc' },

  // AWS - US West (Oregon)
  '52.10.0.0':     { lat: 45.8052, lon: -119.7006, city: 'Boardman',   country: 'United States', isp: 'Amazon.com Inc', asn: 'AS16509 Amazon.com Inc' },
  '54.148.0.0':    { lat: 45.8052, lon: -119.7006, city: 'Boardman',   country: 'United States', isp: 'Amazon.com Inc', asn: 'AS16509 Amazon.com Inc' },

  // AWS - Europe (Ireland)
  '52.48.0.0':     { lat: 53.3498, lon: -6.2603, city: 'Dublin',      country: 'Ireland',       isp: 'Amazon.com Inc', asn: 'AS16509 Amazon.com Inc' },
  '54.72.0.0':     { lat: 53.3498, lon: -6.2603, city: 'Dublin',      country: 'Ireland',       isp: 'Amazon.com Inc', asn: 'AS16509 Amazon.com Inc' },

  // AWS - Asia Pacific (Tokyo)
  '52.68.0.0':     { lat: 35.6762, lon: 139.6503, city: 'Tokyo',      country: 'Japan',         isp: 'Amazon.com Inc', asn: 'AS16509 Amazon.com Inc' },
  '54.168.0.0':    { lat: 35.6762, lon: 139.6503, city: 'Tokyo',      country: 'Japan',         isp: 'Amazon.com Inc', asn: 'AS16509 Amazon.com Inc' },

  // Azure (Microsoft Cloud) - US East
  '13.64.0.0':     { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Microsoft Azure', asn: 'AS8075 Microsoft Corporation' },
  '13.68.0.0':     { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Microsoft Azure', asn: 'AS8075 Microsoft Corporation' },

  // Azure - US West
  '13.84.0.0':     { lat: 34.0522, lon: -118.2437, city: 'Los Angeles', country: 'United States', isp: 'Microsoft Azure', asn: 'AS8075 Microsoft Corporation' },
  '40.64.0.0':     { lat: 34.0522, lon: -118.2437, city: 'Los Angeles', country: 'United States', isp: 'Microsoft Azure', asn: 'AS8075 Microsoft Corporation' },

  // Azure - Europe (Netherlands)
  '13.80.0.0':     { lat: 52.3676, lon: 4.9041, city: 'Amsterdam',   country: 'Netherlands',   isp: 'Microsoft Azure', asn: 'AS8075 Microsoft Corporation' },

  // Google Cloud - US Central
  '34.64.0.0':     { lat: 41.8781, lon: -87.6298, city: 'Chicago',    country: 'United States', isp: 'Google LLC', asn: 'AS15169 Google LLC' },
  '34.65.0.0':     { lat: 41.8781, lon: -87.6298, city: 'Chicago',    country: 'United States', isp: 'Google LLC', asn: 'AS15169 Google LLC' },

  // Google Cloud - Europe (Belgium)
  '34.141.0.0':    { lat: 50.8503, lon: 4.3517, city: 'Brussels',     country: 'Belgium',       isp: 'Google LLC', asn: 'AS15169 Google LLC' },

  // Google Cloud - Asia Pacific (Singapore)
  '34.92.0.0':     { lat: 1.3521, lon: 103.8198, city: 'Singapore',   country: 'Singapore',     isp: 'Google LLC', asn: 'AS15169 Google LLC' },

  // Cloudflare Edge - US East
  '172.64.0.0':    { lat: 38.9072, lon: -77.0369, city: 'Washington',  country: 'United States', isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '172.65.0.0':    { lat: 38.9072, lon: -77.0369, city: 'Washington',  country: 'United States', isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '172.66.0.0':    { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },

  // Cloudflare Edge - Europe
  '172.64.32.0':   { lat: 51.5074, lon: -0.1278, city: 'London',      country: 'United Kingdom', isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '172.65.48.0':   { lat: 48.8566, lon: 2.3522, city: 'Paris',        country: 'France',        isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '172.66.80.0':   { lat: 52.5200, lon: 13.4050, city: 'Berlin',      country: 'Germany',       isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },

  // Cloudflare Edge - Asia Pacific
  '172.64.64.0':   { lat: 35.6762, lon: 139.6503, city: 'Tokyo',      country: 'Japan',         isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '172.64.96.0':   { lat: 1.3521, lon: 103.8198, city: 'Singapore',   country: 'Singapore',     isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '172.64.160.0':  { lat: -33.8688, lon: 151.2093, city: 'Sydney',     country: 'Australia',     isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },

  // CloudFront (AWS CDN)
  '52.84.0.0':     { lat: 39.0437, lon: -77.4875, city: 'Ashburn',     country: 'United States', isp: 'Amazon CloudFront', asn: 'AS16509 Amazon.com Inc' },
  '54.192.0.0':    { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Amazon CloudFront', asn: 'AS16509 Amazon.com Inc' },
  '13.32.0.0':     { lat: 47.6062, lon: -122.3321, city: 'Seattle',    country: 'United States', isp: 'Amazon CloudFront', asn: 'AS16509 Amazon.com Inc' },

  // Akamai CDN
  '23.32.0.0':     { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Akamai Technologies', asn: 'AS20940 Akamai Technologies' },
  '23.200.0.0':    { lat: 34.0522, lon: -118.2437, city: 'Los Angeles', country: 'United States', isp: 'Akamai Technologies', asn: 'AS20940 Akamai Technologies' },
  '184.24.0.0':    { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Akamai Technologies', asn: 'AS20940 Akamai Technologies' },

  // Steam (Valve Corporation)
  '23.32.216.0':   { lat: 47.6062, lon: -122.3321, city: 'Seattle',    country: 'United States', isp: 'Valve Corporation', asn: 'AS32590 Valve Corporation' },
  '23.33.112.0':   { lat: 47.6062, lon: -122.3321, city: 'Seattle',    country: 'United States', isp: 'Valve Corporation', asn: 'AS32590 Valve Corporation' },

  // Riot Games
  '104.160.131.3': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Riot Games Inc', asn: 'AS55067 Riot Games Inc' },
  '104.160.141.3': { lat: 34.0522, lon: -118.2437, city: 'Los Angeles', country: 'United States', isp: 'Riot Games Inc', asn: 'AS55067 Riot Games Inc' },

  // Epic Games
  '52.3.192.0':    { lat: 38.9072, lon: -77.0369, city: 'Washington',  country: 'United States', isp: 'Epic Games Inc', asn: 'AS16591 Epic Games Inc' },
  '52.5.192.0':    { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Epic Games Inc', asn: 'AS16591 Epic Games Inc' },

  // Blizzard Entertainment
  '24.105.0.0':    { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Blizzard Entertainment', asn: 'AS57976 Blizzard Entertainment' },
  '24.105.32.0':   { lat: 33.7490, lon: -84.3880, city: 'Atlanta',     country: 'United States', isp: 'Blizzard Entertainment', asn: 'AS57976 Blizzard Entertainment' },

  // PlayStation Network (Sony)
  '72.247.0.0':    { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States',isp: 'Sony Interactive Entertainment', asn: 'AS22577 Sony Interactive Entertainment' },
  '72.247.176.0':  { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States',isp: 'Sony Interactive Entertainment', asn: 'AS22577 Sony Interactive Entertainment' },

  // Xbox (Microsoft)
  '65.52.0.0':     { lat: 47.6062, lon: -122.3321, city: 'Seattle',    country: 'United States', isp: 'Microsoft Xbox', asn: 'AS8075 Microsoft Corporation' },

  // NVIDIA
  '52.3.64.0':     { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'NVIDIA Corporation', asn: 'AS36217 NVIDIA Corporation' },

  // Cloudflare WARP
  '162.159.192.0': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
  '162.159.193.0': { lat: 51.5074, lon: -0.1278, city: 'London',       country: 'United Kingdom', isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },

  // Google Public DNS (Secondary)
  '8.8.2.2':       { lat: 37.4056, lon: -122.0775, city: 'Mountain View', country: 'United States', isp: 'Google LLC', asn: 'AS15169 Google LLC' },

  // Comodo Secure DNS
  '8.26.56.26':    { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Comodo Secure DNS', asn: 'AS200082 Comodo CA Ltd' },
  '8.20.247.20':   { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Comodo Secure DNS', asn: 'AS200082 Comodo CA Ltd' },

  // CleanBrowsing (Security DNS)
  '185.228.168.9': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'CleanBrowsing LLC', asn: 'AS396856 CleanBrowsing LLC' },
  '185.228.169.9': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'CleanBrowsing LLC', asn: 'AS396856 CleanBrowsing LLC' },

  // Verisign DNS
  '64.6.64.6':     { lat: 38.9072, lon: -77.0369, city: 'Washington',  country: 'United States', isp: 'Verisign Inc', asn: 'AS262730 Verisign Inc' },
  '64.6.65.6':     { lat: 38.9072, lon: -77.0369, city: 'Washington',  country: 'United States', isp: 'Verisign Inc', asn: 'AS262730 Verisign Inc' },

  // OpenNIC
  '172.98.193.10': { lat: 34.0522, lon: -118.2437, city: 'Los Angeles', country: 'United States', isp: 'OpenNIC', asn: 'AS54113 OpenNIC' },
  '172.98.195.10': { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'OpenNIC', asn: 'AS54113 OpenNIC' },

  // Dyn (Internet Intelligence)
  '216.21.0.0':    { lat: 43.6532, lon: -79.3832, city: 'Toronto',     country: 'Canada',        isp: 'Dyn Inc', asn: 'AS33517 Dyn Inc' },

  // Hurricane Electric (Backbone)
  '72.52.0.0':     { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Hurricane Electric', asn: 'AS6939 Hurricane Electric' },
  '64.62.0.0':     { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Hurricane Electric', asn: 'AS6939 Hurricane Electric' },

  // NTT America (Backbone)
  '128.241.0.0':   { lat: 33.7490, lon: -84.3880, city: 'Atlanta',     country: 'United States', isp: 'NTT America', asn: 'AS2914 NTT America' },

  // Telia Carrier
  '80.239.0.0':    { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Telia Company', asn: 'AS1299 Telia Company' },

  // Cogent Communications
  '38.0.0.0':      { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Cogent Communications', asn: 'AS174 Cogent Communications' },

  // Spotify
  '35.186.224.25': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Spotify USA', asn: 'AS36351 Spotify USA' },

  // Netflix
   '23.246.0.0':   { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Netflix Inc', asn: 'AS2906 Netflix Inc' },
   '34.248.0.0':   { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Netflix Inc', asn: 'AS2906 Netflix Inc' },

  // Discord
   '162.249.72.0': { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Discord Inc', asn: 'AS396982 Discord Inc' },

  // Twitch
   '23.32.48.0':   { lat: 37.7749, lon: -122.4194, city: 'San Francisco', country: 'United States', isp: 'Twitch Interactive', asn: 'AS46489 Twitch Interactive' },
   '23.32.80.0':   { lat: 40.7128, lon: -74.0060, city: 'New York',    country: 'United States', isp: 'Twitch Interactive', asn: 'AS46489 Twitch Interactive' },

  // YouTube
   '172.217.0.0':  { lat: 37.4056, lon: -122.0775, city: 'Mountain View', country: 'United States', isp: 'Google LLC', asn: 'AS15169 Google LLC' },

  // Cloudflare Load Balancer
   '203.0.113.0':  { lat: 35.6762, lon: 139.6503, city: 'Tokyo',      country: 'Japan',         isp: 'Cloudflare, Inc.', asn: 'AS13335 Cloudflare, Inc.' },
}

const isPrivateIp = (ip: string): boolean => {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('127.') ||
    ip.startsWith('169.254.') ||        // link-local (APIPA)
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) || // CGNAT 100.64-100.127
    ip === '::1' ||                     // IPv6 loopback
    ip.toLowerCase().startsWith('fe80:') || // IPv6 link-local
    ip.toLowerCase().startsWith('fc') || // IPv6 ULA fc00::/7
    ip.toLowerCase().startsWith('fd')    // IPv6 ULA fd00::/7
  )
}

// ─── LAN Scanner ─────────────────────────────────────────────────────────────

export interface LanDevice {
  ip: string
  mac: string | null
  vendor: string | null
  hostname: string | null
  isOwn: boolean
  status: 'online' | 'arp-only' | 'scanning'
}

// Top-200 OUI vendor prefixes (XX:XX:XX format, uppercase)
const OUI_TABLE: Record<string, string> = {
  '00:00:0C': 'Cisco', '00:01:42': 'Cisco', '00:04:96': 'Extreme Networks',
  '00:05:5D': 'D-Link', '00:08:74': 'Dell', '00:0A:E4': 'Cisco',
  '00:0C:29': 'VMware', '00:0D:3A': 'Microsoft', '00:0F:FE': 'Samsung',
  '00:11:32': 'Synology', '00:13:46': 'Intel', '00:14:22': 'Dell',
  '00:15:5D': 'Microsoft (Hyper-V)', '00:16:3E': 'Xen', '00:17:88': 'Philips Hue',
  '00:18:8B': 'Dell', '00:1A:11': 'Google', '00:1B:21': 'Intel',
  '00:1C:14': 'VMware', '00:1D:60': 'Apple', '00:1E:52': 'Apple',
  '00:1F:5B': 'Apple', '00:21:6A': 'Apple', '00:22:41': 'Actiontec',
  '00:23:12': 'Apple', '00:24:36': 'Apple', '00:25:00': 'Apple',
  '00:25:9C': 'Cisco', '00:26:B9': 'Dell', '00:50:56': 'VMware',
  '00:50:F2': 'Microsoft', '00:60:08': 'Compaq', '00:A0:C9': 'Intel',
  '00:BB:3A': 'Amazon', '08:00:20': 'Sun Microsystems',
  '10:02:B5': 'Intel', '18:03:73': 'Apple', '18:65:90': 'Apple',
  '1C:1B:0D': 'Apple', '20:C9:D0': 'Apple', '24:A0:74': 'Apple',
  '28:6A:B8': 'Apple', '2C:F0:A2': 'Apple', '34:36:3B': 'Apple',
  '38:CA:DA': 'Apple', '3C:15:C2': 'Apple', '3C:D0:F8': 'Apple',
  '40:6C:8F': 'Apple', '40:A6:D9': 'Apple', '44:00:10': 'Apple',
  '44:FB:42': 'Apple', '48:60:BC': 'Apple', '4C:57:CA': 'TP-Link',
  '4C:8D:79': 'Samsung', '50:18:4C': 'Apple', '54:26:96': 'Apple',
  '54:72:4F': 'Apple', '58:B0:35': 'Apple', '5C:96:9D': 'Apple',
  '60:30:D4': 'Apple', '60:45:CB': 'Apple', '64:76:BA': 'Apple',
  '64:A3:CB': 'Apple', '68:09:27': 'Apple', '6C:40:08': 'Apple',
  '70:56:81': 'Apple', '70:73:CB': 'Apple', '74:E1:B6': 'Apple',
  '78:31:C1': 'Apple', '7C:D1:C3': 'Apple', '80:92:9F': 'Apple',
  '84:29:99': 'Apple', '88:64:40': 'Apple', '88:E9:FE': 'Apple',
  '8C:7B:9D': 'Apple', '8C:85:90': 'Apple', '90:84:0D': 'Apple',
  '90:B0:ED': 'Apple', '98:01:A7': 'Apple', '9C:F3:87': 'Apple',
  'A4:5E:60': 'Apple', 'A8:66:7F': 'Apple', 'AC:87:A3': 'Apple',
  'B0:34:95': 'Apple', 'B4:F0:AB': 'Apple', 'B8:78:2E': 'Apple',
  'BC:92:6B': 'Apple', 'C0:CE:CD': 'Apple', 'C4:B3:01': 'Apple',
  'C8:69:CD': 'Apple', 'CC:25:EF': 'Apple', 'D0:23:DB': 'Apple',
  'D4:DC:CD': 'Apple', 'D8:1D:72': 'Apple', 'DC:2B:61': 'Apple',
  'E0:AC:CB': 'Apple', 'E4:CE:8F': 'Apple', 'E8:04:0B': 'Apple',
  'EC:85:2F': 'Apple', 'F0:B4:79': 'Apple', 'F4:1B:A1': 'Apple',
  'F4:F1:5A': 'Apple', 'F8:E0:79': 'Apple', 'FC:E9:98': 'Apple',
  '00:1A:79': 'Netgear', '00:26:F2': 'Netgear', '20:4E:7F': 'Netgear',
  '2C:B0:5D': 'Netgear', '84:1B:5E': 'Netgear', 'A0:04:60': 'Netgear',
  'C0:3F:0E': 'Netgear', 'C4:04:15': 'Netgear', 'E4:F4:C6': 'Netgear',
  '00:18:E7': 'TP-Link', '00:23:CD': 'TP-Link', '14:CC:20': 'TP-Link',
  '18:A6:F7': 'TP-Link', '1C:87:2C': 'TP-Link', '28:2C:02': 'TP-Link',
  '50:C7:BF': 'TP-Link', '54:AF:97': 'TP-Link', '64:70:02': 'TP-Link',
  '6C:5A:B5': 'TP-Link', '90:F6:52': 'TP-Link', 'A4:2B:B0': 'TP-Link',
  'AC:84:C6': 'TP-Link', 'B0:BE:76': 'TP-Link', 'C4:E9:84': 'TP-Link',
  'E8:DE:27': 'TP-Link', 'F4:EC:38': 'TP-Link',
  '00:18:01': 'ASUS', '04:92:26': 'ASUS', '08:62:66': 'ASUS',
  '10:7B:44': 'ASUS', '14:DA:E9': 'ASUS', '1C:87:74': 'ASUS',
  '2C:4D:54': 'ASUS', '30:85:A9': 'ASUS', '38:2C:4A': 'ASUS',
  '40:16:7E': 'ASUS', '50:46:5D': 'ASUS', '54:BF:64': 'ASUS',
  '60:45:BD': 'ASUS', '6C:FD:B9': 'ASUS', '74:D0:2B': 'ASUS',
  '78:24:AF': 'ASUS', '7C:10:C9': 'ASUS', '90:E6:BA': 'ASUS',
  'A8:5E:45': 'ASUS', 'AC:22:0B': 'ASUS', 'BC:AE:C5': 'ASUS',
  'C8:60:00': 'ASUS', 'D0:17:C2': 'ASUS', 'D8:50:E6': 'ASUS',
  'E0:3F:49': 'ASUS', 'F0:2F:74': 'ASUS', 'FC:34:97': 'ASUS',
  '00:16:44': 'Ralink Technology', '00:24:A5': 'Ralink Technology',
  '00:16:EB': 'Intel Corporate', '00:21:5D': 'Intel Corporate',
  '3C:A9:F4': 'Intel Corporate', '40:E2:30': 'Intel Corporate',
  '6C:88:14': 'Intel Corporate', '8C:EC:4B': 'Intel Corporate',
  '98:EF:D8': 'Intel Corporate', 'A4:34:D9': 'Intel Corporate',
  'AC:7B:A1': 'Intel Corporate', 'B0:6E:BF': 'Intel Corporate',
  'C4:8E:8F': 'Intel Corporate', 'D0:7E:35': 'Intel Corporate',
  'F4:96:34': 'Intel Corporate',
  '00:17:C8': 'Samsung Electronics', '00:21:D2': 'Samsung Electronics',
  '00:23:39': 'Samsung Electronics', '08:FC:88': 'Samsung Electronics',
  '10:1D:C0': 'Samsung Electronics', '14:A9:E3': 'Samsung Electronics',
  '2C:AE:2B': 'Samsung Electronics', '34:BE:00': 'Samsung Electronics',
  '40:0E:85': 'Samsung Electronics', '50:A4:C8': 'Samsung Electronics',
  '54:92:BE': 'Samsung Electronics', '60:D0:A9': 'Samsung Electronics',
  '78:1F:DB': 'Samsung Electronics', '84:55:A5': 'Samsung Electronics',
  '9C:3A:AF': 'Samsung Electronics', 'A0:75:91': 'Samsung Electronics',
  'B4:07:F9': 'Samsung Electronics', 'CC:07:AB': 'Samsung Electronics',
  'D0:22:BE': 'Samsung Electronics', 'F4:7B:5E': 'Samsung Electronics',
  '00:17:FA': 'Xbox (Microsoft)', '00:22:48': 'Xbox (Microsoft)',
  '28:18:78': 'Amazon', '40:B4:CD': 'Amazon', '44:65:0D': 'Amazon',
  '68:37:E9': 'Amazon', '74:C2:46': 'Amazon', 'A0:02:DC': 'Amazon',
  'AC:63:BE': 'Amazon', 'B4:7C:9C': 'Amazon', 'FC:65:DE': 'Amazon',
  '00:0E:8F': 'Sercomm', '00:19:70': 'Cisco-Linksys',
  '00:1C:10': 'Cisco-Linksys', '00:21:29': 'Cisco-Linksys',
  '00:0F:66': 'Cisco', '00:11:BB': 'Cisco',
  'B0:7D:64': 'Huawei', 'C8:51:95': 'Huawei', '28:6E:D4': 'Huawei',
  '4C:54:99': 'Huawei', '94:77:2B': 'Huawei', 'D4:6E:5C': 'Huawei',
}

const lookupVendor = (mac: string): string | null => {
  if (!mac) return null
  const prefix = mac.toUpperCase().replace(/-/g, ':').substring(0, 8)
  return OUI_TABLE[prefix] ?? null
}

export const scanLan = async (
  onProgress: (scanned: number, total: number, newDevice?: LanDevice) => void
): Promise<LanDevice[]> => {
  if (!isElectron()) {
    // Mock: return 5 devices
    const mocks: LanDevice[] = [
      { ip: '192.168.1.1', mac: 'C4:E9:84:AA:BB:CC', vendor: 'TP-Link', hostname: 'router.local', isOwn: false, status: 'online' },
      { ip: '192.168.1.100', mac: 'A4:5E:60:11:22:33', vendor: 'Apple', hostname: 'MacBook-Pro.local', isOwn: true, status: 'online' },
      { ip: '192.168.1.101', mac: '00:0C:29:44:55:66', vendor: 'VMware', hostname: null, isOwn: false, status: 'online' },
      { ip: '192.168.1.150', mac: null, vendor: null, hostname: null, isOwn: false, status: 'arp-only' },
      { ip: '192.168.1.200', mac: '50:A4:C8:77:88:99', vendor: 'Samsung Electronics', hostname: 'Galaxy-S23', isOwn: false, status: 'online' },
    ]
    for (let i = 0; i < mocks.length; i++) {
      await new Promise(r => setTimeout(r, 300))
      onProgress(i + 1, 5, mocks[i])
    }
    return mocks
  }

  // Step 1: Get own IP + gateway
  const ipconfigResult = await window.networkingApi.executeCommand('ipconfig')
  const ipconfigOut = ipconfigResult.stdout ?? ''
  // Extract active adapter's IPv4 address
  const ipMatch = ipconfigOut.match(/IPv4 Address[^:]*:\s*([\d.]+)/i)
  const ownIp = ipMatch?.[1] ?? ''
  // Derive /24 base from own IP
  const ipParts = ownIp.split('.')
  if (ipParts.length !== 4) return []
  const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`

  // Step 2: Initial ARP cache
  const arpResult = await window.networkingApi.executeCommand('arp -a')
  const arpOut = arpResult.stdout ?? ''
  const arpCache = new Map<string, string>() // ip → mac
  for (const line of arpOut.split('\n')) {
    const match = line.match(/([\d.]+)\s+([\w:-]+)\s+/i)
    if (match && match[2] !== 'ff-ff-ff-ff-ff-ff') {
      const mac = match[2].toUpperCase().replace(/-/g, ':')
      arpCache.set(match[1], mac)
    }
  }

  const total = 254
  const devices: LanDevice[] = []

  // Step 3: Ping sweep + discover
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`
    const pingResult = await window.networkingApi.executeCommand(`ping -n 1 -w 500 ${ip}`)
    const pingOut = pingResult.stdout ?? ''
    const responded = !pingOut.includes('100% loss') && !pingOut.includes('timed out') && pingOut.includes('bytes')

    if (responded || arpCache.has(ip)) {
      // Try to get MAC from ARP (ping populates ARP cache)
      const arpResult2 = await window.networkingApi.executeCommand(`arp -a ${ip}`)
      const arpOut2 = arpResult2.stdout ?? ''
      const macMatch = arpOut2.match(/([\w:-]{17})/i)
      const mac = macMatch ? macMatch[1].toUpperCase().replace(/-/g, ':') : (arpCache.get(ip) ?? null)

      const vendor = mac ? lookupVendor(mac) : null

      // Hostname lookup (best effort, fast timeout)
      let hostname: string | null = null
      const nsResult = await window.networkingApi.executeCommand(`nslookup ${ip}`)
      const nsOut = nsResult.stdout ?? ''
      const nameMatch = nsOut.match(/Name:\s+(.+)/i)
      if (nameMatch) hostname = nameMatch[1].trim()

      const device: LanDevice = {
        ip,
        mac,
        vendor,
        hostname,
        isOwn: ip === ownIp,
        status: responded ? 'online' : 'arp-only'
      }
      devices.push(device)
      onProgress(i, total, device)
    } else {
      onProgress(i, total)
    }
  }

  return devices
}

// ─── QoS Manager ─────────────────────────────────────────────────────────────

export interface QosPolicy {
  name: string
  appPathName: string
  dscp: number
  tcpPort: number
  isEnabled: boolean
}

export const getQosPolicies = async (): Promise<QosPolicy[]> => {
  if (!isElectron()) {
    return [
      { name: 'Gaming-High', appPathName: 'csgo.exe', dscp: 46, tcpPort: 0, isEnabled: true },
      { name: 'Discord-Voice', appPathName: 'discord.exe', dscp: 46, tcpPort: 443, isEnabled: true },
      { name: 'Steam-Download', appPathName: 'steam.exe', dscp: 8, tcpPort: 27015, isEnabled: false },
    ]
  }
  // Use ForEach-Object to build safe plain objects — avoids ConvertTo-Json choking on complex PS types
  const result = await window.networkingApi.executeCommand(
    `powershell -Command "$p = @(Get-NetQosPolicy -ErrorAction SilentlyContinue); if ($p.Count -gt 0) { $p | ForEach-Object { [PSCustomObject]@{N=$_.Name;A=$_.AppPathNameMatchCondition;D=[int]$_.DSCPAction;P=[int]($_.IPPortMatchCondition)} } | ConvertTo-Json -Compress } else { Write-Output '[]' }"`
  )
  const text = (result.stdout ?? '').trim()
  if (!text || text === '[]' || text === 'null') return []
  try {
    const raw: unknown = JSON.parse(text)
    const arr = Array.isArray(raw) ? raw : [raw]
    return (arr as Array<{ N: string; A: string; D: number; P: number }>).map(p => ({
      name: p.N ?? '',
      appPathName: p.A ?? '',
      dscp: Number(p.D) || 0,
      tcpPort: Number(p.P) || 0,
      isEnabled: true,
    }))
  } catch {
    return []
  }
}

export const addQosPolicy = async (name: string, appPath: string, dscp: number, port: number): Promise<string> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 500))
    return `[SUCCESS] Mock QoS policy '${name}' added`
  }
  const portParam = port > 0 ? `-IPPort ${port}` : ''
  const cmd = `powershell -Command "try { New-NetQosPolicy -Name '${name}' -AppPathNameMatchCondition '${appPath}' -DSCPAction ${dscp} ${portParam} -Confirm:$false -ErrorAction Stop | Out-Null; Write-Output 'OK' } catch { Write-Error $_.Exception.Message }"`
  const result = await window.networkingApi.executeCommand(cmd)
  if (result.error) return `[ERROR] ${result.error}`
  if (result.stderr && result.stderr.trim()) return `[ERROR] ${result.stderr.trim()}`
  return `[SUCCESS] QoS policy '${name}' created (DSCP ${dscp})`
}

export const deleteQosPolicy = async (name: string): Promise<string> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 300))
    return `[SUCCESS] Mock QoS policy '${name}' deleted`
  }
  const cmd = `powershell -Command "try { Remove-NetQosPolicy -Name '${name}' -Confirm:$false -ErrorAction Stop; Write-Output 'OK' } catch { Write-Error $_.Exception.Message }"`
  const result = await window.networkingApi.executeCommand(cmd)
  if (result.error) return `[ERROR] ${result.error}`
  if (result.stderr && result.stderr.trim()) return `[ERROR] ${result.stderr.trim()}`
  return `[SUCCESS] QoS policy '${name}' deleted`
}

// ─── App Firewall ─────────────────────────────────────────────────────────────

export interface FirewallRule {
  name: string
  appPath: string
  direction: 'In' | 'Out'
  action: 'Block' | 'Allow'
  enabled: boolean
}

export const getFirewallRules = async (): Promise<FirewallRule[]> => {
  if (!isElectron()) {
    return [
      { name: 'Block-BitTorrent', appPath: 'C:\\Users\\User\\AppData\\Roaming\\BitTorrent\\BitTorrent.exe', direction: 'Out', action: 'Block', enabled: true },
      { name: 'Block-uTorrent',   appPath: 'C:\\Users\\User\\AppData\\Roaming\\uTorrent\\uTorrent.exe',    direction: 'Out', action: 'Block', enabled: true },
      { name: 'Block-qBittorrent',appPath: 'C:\\Program Files\\qBittorrent\\qbittorrent.exe',              direction: 'Out', action: 'Block', enabled: false },
    ]
  }
  // Get outbound block rules created by this app (named "Uptimizer-Block-*")
  const result = await window.networkingApi.executeCommand(
    `powershell -Command "Get-NetFirewallRule -DisplayName 'Uptimizer-Block-*' | ForEach-Object { $r = $_; $prog = ($r | Get-NetFirewallApplicationFilter).Program; [PSCustomObject]@{ Name=$r.DisplayName; AppPath=$prog; Direction=$r.Direction.ToString(); Action=$r.Action.ToString(); Enabled=$r.Enabled } } | ConvertTo-Json -Depth 3"`
  )
  if (result.error || !result.stdout) return []
  try {
    const raw = JSON.parse(result.stdout)
    const arr = Array.isArray(raw) ? raw : [raw]
    return arr.map((r: { Name: string; AppPath: string; Direction: string; Action: string; Enabled: boolean }) => ({
      name: r.Name ?? '',
      appPath: r.AppPath ?? '',
      direction: r.Direction === 'Inbound' ? 'In' as const : 'Out' as const,
      action: r.Action === 'Allow' ? 'Allow' as const : 'Block' as const,
      enabled: r.Enabled === true
    }))
  } catch {
    return []
  }
}

export const addFirewallBlockRule = async (appPath: string): Promise<string> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 500))
    const name = appPath.split('\\').pop() ?? appPath
    return `[SUCCESS] Mock firewall rule added for ${name}`
  }
  const appName = appPath.split('\\').pop() ?? appPath
  const ruleName = `Uptimizer-Block-${appName}`
  const cmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=out action=block program="${appPath}" enable=yes`
  const result = await window.networkingApi.executeCommand(cmd)
  if (result.error) return `[ERROR] ${result.error}`
  if (result.stdout?.includes('Ok.') || result.stdout?.includes('ok')) return `[SUCCESS] Blocked outbound traffic for ${appName}`
  return `[WARN] Command ran but output unclear: ${result.stdout?.trim()}`
}

export const deleteFirewallRule = async (ruleName: string): Promise<string> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 300))
    return `[SUCCESS] Mock rule '${ruleName}' deleted`
  }
  const cmd = `netsh advfirewall firewall delete rule name="${ruleName}"`
  const result = await window.networkingApi.executeCommand(cmd)
  if (result.error) return `[ERROR] ${result.error}`
  return `[SUCCESS] Rule '${ruleName}' deleted`
}

export const setFirewallRuleEnabled = async (ruleName: string, enabled: boolean): Promise<string> => {
  if (!isElectron()) {
    await new Promise(r => setTimeout(r, 200))
    return `[SUCCESS] Mock rule '${ruleName}' ${enabled ? 'enabled' : 'disabled'}`
  }
  const enableStr = enabled ? 'yes' : 'no'
  const cmd = `netsh advfirewall firewall set rule name="${ruleName}" new enable=${enableStr}`
  const result = await window.networkingApi.executeCommand(cmd)
  if (result.error) return `[ERROR] ${result.error}`
  return `[SUCCESS] Rule '${ruleName}' ${enabled ? 'enabled' : 'disabled'}`
}
