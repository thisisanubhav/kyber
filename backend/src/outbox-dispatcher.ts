import type { Queue } from 'bullmq'
import { db } from './db.js'

type OutboxEvent = {
  id: string
  topic: 'email' | 'scan'
  event_name: string
  payload: Record<string, unknown>
  attempts: number
}

export async function dispatchOutbox(emailQueue: Queue, scanQueue: Queue) {
  const claimed = await db.query<OutboxEvent>(
    `WITH next AS (
       SELECT id FROM outbox_events
       WHERE published_at IS NULL AND available_at <= now()
         AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
         AND attempts < 20
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 25
     )
     UPDATE outbox_events o
     SET claimed_at = now(), attempts = attempts + 1
     FROM next WHERE o.id = next.id
     RETURNING o.id::text, o.topic, o.event_name, o.payload, o.attempts`,
  )

  for (const event of claimed.rows) {
    try {
      const queue = event.topic === 'email' ? emailQueue : scanQueue
      await queue.add(event.event_name, event.payload, {
        jobId: `outbox-${event.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      })
      await db.query(
        `UPDATE outbox_events
         SET published_at = now(), claimed_at = NULL, payload = '{}'::jsonb, last_error = NULL
         WHERE id = $1`,
        [event.id],
      )
    } catch (error) {
      const delaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8))
      await db.query(
        `UPDATE outbox_events
         SET claimed_at = NULL, available_at = now() + ($2 * interval '1 second'), last_error = $3
         WHERE id = $1`,
        [event.id, delaySeconds, String(error).slice(0, 1000)],
      )
    }
  }
  return claimed.rowCount ?? 0
}
