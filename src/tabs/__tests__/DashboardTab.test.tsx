import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DashboardTab from '../DashboardTab'

vi.mock('../../services/networkService', () => ({
  getActiveAdapter: vi.fn().mockResolvedValue({
    name: 'Ethernet',
    ipAddress: '10.0.0.2',
    mtu: 1500,
    description: 'Test Adapter'
  }),
  pingTest: vi.fn().mockResolvedValue({ success: true, latency: 20, fragmented: false }),
  repairNetwork: vi.fn().mockResolvedValue({ success: true, log: 'ok' })
}))

describe('DashboardTab', () => {
  it('renders adapter data', async () => {
    render(<DashboardTab />)
    expect(await screen.findByText('Ethernet')).toBeInTheDocument()
    expect(await screen.findByText('10.0.0.2')).toBeInTheDocument()
  })
})
