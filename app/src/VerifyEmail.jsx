import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthCard } from './App'
import { verifyEmail as apiVerifyEmail } from './api'

export default function VerifyEmail({ onVerify = apiVerifyEmail }) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : 'This verification link is missing its token.')

  useEffect(() => {
    if (!token) return
    let active = true
    onVerify(token)
      .then(() => {
        if (active) setStatus('success')
      })
      .catch((error) => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : 'This verification link is invalid or expired.')
        setStatus('error')
      })
    return () => { active = false }
  }, [onVerify, token])

  return (
    <AuthCard>
      <h1>Verify your email</h1>
      {status === 'loading' && <div className="success-message" role="status">Verifying your email…</div>}
      {status === 'success' && <>
        <div className="success-message" role="status">Your email is verified and your secure session is active.</div>
        <Link className="sales-link" to="/login">Continue to Kyber</Link>
      </>}
      {status === 'error' && <>
        <div className="error-message" role="alert">{message}</div>
        <Link className="sales-link" to="/login">Return to sign in</Link>
      </>}
    </AuthCard>
  )
}
