import type { Pool, PoolClient } from 'pg'

type Queryable = Pick<Pool | PoolClient, 'query'>

export async function enqueueOutbox(
  database: Queryable,
  topic: 'email' | 'scan',
  eventName: string,
  dedupeKey: string,
  payload: Record<string, unknown>,
) {
  await database.query(
    `INSERT INTO outbox_events (topic, event_name, dedupe_key, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [topic, eventName, dedupeKey, JSON.stringify(payload)],
  )
}
