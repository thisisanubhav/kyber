import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const apiOrigin = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:4175'
const mailpitOrigin = process.env.INTEGRATION_MAILPIT_URL ?? 'http://127.0.0.1:8025'
const appOrigin = process.env.INTEGRATION_APP_ORIGIN ?? 'http://127.0.0.1:4174'
const websiteOrigin = process.env.INTEGRATION_WEBSITE_ORIGIN ?? 'http://127.0.0.1:4173'
const registrationCode = process.env.KYBER_INTEGRATION_REGISTRATION_CODE ?? 'KYBER-LOCAL-2026'

async function jsonRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  return { response, body: body as any }
}

async function waitForMessage(recipient: string, subject: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await fetch(`${mailpitOrigin}/api/v1/messages`).then((response) => response.json()) as any
    const message = list.messages.find((item: any) => item.Subject === subject && item.To?.some((target: any) => target.Address === recipient))
    if (message) return fetch(`${mailpitOrigin}/api/v1/message/${message.ID}`).then((response) => response.json()) as Promise<any>
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error(`Timed out waiting for ${subject} to ${recipient}`)
}

function linkToken(text: string) {
  const match = text.match(/[?&]token=([^\s\r\n]+)/)
  if (!match) throw new Error('Email did not contain a token link')
  return decodeURIComponent(match[1])
}

describe('production-like API journey', () => {
  it('protects account identity, recovery, sessions, and career uploads end to end', async () => {
    const runId = randomUUID()
    const email = `integration-${runId}@joinkyber.test`
    const applicantEmail = `candidate-${runId}@example.test`

    const metrics = await fetch(`${apiOrigin}/metrics`)
    expect(metrics.status).toBe(200)
    expect(await metrics.text()).toContain('kyber_outbox_pending')

    const invalidRecovery = await jsonRequest('/v1/auth/recovery', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({ email: 'invalid-email' }),
    })
    expect(invalidRecovery.response.status).toBe(400)
    expect(invalidRecovery.body.error).toBe('validation_error')
    expect(invalidRecovery.response.headers.get('cache-control')).toBe('no-store')
    expect(invalidRecovery.response.headers.get('x-request-id')).toBeTruthy()

    const blockedOrigin = await jsonRequest('/v1/auth/recovery', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
      body: JSON.stringify({ email }),
    })
    expect(blockedOrigin.response.status).toBe(403)
    expect(blockedOrigin.body.error).toBe('origin_not_allowed')

    const exchange = await jsonRequest('/v1/registration-codes/exchange', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({ code: registrationCode }),
    })
    expect(exchange.response.status).toBe(200)

    const registration = await jsonRequest('/v1/auth/register', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({
        enrollmentTicket: exchange.body.enrollmentTicket,
        name: 'Integration User',
        email,
        password: 'InitialIntegration!2026',
      }),
    })
    expect(registration.response.status).toBe(201)
    expect(registration.body.verificationRequired).toBe(true)

    const unverifiedLogin = await jsonRequest('/v1/auth/sign-in', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({ email, password: 'InitialIntegration!2026' }),
    })
    expect(unverifiedLogin.response.status).toBe(403)
    expect(unverifiedLogin.body.error).toBe('email_not_verified')

    const verificationMessage = await waitForMessage(email, 'Verify your Kyber email')
    const verification = await jsonRequest('/v1/auth/verify-email', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({ token: linkToken(verificationMessage.Text) }),
    })
    expect(verification.response.status).toBe(200)
    const sessionCookie = verification.response.headers.get('set-cookie')?.split(';')[0]
    expect(sessionCookie).toContain('kyber_session=')

    const me = await jsonRequest('/v1/auth/me', { headers: { Cookie: sessionCookie! } })
    expect(me.response.status).toBe(200)
    expect(me.body.user.email).toBe(email)

    const recovery = await jsonRequest('/v1/auth/recovery', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({ email }),
    })
    expect(recovery.response.status).toBe(202)
    const recoveryMessage = await waitForMessage(email, 'Reset your Kyber password')
    const reset = await jsonRequest('/v1/auth/reset-password', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({ token: linkToken(recoveryMessage.Text), password: 'ResetIntegration!2026' }),
    })
    expect(reset.response.status).toBe(200)

    const invalidatedSession = await jsonRequest('/v1/auth/me', { headers: { Cookie: sessionCookie! } })
    expect(invalidatedSession.response.status).toBe(401)

    const signedIn = await jsonRequest('/v1/auth/sign-in', {
      method: 'POST',
      headers: { Origin: appOrigin },
      body: JSON.stringify({ email, password: 'ResetIntegration!2026' }),
    })
    expect(signedIn.response.status).toBe(200)

    const cv = await readFile(resolve(process.cwd(), 'test/fixtures/sample-cv.pdf'))
    const uploadDraft = await jsonRequest('/v1/applications/uploads', {
      method: 'POST',
      headers: { Origin: websiteOrigin },
      body: JSON.stringify({ files: [{ kind: 'cv', fileName: 'integration-cv.pdf', contentType: 'application/pdf', size: cv.length }] }),
    })
    expect(uploadDraft.response.status).toBe(201)
    const upload = await fetch(uploadDraft.body.uploads[0].url, {
      method: 'PUT',
      headers: { Origin: websiteOrigin, 'Content-Type': 'application/pdf' },
      body: cv,
    })
    expect(upload.status).toBe(204)

    const application = await jsonRequest('/v1/applications', {
      method: 'POST',
      headers: { Origin: websiteOrigin },
      body: JSON.stringify({
        draftId: uploadDraft.body.draftId,
        draftToken: uploadDraft.body.draftToken,
        jobId: 'founding-engineer',
        fullName: 'Integration Candidate',
        email: applicantEmail,
        linkedinUrl: 'https://www.linkedin.com/in/integration-candidate',
      }),
    })
    expect(application.response.status).toBe(202)
    expect(application.body.status).toBe('pending_scan')

    const confirmation = await waitForMessage(applicantEmail, 'Application received — Founding Engineer — Full Stack')
    expect(confirmation.Text).toContain('We received your application')
  })
})
