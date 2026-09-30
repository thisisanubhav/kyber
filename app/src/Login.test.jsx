import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Login from './Login'

function renderLogin(props = {}) {
  return render(<MemoryRouter><Login {...props} /></MemoryRouter>)
}

describe('password recovery', () => {
  it('rejects malformed email locally, uses a format error, and never starts recovery', async () => {
    const user = userEvent.setup()
    const onRecover = vi.fn()
    renderLogin({ onRecover })

    await user.type(screen.getByLabelText('Email'), 'invalid-email')
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
    expect(onRecover).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveTextContent('Sign in')
  })

  it('keeps empty-field validation and clears a stale recovery error when email changes', async () => {
    const user = userEvent.setup()
    const onRecover = vi.fn()
    renderLogin({ onRecover })

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Email is required.')

    await user.type(screen.getByLabelText('Email'), 'person@kyber.test')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onRecover).not.toHaveBeenCalled()
  })

  it('shows recovery-specific loading text without relabeling Sign in', async () => {
    const user = userEvent.setup()
    let resolveRecovery
    const onRecover = vi.fn(() => new Promise((resolve) => { resolveRecovery = resolve }))
    renderLogin({ onRecover })

    await user.type(screen.getByLabelText('Email'), 'person@kyber.test')
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(onRecover).toHaveBeenCalledWith('person@kyber.test')
    expect(screen.getByRole('button', { name: 'Sending recovery email…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveTextContent('Sign in')
    resolveRecovery()
  })

  it('offers a safe resend path when a verified email is still pending', async () => {
    const user = userEvent.setup()
    const error = new Error('Verify your email before signing in.')
    error.code = 'email_not_verified'
    const onSignIn = vi.fn().mockRejectedValue(error)
    const onResendVerification = vi.fn().mockResolvedValue({})
    renderLogin({ onSignIn, onResendVerification })

    await user.type(screen.getByLabelText('Email'), 'pending@kyber.test')
    await user.type(screen.getByLabelText('Password'), 'long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await user.click(await screen.findByRole('button', { name: 'Resend verification email' }))

    expect(onResendVerification).toHaveBeenCalledWith('pending@kyber.test')
    expect(await screen.findByRole('status')).toHaveTextContent(/new email is on its way/i)
  })
})
