import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { config } from './config.js'
import { hashPassword, tokenHash } from './security.js'

const { Pool } = pg
export const db = new Pool({
  connectionString: config.DATABASE_URL,
  max: 12,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
})

export async function migrate() {
  const directory = resolve(process.cwd(), 'migrations')
  const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort()
  for (const file of files) await db.query(await readFile(resolve(directory, file), 'utf8'))
}

async function seedDevelopmentData() {
  const organization = await db.query<{ id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ('Kyber Local', 'kyber-local')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  )

  await db.query(
    `INSERT INTO registration_codes (organization_id, code_hash, label, expires_at, max_uses)
     VALUES ($1, $2, 'Local development code', now() + interval '365 days', 100)
     ON CONFLICT (code_hash) DO NOTHING`,
    [organization.rows[0].id, tokenHash(config.KYBER_SEED_REGISTRATION_CODE)],
  )

  const jobs = [
    ['founding-engineer', 'Founding Engineer — Full Stack'],
    ['optimization-engineer', 'Optimization Engineer'],
    ['operations-research-scientist', 'Operations Research Scientist'],
    ['founding-commercial-lead', 'Founding Commercial Lead'],
  ]
  for (const [id, title] of jobs) {
    await db.query(
      `INSERT INTO jobs (id, title, active) VALUES ($1, $2, true)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, active = true`,
      [id, title],
    )
  }

  const localPassword = await hashPassword('KyberLocal!2026')
  const user = await db.query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, email_verified_at)
     VALUES ('local@joinkyber.test', 'Local Kyber User', $1, now())
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [localPassword],
  )
  await db.query(
    `INSERT INTO memberships (user_id, organization_id, role)
     VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
    [user.rows[0].id, organization.rows[0].id],
  )
}

export async function prepareDatabase() {
  if (config.RUN_MIGRATIONS_ON_START) await migrate()
  if (config.NODE_ENV === 'development') await seedDevelopmentData()
}

export async function closeDb() {
  await db.end()
}
