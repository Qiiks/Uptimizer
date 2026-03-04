# Uptimizer

All-in-one Windows network toolkit for gamers and IT professionals.

## Features

- **Dashboard** - Overview of network adapters, active connections, and real-time bandwidth
- **Ping** - ICMP ping with latency monitoring and game server optimization
- **Traceroute** - Network path visualization with geolocation for each hop
- **Speedtest** - Internet speed testing with historical results
- **Netstat** - View active connections and listening ports
- **DNS Tools** - DNS lookup, flush DNS cache, change DNS servers
- **LAN Scanner** - Discover devices on your local network
- **WiFi Analyzer** - Channel analysis and signal strength monitoring
- **Network Repair** - Reset TCP/IP, flush DNS, release/renew IP
- **QoS Management** - Configure QoS packet scheduler settings
- **Power Plans** - Switch between power plans for gaming/performance
- **TCP Optimizer** - Configure network adapter settings for optimal performance
- **Bandwidth Monitor** - Real-time upload/download speed tracking
- **Game Ping** - Optimize and test ping to popular game servers

## Requirements

- Windows 10/11
- Administrator privileges (required for network operations)

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

### Building

The build command will:
1. Compile TypeScript
2. Build the Vite renderer
3. Package the Electron app

The final executable will be in `release/Uptimizer 1.0.0.exe`.

## Tech Stack

- Electron 33
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Lucide React

## License

MIT
