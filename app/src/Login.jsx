import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard } from './App'
import { requestRecovery, resendVerification as apiResendVerification, signIn as apiSignIn } from './api'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login({ onRecover = requestRecovery, onSignIn = apiSignIn, onResendVerification = apiResendVerification }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [mode, setMode] = useState('password')
  const [signedInUser, setSignedInUser] = useState(null)
  const [verificationPending, setVerificationPending] = useState(false)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  function updateEmail(event) {
    setEmail(event.target.value)
    setError('')
    setVerificationPending(false)
    setVerificationSent(false)
  }

  function validateEmail() {
    const value = email.trim()
    if (!value) {
      setError('Email is required.')
      return false
    }
    if (!EMAIL_PATTERN.test(value)) {
      setError('Enter a valid email address.')
      return false
    }
    return true
  }

  async function recover() {
    if (!validateEmail()) return
    setError('')
    setRecoveryLoading(true)
    try {
      await onRecover(email.trim())
      setMode('recovery-sent')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'We could not start password recovery. Please try again.')
    } finally {
      setRecoveryLoading(false)
    }
  }

  async function signIn(event) {
    event.preventDefault()
    if (!validateEmail()) return
    if (!password) {
      setError('Password is required.')
      return
    }
    setError('')
    setSignInLoading(true)
    try {
      const result = await onSignIn({ email: email.trim(), password })
      setSignedInUser(result?.user ?? { name: email.trim() })
      setMode('signed-in')
    } catch (requestError) {
      setVerificationPending(requestError?.code === 'email_not_verified')
      setError(requestError instanceof Error ? requestError.message : 'Sign in failed. Please try again.')
    } finally {
      setSignInLoading(false)
    }
  }

  async function resendVerification() {
    if (!validateEmail()) return
    setVerificationLoading(true)
    setVerificationSent(false)
    try {
      await onResendVerification(email.trim())
      setVerificationSent(true)
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'We could not resend verification. Please try again.')
    } finally {
      setVerificationLoading(false)
    }
  }

  if (mode === 'recovery-sent') {
    return (
      <AuthCard>
        <p className="subtitle">Check your email</p>
        <div className="success-message" role="status">If an account exists for <strong>{email.trim()}</strong>, recovery instructions are on their way.</div>
        <button className="secondary-button" type="button" onClick={() => setMode('password')}>Return to sign in</button>
      </AuthCard>
    )
  }

  if (mode === 'signed-in') {
    return (
      <AuthCard>
        <p className="subtitle">Signed in locally</p>
        <div className="success-message" role="status">Welcome, <strong>{signedInUser?.name}</strong>. Your secure local session cookie is active.</div>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <p className="subtitle">Sign in with your email</p>
      {error && <div id="auth-error" className="error-message" role="alert">{error}</div>}
      {verificationSent && <div className="success-message" role="status">If verification is pending, a new email is on its way.</div>}
      <form onSubmit={signIn} noValidate>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={updateEmail}
          autoComplete="email"
          aria-invalid={Boolean(error && (error.includes('Email') || error.includes('email')))}
          aria-describedby={error ? 'auth-error' : undefined}
          required
        />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} autoComplete="current-password" required />
        <button className="recovery-button" type="button" onClick={recover} disabled={recoveryLoading || signInLoading}>
          {recoveryLoading ? 'Sending recovery email…' : 'Forgot password?'}
        </button>
        <button className="primary-button" type="submit" disabled={recoveryLoading || signInLoading}>
          {signInLoading ? 'Signing in…' : 'Sign in'}
        </button>
        {verificationPending && (
          <button className="secondary-button" type="button" onClick={resendVerification} disabled={verificationLoading}>
            {verificationLoading ? 'Resending verification…' : 'Resend verification email'}
          </button>
        )}
      </form>
      <p className="auth-footer"><Link to="/register">Create an account</Link></p>
    </AuthCard>
  )
}
