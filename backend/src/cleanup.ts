import { db } from './db.js'
import { removeObject } from './storage.js'

export async function cleanupExpiredData() {
  const expiredDrafts = await db.query<{ id: string; object_key: string }>(
    `SELECT d.id, u.object_key
     FROM application_drafts d
     JOIN application_uploads u ON u.draft_id = d.id
     WHERE d.consumed_at IS NULL AND d.expires_at < now()`,
  )
  for (const row of expiredDrafts.rows) {
    try {
      await removeObject(row.object_key)
    } catch (error) {
      console.error('expired upload cleanup failed', row.id, error)
    }
  }

  await Promise.all([
    db.query(`DELETE FROM application_drafts WHERE consumed_at IS NULL AND expires_at < now()`),
    db.query(`DELETE FROM sessions WHERE expires_at < now()`),
    db.query(`DELETE FROM password_reset_tokens WHERE expires_at < now() OR consumed_at < now() - interval '7 days'`),
    db.query(`DELETE FROM email_verification_tokens WHERE expires_at < now() OR consumed_at < now() - interval '7 days'`),
    db.query(`DELETE FROM enrollment_tickets WHERE expires_at < now() OR consumed_at < now() - interval '1 day'`),
    db.query(`DELETE FROM outbox_events WHERE published_at < now() - interval '7 days'`),
  ])
}
