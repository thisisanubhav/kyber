const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4175'

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.message || 'The local API could not complete this request.')
    error.code = body?.error
    throw error
  }
  return body
}

export function requestRecovery(email) {
  return request('/v1/auth/recovery', { method: 'POST', body: JSON.stringify({ email }) })
}

export function signIn(credentials) {
  return request('/v1/auth/sign-in', { method: 'POST', body: JSON.stringify(credentials) })
}

export function exchangeRegistrationCode(code) {
  return request('/v1/registration-codes/exchange', { method: 'POST', body: JSON.stringify({ code }) })
}

export function registerAccount(input) {
  return request('/v1/auth/register', { method: 'POST', body: JSON.stringify(input) })
}

export function resetPassword(input) {
  return request('/v1/auth/reset-password', { method: 'POST', body: JSON.stringify(input) })
}

export function verifyEmail(token) {
  return request('/v1/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
}

export function resendVerification(email) {
  return request('/v1/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) })
}

export function currentUser() {
  return request('/v1/auth/me')
}

export function signOut() {
  return request('/v1/auth/sign-out', { method: 'POST' })
}
