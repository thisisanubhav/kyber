import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Register, { BOOKING_URL } from './Register'

describe('invite-only registration', () => {
  it('keeps the code gate and provides a working request-access path', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Register /></MemoryRouter>)

    expect(screen.getByText(/accounts are invite-only/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request access/i })).toHaveAttribute('href', BOOKING_URL)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Registration code is required.')
  })
})
