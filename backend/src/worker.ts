import net from 'node:net'
import { once } from 'node:events'
import { Worker } from 'bullmq'
import nodemailer from 'nodemailer'
import { config } from './config.js'
import { closeDb, db } from './db.js'
import { closeQueues, emailQueue, queueConnection, scanQueue } from './queues.js'
import { getObject, removeObject } from './storage.js'
import { matchesDeclaredFileType } from './security.js'
import { enqueueOutbox } from './outbox.js'
import { dispatchOutbox } from './outbox-dispatcher.js'
import { cleanupExpiredData } from './cleanup.js'

const mailer = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  requireTLS: config.SMTP_REQUIRE_TLS,
})

async function inspectObject(objectKey: string, contentType: string) {
  const object = await getObject(objectKey)
  if (!object.Body) throw new Error('Object body is empty')
  let bytes = 0
  const headerChunks: Buffer[] = []
  let headerLength = 0
  let sample = ''
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (headerLength < 16) {
      const part = buffer.subarray(0, 16 - headerLength)
      headerChunks.push(part)
      headerLength += part.length
    }
    if (sample.length < 2048) sample += buffer.subarray(0, 2048 - sample.length).toString('utf8')
  }
  if (bytes === 0) throw new Error('Object body is empty')
  if (!matchesDeclaredFileType(Buffer.concat(headerChunks), contentType)) return { clean: false, message: 'File signature does not match its declared type' }
  if (sample.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) return { clean: false, message: 'Local safety scan: test signature FOUND' }
  return { clean: true, message: 'File signature: OK' }
}

async function scanObject(objectKey: string, contentType: string) {
  const inspection = await inspectObject(objectKey, contentType)
  if (!inspection.clean || !config.CLAMAV_ENABLED) return inspection.clean ? { clean: true, message: 'Local safety scan: OK' } : inspection
  const socket = net.createConnection({ host: config.CLAMAV_HOST, port: config.CLAMAV_PORT })
  await once(socket, 'connect')
  socket.write('zINSTREAM\0')
  const object = await getObject(objectKey)
  if (!object.Body) throw new Error('Object body is empty')
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const size = Buffer.allocUnsafe(4)
    size.writeUInt32BE(buffer.length)
    socket.write(size)
    if (!socket.write(buffer)) await once(socket, 'drain')
  }
  socket.write(Buffer.alloc(4))
  const responseChunks: Buffer[] = []
  socket.on('data', (chunk) => responseChunks.push(Buffer.from(chunk)))
  await once(socket, 'end')
  const response = Buffer.concat(responseChunks).toString('utf8').replace(/\0/g, '').trim()
  if (response.includes('FOUND')) return { clean: false, message: response }
  if (!response.includes('OK')) throw new Error(`ClamAV scan failed: ${response || 'empty response'}`)
  return { clean: true, message: response }
}

const emailWorker = new Worker(
  'kyber-email',
  async (job) => {
    if (job.name === 'password-recovery') {
      const { email, name, token } = job.data as { email: string; name: string; token: string }
      const resetUrl = `${config.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`
      await mailer.sendMail({
        from: config.MAIL_FROM_AUTH,
        to: email,
        subject: 'Reset your Kyber password',
        text: `Hi ${name},\n\nReset your Kyber password within 30 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`,
        html: `<p>Hi ${name},</p><p><a href="${resetUrl}">Reset your Kyber password</a> within 30 minutes.</p><p>If you did not request this, you can ignore this message.</p>`,
      })
      return
    }
    if (job.name === 'application-received') {
      const { email, name, title } = job.data as { email: string; name: string; title: string }
      await mailer.sendMail({
        from: config.MAIL_FROM_CAREERS,
        to: email,
        subject: `Application received — ${title}`,
        text: `Hi ${name},\n\nWe received your application for ${title}. The Kyber team will review it.`,
      })
      return
    }
    if (job.name === 'verify-email') {
      const { email, name, token } = job.data as { email: string; name: string; token: string }
      const verificationUrl = `${config.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`
      await mailer.sendMail({
        from: config.MAIL_FROM_AUTH,
        to: email,
        subject: 'Verify your Kyber email',
        text: `Hi ${name},\n\nVerify your Kyber email within 24 hours:\n${verificationUrl}\n\nIf you did not create this account, you can ignore this message.`,
        html: `<p>Hi ${name},</p><p><a href="${verificationUrl}">Verify your Kyber email</a> within 24 hours.</p><p>If you did not create this account, you can ignore this message.</p>`,
      })
      return
    }
    throw new Error(`Unknown email job: ${job.name}`)
  },
  { connection: queueConnection, concurrency: 4 },
)

const scanWorker = new Worker(
  'kyber-file-scan',
  async (job) => {
    const { uploadId, applicationId, objectKey, contentType } = job.data as { uploadId: string; applicationId: string; objectKey: string; contentType: string }
    try {
      const result = await scanObject(objectKey, contentType)
      if (!result.clean) {
        await removeObject(objectKey)
        await db.query(
          `UPDATE application_uploads SET scan_status = 'infected', scan_message = $1 WHERE id = $2`,
          [result.message, uploadId],
        )
        await db.query(`UPDATE applications SET status = 'rejected' WHERE id = $1`, [applicationId])
        return
      }
      await db.query(
        `UPDATE application_uploads SET scan_status = 'clean', scan_message = $1 WHERE id = $2`,
        [result.message, uploadId],
      )
      const remaining = await db.query<{ pending: string; infected: string }>(
        `SELECT
           count(*) FILTER (WHERE scan_status NOT IN ('clean', 'infected'))::text AS pending,
           count(*) FILTER (WHERE scan_status = 'infected')::text AS infected
         FROM application_uploads WHERE application_id = $1`,
        [applicationId],
      )
      if (Number(remaining.rows[0].pending) === 0 && Number(remaining.rows[0].infected) === 0) {
        const client = await db.connect()
        try {
          await client.query('BEGIN')
          const application = await client.query<{ email: string; full_name: string; title: string }>(
            `UPDATE applications a SET status = 'received'
             FROM jobs j WHERE a.id = $1 AND j.id = a.job_id
             RETURNING a.email::text, a.full_name, j.title`,
            [applicationId],
          )
          const item = application.rows[0]
          if (item) {
            await enqueueOutbox(client, 'email', 'application-received', `application-received:${applicationId}`, {
              email: item.email,
              name: item.full_name,
              title: item.title,
            })
          }
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      }
    } catch (error) {
      await db.query(`UPDATE application_uploads SET scan_status = 'failed', scan_message = $1 WHERE id = $2`, [String(error), uploadId])
      throw error
    }
  },
  { connection: queueConnection, concurrency: 2 },
)

emailWorker.on('failed', (job, error) => console.error('email job failed', job?.id, error))
scanWorker.on('failed', (job, error) => {
  console.error('scan job failed', job?.id, error)
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    const { applicationId } = job.data as { applicationId: string }
    void db.query(`UPDATE applications SET status = 'rejected' WHERE id = $1 AND status = 'pending_scan'`, [applicationId])
  }
})

let dispatching = false
let dispatchPromise: Promise<void> | null = null
async function runDispatcher() {
  if (dispatching) return
  dispatching = true
  try {
    while (await dispatchOutbox(emailQueue, scanQueue)) {
      // Drain available batches before yielding to the next interval.
    }
  } catch (error) {
    console.error('outbox dispatch failed', error)
  } finally {
    dispatching = false
  }
}

function scheduleDispatcher() {
  if (dispatchPromise) return
  dispatchPromise = runDispatcher().finally(() => { dispatchPromise = null })
}

const dispatchTimer = setInterval(scheduleDispatcher, 1000)
dispatchTimer.unref()
scheduleDispatcher()

const cleanupTimer = setInterval(() => void cleanupExpiredData().catch((error) => console.error('cleanup failed', error)), 60 * 60 * 1000)
cleanupTimer.unref()
void cleanupExpiredData().catch((error) => console.error('cleanup failed', error))

let shuttingDown = false
async function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(dispatchTimer)
  clearInterval(cleanupTimer)
  await dispatchPromise
  await Promise.all([emailWorker.close(), scanWorker.close()])
  await closeQueues()
  await closeDb()
  process.exit(exitCode)
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
process.on('uncaughtException', (error) => {
  console.error('uncaught worker exception', error)
  void shutdown(1)
})
process.on('unhandledRejection', (error) => {
  console.error('unhandled worker rejection', error)
  void shutdown(1)
})

console.log('Kyber workers started')
