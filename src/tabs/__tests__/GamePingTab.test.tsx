import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GamePingTab from '../GamePingTab'

vi.mock('../../services/networkService', () => ({
  pingMultiProtocol: vi.fn().mockResolvedValue({
    icmp: { success: true, latency: 15 },
    tcp: { success: true, latency: 22 },
    udp: { success: false, unsupported: true }
  })
}))

describe('GamePingTab', () => {
  it('shows unsupported when UDP is not available', async () => {
    render(<GamePingTab />)
    const runButton = screen.getByRole('button', { name: /run test/i })
    runButton.click()
    const results = await screen.findAllByText('Unsupported')
    expect(results.length).toBeGreaterThan(0)
  })
})
