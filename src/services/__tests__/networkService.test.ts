import { describe, expect, it, beforeEach, vi } from 'vitest'
import * as networkService from '../networkService'

type ExecuteResult = { stdout?: string; stderr?: string; error?: string }

const setExecuteCommand = (handler: (command: string) => Promise<ExecuteResult>) => {
  Object.defineProperty(window, 'networkingApi', {
    value: { executeCommand: handler },
    writable: true
  })
}

describe('networkService', () => {
  beforeEach(() => {
    setExecuteCommand(async () => ({ stdout: '' }))
  })

  it('returns mock adapter when not in Electron', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'networkingApi')
    if (descriptor?.configurable) {
      Object.defineProperty(window, 'networkingApi', {
        value: undefined,
        writable: true,
        configurable: true
      })
      const adapter = await networkService.getActiveAdapter()
      expect(adapter.name).toBe('Wi-Fi')
      Object.defineProperty(window, 'networkingApi', descriptor)
      return
    }

    const original = window.networkingApi
    ;(window as unknown as Record<string, unknown>).networkingApi = undefined
    const adapter = await networkService.getActiveAdapter()
    expect(adapter.name).toBe('Wi-Fi')
    ;(window as unknown as Record<string, unknown>).networkingApi = original
  })

  it('parses ping latency from stdout', async () => {
    setExecuteCommand(async (command) => {
      if (command.startsWith('ping')) {
        return { stdout: 'Reply from 8.8.8.8: bytes=32 time=24ms TTL=118' }
      }
      return { stdout: '' }
    })

    const result = await networkService.pingTest('8.8.8.8')
    expect(result.success).toBe(true)
    expect(result.latency).toBe(24)
  })

  it('flags fragmentation when DF set fails', async () => {
    setExecuteCommand(async () => ({ stdout: 'Packet needs to be fragmented but DF set.' }))
    const result = await networkService.pingTest('8.8.8.8', 1472, true)
    expect(result.fragmented).toBe(true)
    expect(result.success).toBe(false)
  })

  it('marks UDP unsupported on PowerShell 5', async () => {
    const execMock = vi.fn(async (command: string) => {
      if (command.includes('$PSVersionTable.PSVersion.Major')) {
        return { stdout: '5' }
      }
      if (command.startsWith('ping')) {
        return { stdout: 'Reply from 8.8.8.8: bytes=32 time=10ms TTL=118' }
      }
      return { stdout: '{}' }
    })
    setExecuteCommand(execMock)

    const result = await networkService.pingMultiProtocol('8.8.8.8', 7000)
    expect(result.udp.unsupported).toBe(true)
  })
})
