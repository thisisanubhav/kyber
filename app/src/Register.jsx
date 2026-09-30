import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard } from './App'
import { exchangeRegistrationCode, registerAccount } from './api'

export const BOOKING_URL = 'https://calendar.app.google/xSoWj2GgaaHrZmRH7'

export default function Register({ onExchange = exchangeRegistrationCode, onRegister = registerAccount }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)
  const [ticket, setTicket] = useState('')
  const [loading, setLoading] = useState(false)
  const [account, setAccount] = useState({ name: '', email: '', password: '' })
  const [verificationRequired, setVerificationRequired] = useState(false)

  async function submitCode(event) {
    event.preventDefault()
    if (!code.trim()) {
      setError('Registration code is required.')
      return
    }
    setLoading(true)
    try {
      const result = await onExchange(code.trim())
      setTicket(result.enrollmentTicket)
      setStep(2)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The registration code could not be verified.')
    } finally {
      setLoading(false)
    }
  }

  async function submitAccount(event) {
    event.preventDefault()
    setError('')
    if (account.password.length < 12) {
      setError('Use at least 12 characters for your password.')
      return
    }
    setLoading(true)
    try {
      const result = await onRegister({ enrollmentTicket: ticket, ...account })
      setVerificationRequired(Boolean(result?.verificationRequired))
      setStep(3)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The account could not be created.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard>
      <div className="steps" aria-label={`Step ${step} of 3`}><span className={step >= 1 ? 'active' : ''} /><span className={step >= 2 ? 'active' : ''} /><span className={step >= 3 ? 'active' : ''} /></div>
      {step === 1 && <>
        <h1>Enter Registration Code</h1>
        <p className="subtitle">Step 1 of 3 — Registration code</p>
        <div className="invite-note"><strong>Kyber accounts are invite-only.</strong><span>Your organisation’s administrator can provide a registration code. If you’re evaluating Kyber, request access from our sales team.</span></div>
        {error && <div id="registration-error" className="error-message" role="alert">{error}</div>}
        <form onSubmit={submitCode} noValidate>
          <label htmlFor="registration-code">Registration Code</label>
          <input id="registration-code" value={code} onChange={(event) => { setCode(event.target.value); setError('') }} placeholder="Enter your registration code" autoComplete="one-time-code" aria-invalid={Boolean(error)} aria-describedby={error ? 'registration-error' : 'registration-help'} required />
          <small id="registration-help">Codes are issued by an administrator.</small>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Verifying…' : <>Continue <span aria-hidden="true">→</span></>}</button>
        </form>
        <a className="sales-link" href={BOOKING_URL} target="_blank" rel="noreferrer">Request access / Contact sales <span aria-hidden="true">↗</span></a>
        <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
      </>}
      {step === 2 && <>
        <h1>Create your account</h1>
        <p className="subtitle">Step 2 of 3 — Account details</p>
        {error && <div id="registration-error" className="error-message" role="alert">{error}</div>}
        <form onSubmit={submitAccount}>
          <label htmlFor="name">Full name</label><input id="name" value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} autoComplete="name" required />
          <label htmlFor="register-email">Email</label><input id="register-email" type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} autoComplete="email" required />
          <label htmlFor="register-password">Password</label><input id="register-password" type="password" minLength="12" value={account.password} onChange={(event) => setAccount({ ...account, password: event.target.value })} autoComplete="new-password" required />
          <small>Use at least 12 characters.</small>
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Creating account…' : 'Create account →'}</button>
        </form>
      </>}
      {step === 3 && <>
        <h1>{verificationRequired ? 'Check your email' : 'Account created'}</h1>
        <p className="subtitle">Step 3 of 3 — Complete</p>
        <div className="success-message" role="status">
          {verificationRequired
            ? <>Your account was created. Verify <strong>{account.email}</strong> before signing in.</>
            : 'Your local Kyber account and secure session are ready.'}
        </div>
        <Link className="sales-link" to="/login">Return to sign in</Link>
      </>}
    </AuthCard>
  )
}
