import { useState, useEffect } from 'react'
import { Activity, Shield, Globe, Settings, Wifi, Terminal, Play, Zap, CheckCircle2, Server, Wrench, Gamepad2, SlidersHorizontal, Gauge, Sliders, Cpu } from 'lucide-react'
import * as networkService from './services/networkService'
import DashboardTab from './tabs/DashboardTab'
import GamePingTab from './tabs/GamePingTab'
import NetstatTab from './tabs/NetstatTab'
import RepairTab from './tabs/RepairTab'
import SettingsTab from './tabs/SettingsTab'
import TcpOptimizerTab from './tabs/TcpOptimizerTab'
import PowerPlanTab from './tabs/PowerPlanTab'
import DnsTab from './tabs/DnsTab'
import SpeedtestTab from './tabs/SpeedtestTab'
import WarpTab from './tabs/WarpTab'
import PingMonitorTab from './tabs/PingMonitorTab'
import WifiAnalyzerTab from './tabs/WifiAnalyzerTab'
import LanScannerTab from './tabs/LanScannerTab'
import QosTab from './tabs/QosTab'
import AppFirewallTab from './tabs/AppFirewallTab'
import BandwidthTab from './tabs/BandwidthTab'
import TracerouteTab from './tabs/TracerouteTab'

// Define IPC interface to avoid TS errors
declare global {
  interface Window {
    ipcRenderer: {
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
    networkingApi: {
      executeCommand: (command: string) => Promise<{stdout?: string, stderr?: string, error?: string}>;
      geolocateIps: (ips: string[]) => Promise<unknown[]>;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('optimizer')

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'optimizer', label: 'MTU Optimizer', icon: Shield },
    { id: 'dns', label: 'DNS Benchmark', icon: Globe },
    { id: 'speedtest', label: 'Speed Test', icon: Zap },
    { id: 'warp', label: 'WARP', icon: Shield },
    { id: 'netstat', label: 'Netstat', icon: Server },
    { id: 'game-ping', label: 'Game Ping', icon: Gamepad2 },
    { id: 'tcp-optimizer', label: 'TCP Optimizer', icon: SlidersHorizontal },
    { id: 'power-plan', label: 'Power Plan', icon: Gauge },
    { id: 'repair', label: 'Network Repair', icon: Wrench },
    { id: 'ping-monitor', label: 'Ping Monitor', icon: Activity },
    { id: 'wifi', label: 'WiFi Analyzer', icon: Wifi },
    { id: 'lan-scanner', label: 'LAN Scanner', icon: Server },
    { id: 'qos', label: 'QoS Rules', icon: Sliders },
    { id: 'firewall', label: 'App Firewall', icon: Shield },
    { id: 'bandwidth', label: 'Bandwidth', icon: Cpu },
    { id: 'traceroute', label: 'Traceroute', icon: Globe },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="flex h-screen w-screen bg-[#020617] text-slate-200 overflow-hidden font-sans border-t border-[#1e293b]">
      {/* Title Bar Drag Region overlay */}
      <div 
        className="fixed top-0 left-0 w-full h-8 z-50 flex items-center justify-between" 
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* The right side (window controls) will be naturally pushed here by Electron's native overlay */}
      </div>
      
      {/* Sidebar Navigation */}
      <nav className="w-64 flex-shrink-0 bg-[#060b19] border-r border-[#1e293b] flex flex-col pt-10 relative z-40">
        <div className="px-6 mb-8 flex items-center gap-3">
          <div className="bg-sky-500/10 p-2 rounded-lg border border-sky-500/20">
            <Wifi className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Uptimizer</h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Network Toolkit</p>
          </div>
        </div>

        <div className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium outline-none ${
                  isActive 
                    ? 'bg-sky-500/10 text-sky-400' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                {item.label}
              </button>
            )
          })}
        </div>
        
        <div className="p-4 border-t border-[#1e293b] text-xs text-slate-600 font-medium">
          v1.0.0
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-[#020617] relative z-10 overflow-y-auto">
        <div className="p-8 pt-10 max-w-6xl w-full mx-auto">
          {/* Header */}
          <header className="mb-8">
            <h2 className="text-2xl font-semibold text-white">
              {navItems.find(i => i.id === activeTab)?.label}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {activeTab === 'dashboard' && 'Real-time overview of your network adapters and performance.'}
              {activeTab === 'optimizer' && 'Automatically detect and set the lowest latency MTU for your connection.'}
              {activeTab === 'dns' && 'Extensive benchmark against global DNS resolvers to find your optimal route.'}
              {activeTab === 'speedtest' && 'Measure your real-world download, upload, ping and packet loss.'}
              {activeTab === 'warp' && 'Route your traffic through Cloudflare\'s global edge network via WireGuard.'}
              {activeTab === 'netstat' && 'View all active network connections and listening ports on your system.'}
              {activeTab === 'game-ping' && 'Compare latency to regional game servers with multi-protocol checks.'}
              {activeTab === 'tcp-optimizer' && 'Tune TCP/IP stack parameters with one-click profiles. Backup and restore your original settings.'}
              {activeTab === 'power-plan' && 'Switch Windows power plans to optimize performance or battery life. Save and restore your original plan.'}
              {activeTab === 'repair' && 'One-click diagnostics and repair for common network issues.'}
              {activeTab === 'ping-monitor' && 'Continuously monitor latency to any host with spike alerts and history.'}
              {activeTab === 'wifi' && 'Scan nearby WiFi networks, detect channel congestion and evil twin attacks.'}
              {activeTab === 'lan-scanner' && 'Discover all devices on your local network with vendor and hostname lookup.'}
              {activeTab === 'qos' && 'Apply DSCP traffic shaping policies to prioritize gaming and video applications.'}
              {activeTab === 'firewall' && 'Block specific applications from accessing the internet via Windows Firewall.'}
              {activeTab === 'bandwidth' && 'Monitor adapter-level bandwidth usage and active process connections.'}
              {activeTab === 'traceroute' && 'Trace the route to any host and visualize hops on an interactive world map.'}
              {activeTab === 'settings' && 'Configure Uptimizer application settings and preferences.'}
            </p>
          </header>

          {/* Tab Content rendering */}
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'optimizer' && <OptimizerTab />}
          {activeTab === 'dns' && <DnsTab />}
          {activeTab === 'speedtest' && <SpeedtestTab />}
          {activeTab === 'warp' && <WarpTab />}
          {activeTab === 'netstat' && <NetstatTab />}
          {activeTab === 'game-ping' && <GamePingTab />}
          {activeTab === 'tcp-optimizer' && <TcpOptimizerTab />}
          {activeTab === 'power-plan' && <PowerPlanTab />}
          {activeTab === 'repair' && <RepairTab />}
          {activeTab === 'ping-monitor' && <PingMonitorTab />}
          {activeTab === 'wifi' && <WifiAnalyzerTab />}
          {activeTab === 'lan-scanner' && <LanScannerTab />}
          {activeTab === 'qos' && <QosTab />}
          {activeTab === 'firewall' && <AppFirewallTab />}
          {activeTab === 'bandwidth' && <BandwidthTab />}
          {activeTab === 'traceroute' && <TracerouteTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  )
}

function OptimizerTab() {
  const [status, setStatus] = useState<'idle' | 'testing' | 'done'>('idle')
  const [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [bestMtu, setBestMtu] = useState<number | null>(null)
  const [adapter, setAdapter] = useState<networkService.NetworkAdapter | null>(null)

  useEffect(() => {
    networkService.getActiveAdapter().then(setAdapter).catch(console.error)
  }, [])
  
  // Real scanning process using networkService
  useEffect(() => {
    if (status !== 'testing' || !adapter) return;
    
    let isMounted = true;
    
    const runTest = async () => {
      setLogs(['Initiating ping fragmentation test...', 'Target: 8.8.8.8 (Google DNS)']);
      setProgress(10);
      
      let currentPacketSize = 1472; // Start with standard MTU payload (1500 - 28)
      let foundOptimal = false;
      
      while (currentPacketSize > 1300 && !foundOptimal && isMounted) {
        setLogs(prev => [...prev, `[TEST] Pinging 8.8.8.8 with ${currentPacketSize} bytes (DF set)...`]);
        
        const result = await networkService.pingTest('8.8.8.8', currentPacketSize, true);
        
        if (result.fragmented || !result.success) {
          setLogs(prev => [...prev, `[FAILED] Packet size ${currentPacketSize} needs to be fragmented.`]);
          
          // Drop size depending on how far we are
          if (currentPacketSize > 1460) {
            currentPacketSize -= 4; // Check in steps of 4 first
          } else {
            currentPacketSize -= 10;
          }
          setProgress(p => Math.min(p + 5, 90));
        } else {
          // Success!
          foundOptimal = true;
          const optimalMtu = currentPacketSize + 28; // Add IP(20) and ICMP(8) headers
          
          setLogs(prev => [
            ...prev, 
            `[SUCCESS] Packet size ${currentPacketSize} transmitted without fragmentation.`,
            `[CALCULATION] Optimal Payload (${currentPacketSize}) + IP Header (28) = Optimal MTU (${optimalMtu})`,
            'Scan complete.'
          ]);
          setBestMtu(optimalMtu);
          setProgress(100);
          setTimeout(() => {
            if (isMounted) setStatus('done');
          }, 1000);
        }
      }
      
      if (!foundOptimal && isMounted) {
        setLogs(prev => [...prev, '[ERROR] Could not find optimal MTU within reasonable limits.']);
        setStatus('idle');
      }
    };

    runTest();
    return () => { isMounted = false; };
  }, [status, adapter]);

  const handleApply = async () => {
    if (!adapter || !bestMtu) return;
    setLogs(prev => [...prev, `[APPLY] Setting MTU of ${adapter.name} to ${bestMtu}...`]);
    
    const success = await networkService.applyMtu(adapter.name, bestMtu);
    if (success) {
      setLogs(prev => [...prev, `[SUCCESS] MTU updated to ${bestMtu} successfully.`]);
    } else {
      setLogs(prev => [...prev, `[ERROR] Failed to set MTU. You may need to run this app as Administrator.`]);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Control Panel */}
      <div className="bg-[#0a0f1e] border border-[#1e293b] rounded-xl p-6 shadow-sm">
        <div className="flex gap-4 mb-6">
          <div className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/20 h-fit">
            <Shield className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Fragmentation Scanner</h3>
            <p className="text-sm text-slate-400 mt-1">Find the exact packet size before your router fragments data.</p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="mb-8">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-400">Scan Progress</span>
            <span className="text-sky-400 font-mono">{progress}%</span>
          </div>
          <div className="w-full bg-slate-800/50 rounded-full h-2 overflow-hidden border border-[#1e293b]">
            <div 
              className="bg-sky-500 h-2 rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {status === 'done' && bestMtu ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-5 mb-6 text-center animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <h4 className="text-emerald-400 font-medium mb-1">Optimum MTU Found</h4>
            <div className="text-3xl font-bold text-white mb-1">{bestMtu}</div>
            <p className="text-xs text-slate-400">Applies instantly to your active network adapter.</p>
          </div>
        ) : null}

        <div className="flex gap-3">
          <button 
            onClick={() => {
              setStatus('testing')
              setLogs([])
              setProgress(0)
              setBestMtu(null)
            }}
            disabled={status === 'testing'}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors border border-slate-700"
          >
            <Play className="w-4 h-4" />
            {status === 'idle' ? 'Start Scan' : status === 'testing' ? 'Scanning...' : 'Rescan'}
          </button>
          
          <button 
            onClick={handleApply}
            disabled={status !== 'done'}
            className="flex-1 flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(14,165,233,0.3)]"
          >
            <Zap className="w-4 h-4" />
            Apply MTU
          </button>
        </div>
      </div>

      {/* Live Terminal / Logs */}
      <div className="bg-[#020617] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
        <div className="bg-[#060b19] px-4 py-2.5 border-b border-[#1e293b] flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-mono text-slate-400">diagnostic_console.exe</span>
        </div>
        <div className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <div className="text-slate-600 h-full flex items-center justify-center italic">Waiting to begin...</div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log, i) => (
                <div key={i} className={`
                  ${log.includes('[SUCCESS]') ? 'text-emerald-400' : ''}
                  ${log.includes('[TEST]') ? 'text-amber-400/80' : ''}
                  ${log.includes('[CALCULATION]') ? 'text-sky-400' : ''}
                  ${!log.includes('[') ? 'text-slate-300' : ''}
                `}>
                  <span className="text-slate-600 mr-2">{'>'}</span>{log}
                </div>
              ))}
              {status === 'testing' && (
                <div className="text-slate-500 animate-pulse"><span className="text-slate-600 mr-2">{'>'}</span>_</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
