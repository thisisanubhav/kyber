import Fastify, { type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { config, isProduction } from './config.js'
import { closeDb, db, prepareDatabase } from './db.js'
import { clientIp, enforceRateLimit, validationError } from './http.js'
import { closeRedis, redis } from './redis.js'
import { enqueueOutbox } from './outbox.js'
import { recordHttpRequest, renderMetrics } from './metrics.js'
import {
  EMAIL_PATTERN,
  hashPassword,
  normalizeEmail,
  opaqueToken,
  safeFileName,
  stableHash,
  tokenHash,
  verifyPassword,
} from './security.js'
import { acceptLocalUpload, ensureBucket, headObject, presignedPut, removeObject } from './storage.js'

const app = Fastify({
  bodyLimit: 1024 * 1024,
  connectionTimeout: 15_000,
  requestTimeout: 30_000,
  keepAliveTimeout: 10_000,
  trustProxy: config.TRUSTED_PROXIES.length ? config.TRUSTED_PROXIES : false,
  logger: {
    level: config.LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
      censor: '[REDACTED]',
    },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url?.split('?')[0],
          hostname: request.hostname,
          remoteAddress: request.socket?.remoteAddress,
        }
      },
    },
  },
})

function originVariants(origin: string) {
  const variants = [origin]
  const url = new URL(origin)
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1'
    variants.push(url.origin)
  }
  return variants
}

const allowedOrigins = [...new Set([
  ...originVariants(config.APP_ORIGIN),
  ...originVariants(config.WEBSITE_ORIGIN),
])]

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

await app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 600,
  strictPreflight: true,
})
await app.register(cookie)
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  strictTransportSecurity: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
})

app.addHook('onRequest', async (request, reply) => {
  reply.header('X-Request-Id', request.id)
  const origin = request.headers.origin
  if (origin && mutationMethods.has(request.method) && !allowedOrigins.includes(origin)) {
    return reply.code(403).send({ error: 'origin_not_allowed', message: 'This request origin is not allowed.' })
  }
})

app.addHook('onSend', async (request, reply, payload) => {
  if (request.url.startsWith('/v1/auth/') || request.url.startsWith('/v1/registration-codes/')) {
    reply.header('Cache-Control', 'no-store')
  }
  return payload
})

app.addHook('onResponse', async (request, reply) => {
  recordHttpRequest(request.method, request.routeOptions.url ?? 'unmatched', reply.statusCode, reply.elapsedTime)
})

for (const contentType of [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]) {
  app.addContentTypeParser(contentType, { parseAs: 'buffer', bodyLimit: 50 * 1024 * 1024 }, (_request, body, done) => done(null, body))
}

const emailSchema = z.string().trim().max(254).refine((value) => EMAIL_PATTERN.test(value), 'Enter a valid email address.')
const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128)
const uuidSchema = z.string().uuid()

const allowedUploads = {
  cv: {
    types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    max: 5 * 1024 * 1024,
  },
  video: {
    types: ['video/mp4', 'video/quicktime', 'video/webm'],
    max: 50 * 1024 * 1024,
  },
} as const

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value)
  return result.success ? { data: result.data } : { error: result.error.flatten() }
}

async function createSession(userId: string) {
  const raw = opaqueToken()
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '7 days')`,
    [userId, tokenHash(raw)],
  )
  return raw
}

function setSession(reply: FastifyReply, token: string) {
  reply.setCookie(isProduction ? '__Host-kyber_session' : 'kyber_session', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: isProduction ? undefined : config.COOKIE_DOMAIN,
    maxAge: 7 * 24 * 60 * 60,
  })
}

function clearSession(reply: FastifyReply) {
  reply.clearCookie(isProduction ? '__Host-kyber_session' : 'kyber_session', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: isProduction ? undefined : config.COOKIE_DOMAIN,
  })
}

async function authenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const rawSession = request.cookies[isProduction ? '__Host-kyber_session' : 'kyber_session']
  if (!rawSession) {
    reply.code(401).send({ error: 'authentication_required', message: 'Sign in to continue.' })
    return
  }
  const result = await db.query<{ id: string; display_name: string; email: string }>(
    `UPDATE sessions s SET last_seen_at = now()
     FROM users u
     WHERE s.token_hash = $1 AND s.user_id = u.id AND s.expires_at > now() AND u.disabled_at IS NULL
     RETURNING u.id, u.display_name, u.email::text`,
    [tokenHash(rawSession)],
  )
  const user = result.rows[0]
  if (!user) {
    clearSession(reply)
    reply.code(401).send({ error: 'authentication_required', message: 'Your session is invalid or expired.' })
    return
  }
  return user
}

app.get('/health/live', async () => ({ status: 'ok' }))
app.get('/health/ready', async (_request, reply) => {
  try {
    await Promise.all([db.query('SELECT 1'), redis.ping(), ensureBucket()])
    return { status: 'ready' }
  } catch (error) {
    app.log.error(error)
    return reply.code(503).send({ status: 'not_ready' })
  }
})

app.get('/metrics', async (request, reply) => {
  if (config.METRICS_TOKEN && request.headers.authorization !== `Bearer ${config.METRICS_TOKEN}`) {
    return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'authentication_required' })
  }
  const operational = await db.query<{ pending_outbox: string; oldest_outbox_seconds: string; failed_scans: string }>(
    `SELECT
       (SELECT count(*)::text FROM outbox_events WHERE published_at IS NULL) AS pending_outbox,
       (SELECT COALESCE(EXTRACT(epoch FROM now() - min(created_at)), 0)::text FROM outbox_events WHERE published_at IS NULL) AS oldest_outbox_seconds,
       (SELECT count(*)::text FROM application_uploads WHERE scan_status = 'failed') AS failed_scans`,
  )
  const state = operational.rows[0]
  const body = `${renderMetrics()}# HELP kyber_outbox_pending Unpublished durable jobs.\n# TYPE kyber_outbox_pending gauge\nkyber_outbox_pending ${Number(state.pending_outbox)}\n# HELP kyber_outbox_oldest_seconds Age of the oldest unpublished durable job.\n# TYPE kyber_outbox_oldest_seconds gauge\nkyber_outbox_oldest_seconds ${Number(state.oldest_outbox_seconds)}\n# HELP kyber_application_failed_scans Uploads whose safety scan exhausted an attempt.\n# TYPE kyber_application_failed_scans gauge\nkyber_application_failed_scans ${Number(state.failed_scans)}\n# HELP kyber_db_pool_connections PostgreSQL pool connections by state.\n# TYPE kyber_db_pool_connections gauge\nkyber_db_pool_connections{state="total"} ${db.totalCount}\nkyber_db_pool_connections{state="idle"} ${db.idleCount}\nkyber_db_pool_connections{state="waiting"} ${db.waitingCount}\n`
  return reply.type('text/plain; version=0.0.4; charset=utf-8').send(body)
})

app.put('/v1/local-uploads', async (request, reply) => {
  const input = parse(z.object({
    objectKey: z.string().min(1).max(500),
    contentType: z.string().min(1).max(120),
    expires: z.coerce.number().int().positive(),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  }), request.query)
  if ('error' in input) return validationError(reply, input.error)
  if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'invalid_upload', message: 'An upload body is required.' })
  if (request.body.length > 50 * 1024 * 1024) return reply.code(413).send({ error: 'upload_too_large' })
  try {
    await acceptLocalUpload({ ...input.data, body: request.body })
    return reply.code(204).send()
  } catch (error) {
    request.log.warn({ err: error }, 'rejected local upload')
    return reply.code(403).send({ error: 'invalid_upload_url', message: 'This upload URL is invalid or expired.' })
  }
})

app.get('/v1/auth/me', async (request, reply) => {
  const user = await authenticatedUser(request, reply)
  if (!user) return
  return { user: { id: user.id, name: user.display_name, email: user.email } }
})

app.post('/v1/auth/sign-in', async (request, reply) => {
  const input = parse(z.object({ email: emailSchema, password: z.string().min(1).max(128) }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  const email = normalizeEmail(input.data.email)
  if (await enforceRateLimit(request, reply, 'sign-in', 8, 15 * 60, stableHash(email))) return

  const result = await db.query<{ id: string; display_name: string; password_hash: string; email_verified_at: string | null }>(
    `SELECT id, display_name, password_hash, email_verified_at FROM users
     WHERE email = $1 AND disabled_at IS NULL`,
    [email],
  )
  const user = result.rows[0]
  if (!user || !(await verifyPassword(user.password_hash, input.data.password))) {
    await db.query(
      `INSERT INTO audit_events (event_type, subject_hash, ip_hash) VALUES ('auth.sign_in_failed', $1, $2)`,
      [stableHash(email), stableHash(clientIp(request))],
    )
    return reply.code(401).send({ error: 'invalid_credentials', message: 'Email or password is incorrect.' })
  }
  if (!user.email_verified_at) {
    return reply.code(403).send({ error: 'email_not_verified', message: 'Verify your email before signing in.' })
  }

  const session = await createSession(user.id)
  setSession(reply, session)
  await db.query(
    `INSERT INTO audit_events (event_type, actor_user_id, ip_hash) VALUES ('auth.sign_in_succeeded', $1, $2)`,
    [user.id, stableHash(clientIp(request))],
  )
  return { user: { id: user.id, name: user.display_name, email } }
})

app.post('/v1/auth/recovery', async (request, reply) => {
  const input = parse(z.object({ email: emailSchema }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  const email = normalizeEmail(input.data.email)
  if (await enforceRateLimit(request, reply, 'recovery', 5, 60 * 60, stableHash(email))) return

  const result = await db.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users WHERE email = $1 AND disabled_at IS NULL`,
    [email],
  )
  const user = result.rows[0]
  if (user) {
    const token = opaqueToken()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE password_reset_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL`, [user.id])
      const reset = await client.query<{ id: string }>(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 minutes') RETURNING id`,
        [user.id, tokenHash(token)],
      )
      await enqueueOutbox(client, 'email', 'password-recovery', `password-recovery:${reset.rows[0].id}`, {
        email,
        name: user.display_name,
        token,
      })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  await db.query(
    `INSERT INTO audit_events (event_type, subject_hash, ip_hash) VALUES ('auth.recovery_requested', $1, $2)`,
    [stableHash(email), stableHash(clientIp(request))],
  )
  return reply.code(202).send({ message: 'If an account exists, recovery instructions will be sent.' })
})

app.post('/v1/auth/reset-password', async (request, reply) => {
  const input = parse(z.object({ token: z.string().min(32).max(256), password: passwordSchema }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  if (await enforceRateLimit(request, reply, 'reset-password', 8, 60 * 60)) return
  const passwordHash = await hashPassword(input.data.password)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash(input.data.token)],
    )
    const reset = result.rows[0]
    if (!reset) {
      await client.query('ROLLBACK')
      return reply.code(400).send({ error: 'invalid_reset_token', message: 'This recovery link is invalid or has expired.' })
    }
    await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [passwordHash, reset.user_id])
    await client.query(`UPDATE password_reset_tokens SET consumed_at = now() WHERE id = $1`, [reset.id])
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [reset.user_id])
    await client.query(
      `INSERT INTO audit_events (event_type, actor_user_id, ip_hash) VALUES ('auth.password_reset', $1, $2)`,
      [reset.user_id, stableHash(clientIp(request))],
    )
    await client.query('COMMIT')
    return { message: 'Password updated. Sign in with your new password.' }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

app.post('/v1/auth/verify-email', async (request, reply) => {
  const input = parse(z.object({ token: z.string().min(32).max(256) }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  if (await enforceRateLimit(request, reply, 'verify-email', 12, 60 * 60)) return
  const client = await db.connect()
  let user: { id: string; display_name: string; email: string } | undefined
  try {
    await client.query('BEGIN')
    const result = await client.query<{ id: string; user_id: string; display_name: string; email: string }>(
      `SELECT evt.id, evt.user_id, u.display_name, u.email::text
       FROM email_verification_tokens evt
       JOIN users u ON u.id = evt.user_id
       WHERE evt.token_hash = $1 AND evt.consumed_at IS NULL AND evt.expires_at > now()
         AND u.disabled_at IS NULL
       FOR UPDATE OF evt, u`,
      [tokenHash(input.data.token)],
    )
    const verification = result.rows[0]
    if (!verification) {
      await client.query('ROLLBACK')
      return reply.code(400).send({ error: 'invalid_verification_token', message: 'This verification link is invalid or expired.' })
    }
    await client.query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`, [verification.user_id])
    await client.query(`UPDATE email_verification_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL`, [verification.user_id])
    await client.query(
      `INSERT INTO audit_events (event_type, actor_user_id, ip_hash) VALUES ('auth.email_verified', $1, $2)`,
      [verification.user_id, stableHash(clientIp(request))],
    )
    await client.query('COMMIT')
    user = { id: verification.user_id, display_name: verification.display_name, email: verification.email }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  const session = await createSession(user.id)
  setSession(reply, session)
  return { user: { id: user.id, name: user.display_name, email: user.email } }
})

app.post('/v1/auth/resend-verification', async (request, reply) => {
  const input = parse(z.object({ email: emailSchema }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  const email = normalizeEmail(input.data.email)
  if (await enforceRateLimit(request, reply, 'resend-verification', 3, 60 * 60, stableHash(email))) return
  const result = await db.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users
     WHERE email = $1 AND email_verified_at IS NULL AND disabled_at IS NULL`,
    [email],
  )
  const user = result.rows[0]
  if (user) {
    const token = opaqueToken()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE email_verification_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL`, [user.id])
      const verification = await client.query<{ id: string }>(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '24 hours') RETURNING id`,
        [user.id, tokenHash(token)],
      )
      await enqueueOutbox(client, 'email', 'verify-email', `verify-email:${verification.rows[0].id}`, {
        email,
        name: user.display_name,
        token,
      })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  return reply.code(202).send({ message: 'If verification is pending, a new email will be sent.' })
})

app.post('/v1/auth/sign-out', async (request, reply) => {
  const session = request.cookies[isProduction ? '__Host-kyber_session' : 'kyber_session']
  if (session) await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash(session)])
  clearSession(reply)
  return reply.code(204).send()
})

app.post('/v1/registration-codes/exchange', async (request, reply) => {
  const input = parse(z.object({ code: z.string().trim().min(1).max(128) }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  if (await enforceRateLimit(request, reply, 'registration-code', 10, 60 * 60)) return
  const result = await db.query<{ id: string }>(
    `SELECT id FROM registration_codes
     WHERE code_hash = $1 AND active = true AND expires_at > now() AND used_count < max_uses`,
    [tokenHash(input.data.code)],
  )
  const code = result.rows[0]
  if (!code) return reply.code(400).send({ error: 'invalid_registration_code', message: 'That registration code is invalid or expired.' })
  const ticket = opaqueToken()
  await db.query(
    `INSERT INTO enrollment_tickets (registration_code_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '5 minutes')`,
    [code.id, tokenHash(ticket)],
  )
  return { enrollmentTicket: ticket, expiresIn: 300 }
})

app.post('/v1/auth/register', async (request, reply) => {
  const input = parse(z.object({
    enrollmentTicket: z.string().min(32).max(256),
    name: z.string().trim().min(2).max(100),
    email: emailSchema,
    password: passwordSchema,
  }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  if (await enforceRateLimit(request, reply, 'register', 8, 60 * 60)) return
  const email = normalizeEmail(input.data.email)
  const passwordHash = await hashPassword(input.data.password)
  const verificationToken = config.REQUIRE_EMAIL_VERIFICATION ? opaqueToken() : null
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const ticketResult = await client.query<{ ticket_id: string; code_id: string; organization_id: string }>(
      `SELECT et.id AS ticket_id, rc.id AS code_id, rc.organization_id
       FROM enrollment_tickets et
       JOIN registration_codes rc ON rc.id = et.registration_code_id
       WHERE et.token_hash = $1 AND et.consumed_at IS NULL AND et.expires_at > now()
         AND rc.active = true AND rc.expires_at > now() AND rc.used_count < rc.max_uses
       FOR UPDATE OF et, rc`,
      [tokenHash(input.data.enrollmentTicket)],
    )
    const ticket = ticketResult.rows[0]
    if (!ticket) {
      await client.query('ROLLBACK')
      return reply.code(400).send({ error: 'invalid_enrollment_ticket', message: 'Your registration session expired. Enter the code again.' })
    }
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash, email_verified_at)
       VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN NULL ELSE now() END) RETURNING id`,
      [email, input.data.name, passwordHash, config.REQUIRE_EMAIL_VERIFICATION],
    )
    const userId = userResult.rows[0].id
    await client.query(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'member')`, [userId, ticket.organization_id])
    await client.query(`UPDATE enrollment_tickets SET consumed_at = now() WHERE id = $1`, [ticket.ticket_id])
    await client.query(`UPDATE registration_codes SET used_count = used_count + 1 WHERE id = $1`, [ticket.code_id])
    await client.query(
      `INSERT INTO audit_events (event_type, actor_user_id, ip_hash) VALUES ('auth.registered', $1, $2)`,
      [userId, stableHash(clientIp(request))],
    )
    if (verificationToken) {
      const verification = await client.query<{ id: string }>(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '24 hours') RETURNING id`,
        [userId, tokenHash(verificationToken)],
      )
      await enqueueOutbox(client, 'email', 'verify-email', `verify-email:${verification.rows[0].id}`, {
        email,
        name: input.data.name,
        token: verificationToken,
      })
    }
    await client.query('COMMIT')
    if (verificationToken) {
      return reply.code(201).send({
        user: { id: userId, name: input.data.name, email },
        verificationRequired: true,
      })
    }
    const session = await createSession(userId)
    setSession(reply, session)
    return reply.code(201).send({ user: { id: userId, name: input.data.name, email } })
  } catch (error: any) {
    await client.query('ROLLBACK')
    if (error?.code === '23505') return reply.code(409).send({ error: 'email_in_use', message: 'An account already exists for this email.' })
    throw error
  } finally {
    client.release()
  }
})

app.get('/v1/jobs', async () => {
  const result = await db.query(`SELECT id, title FROM jobs WHERE active = true ORDER BY created_at, id`)
  return { jobs: result.rows }
})

const uploadRequestSchema = z.object({
  files: z.array(z.object({
    kind: z.enum(['cv', 'video']),
    fileName: z.string().trim().min(1).max(180),
    contentType: z.string().min(1).max(120),
    size: z.number().int().positive(),
  })).min(1).max(2),
})

app.post('/v1/applications/uploads', async (request, reply) => {
  const input = parse(uploadRequestSchema, request.body)
  if ('error' in input) return validationError(reply, input.error)
  if (await enforceRateLimit(request, reply, 'application-upload', 12, 60 * 60)) return
  const kinds = input.data.files.map((file) => file.kind)
  if (kinds.filter((kind) => kind === 'cv').length !== 1 || kinds.filter((kind) => kind === 'video').length > 1) {
    return validationError(reply, { files: ['Include exactly one CV and no more than one video.'] })
  }
  for (const file of input.data.files) {
    const rules = allowedUploads[file.kind]
    if (!(rules.types as readonly string[]).includes(file.contentType) || file.size > rules.max) {
      return validationError(reply, { files: [`${file.kind} has an unsupported type or exceeds its size limit.`] })
    }
  }

  const draftToken = opaqueToken()
  const draft = await db.query<{ id: string }>(
    `INSERT INTO application_drafts (token_hash, expires_at)
     VALUES ($1, now() + interval '30 minutes') RETURNING id`,
    [tokenHash(draftToken)],
  )
  const uploads = []
  for (const file of input.data.files) {
    const uploadId = crypto.randomUUID()
    const objectKey = `applications/${draft.rows[0].id}/${uploadId}-${safeFileName(file.fileName)}`
    await db.query(
      `INSERT INTO application_uploads (id, draft_id, kind, object_key, original_name, content_type, declared_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uploadId, draft.rows[0].id, file.kind, objectKey, file.fileName, file.contentType, file.size],
    )
    uploads.push({ id: uploadId, kind: file.kind, url: await presignedPut(objectKey, file.contentType), headers: { 'Content-Type': file.contentType } })
  }
  return reply.code(201).send({ draftId: draft.rows[0].id, draftToken, expiresIn: 1800, uploads })
})

app.post('/v1/applications', async (request, reply) => {
  const input = parse(z.object({
    draftId: uuidSchema,
    draftToken: z.string().min(32).max(256),
    jobId: z.string().min(1).max(100),
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
    linkedinUrl: z.string().url().max(500),
  }), request.body)
  if ('error' in input) return validationError(reply, input.error)
  if (await enforceRateLimit(request, reply, 'application-submit', 6, 24 * 60 * 60, stableHash(normalizeEmail(input.data.email)))) return
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const draftResult = await client.query<{ id: string }>(
      `SELECT id FROM application_drafts
       WHERE id = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [input.data.draftId, tokenHash(input.data.draftToken)],
    )
    if (!draftResult.rows[0]) {
      await client.query('ROLLBACK')
      return reply.code(400).send({ error: 'invalid_application_draft', message: 'This upload session is invalid or expired.' })
    }
    const job = await client.query(`SELECT id FROM jobs WHERE id = $1 AND active = true`, [input.data.jobId])
    if (!job.rows[0]) {
      await client.query('ROLLBACK')
      return reply.code(400).send({ error: 'invalid_job', message: 'That role is not currently accepting applications.' })
    }
    const files = await client.query<{ id: string; kind: 'cv' | 'video'; object_key: string; content_type: string; declared_size: string }>(
      `SELECT id, kind, object_key, content_type, declared_size FROM application_uploads WHERE draft_id = $1 FOR UPDATE`,
      [input.data.draftId],
    )
    if (files.rows.filter((file) => file.kind === 'cv').length !== 1) {
      await client.query('ROLLBACK')
      return reply.code(400).send({ error: 'cv_required', message: 'A CV is required.' })
    }
    for (const file of files.rows) {
      let stat
      try {
        stat = await headObject(file.object_key)
      } catch {
        await client.query('ROLLBACK')
        return reply.code(400).send({ error: 'upload_incomplete', message: 'Finish uploading each selected file before submitting.' })
      }
      const rules = allowedUploads[file.kind]
      const storedSize = stat.ContentLength ?? 0
      if (storedSize > rules.max || storedSize !== Number(file.declared_size) || stat.ContentType !== file.content_type) {
        await removeObject(file.object_key)
        await client.query('ROLLBACK')
        return reply.code(400).send({ error: 'upload_size_mismatch', message: 'An uploaded file failed size validation.' })
      }
      await client.query(`UPDATE application_uploads SET stored_size = $1 WHERE id = $2`, [storedSize, file.id])
    }
    const application = await client.query<{ id: string }>(
      `INSERT INTO applications (job_id, full_name, email, linkedin_url, status)
       VALUES ($1, $2, $3, $4, 'pending_scan') RETURNING id`,
      [input.data.jobId, input.data.fullName, normalizeEmail(input.data.email), input.data.linkedinUrl],
    )
    await client.query(`UPDATE application_uploads SET application_id = $1 WHERE draft_id = $2`, [application.rows[0].id, input.data.draftId])
    await client.query(`UPDATE application_drafts SET consumed_at = now() WHERE id = $1`, [input.data.draftId])
    for (const file of files.rows) {
      await enqueueOutbox(client, 'scan', 'scan-application-file', `scan-upload:${file.id}`, {
        uploadId: file.id,
        applicationId: application.rows[0].id,
        objectKey: file.object_key,
        contentType: file.content_type,
      })
    }
    await client.query('COMMIT')
    return reply.code(202).send({ applicationId: application.rows[0].id, status: 'pending_scan' })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  if (reply.sent) return
  reply.code(500).send({ error: 'internal_error', message: 'Something went wrong.' })
})

let shuttingDown = false
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await Promise.all([closeRedis(), closeDb()])
  process.exit(exitCode)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('uncaughtException', (error) => {
  app.log.fatal({ err: error }, 'uncaught exception')
  void shutdown('uncaughtException', 1)
})
process.on('unhandledRejection', (error) => {
  app.log.fatal({ err: error }, 'unhandled rejection')
  void shutdown('unhandledRejection', 1)
})

await prepareDatabase()
await ensureBucket()
await app.listen({ host: '0.0.0.0', port: config.PORT })
