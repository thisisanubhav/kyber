import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import VerifyEmail from './VerifyEmail'

describe('email verification', () => {
  it('exchanges a link token and reports a verified session', async () => {
    const onVerify = vi.fn().mockResolvedValue({ user: { name: 'Verified User' } })
    render(<MemoryRouter initialEntries={['/verify-email?token=verification-token']}><VerifyEmail onVerify={onVerify} /></MemoryRouter>)

    expect(await screen.findByText(/email is verified/i)).toBeInTheDocument()
    expect(onVerify).toHaveBeenCalledWith('verification-token')
  })

  it('rejects a link without a token without calling the API', () => {
    const onVerify = vi.fn()
    render(<MemoryRouter initialEntries={['/verify-email']}><VerifyEmail onVerify={onVerify} /></MemoryRouter>)

    expect(screen.getByRole('alert')).toHaveTextContent(/missing its token/i)
    expect(onVerify).not.toHaveBeenCalled()
  })
})
