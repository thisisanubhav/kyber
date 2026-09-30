import { closeDb, migrate } from './db.js'

try {
  await migrate()
  console.log('Database migrations completed')
} finally {
  await closeDb()
}
