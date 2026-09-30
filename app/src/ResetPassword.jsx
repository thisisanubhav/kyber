import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthCard } from './App'
import { resetPassword as apiResetPassword } from './api'

export default function ResetPassword({ onReset = apiResetPassword }) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!token) return setError('This recovery link is missing its token.')
    if (password.length < 12) return setError('Use at least 12 characters for your password.')
    if (password !== confirmPassword) return setError('Passwords do not match.')
    setLoading(true)
    setError('')
    try {
      await onReset({ token, password })
      setComplete(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The password could not be reset.')
    } finally {
      setLoading(false)
    }
  }

  return <AuthCard>
    <h1>Reset your password</h1>
    <p className="subtitle">Choose a new password for Kyber Maestro.</p>
    {complete ? <><div className="success-message" role="status">Password updated successfully.</div><Link className="sales-link" to="/login">Sign in</Link></> : <>
      {error && <div className="error-message" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <label htmlFor="new-password">New password</label><input id="new-password" type="password" minLength="12" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} autoComplete="new-password" required />
        <label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" minLength="12" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError('') }} autoComplete="new-password" required />
        <button className="primary-button" disabled={loading}>{loading ? 'Resetting password…' : 'Reset password'}</button>
      </form>
    </>}
  </AuthCard>
}
