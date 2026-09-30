import { Queue } from 'bullmq'
import { config } from './config.js'

const redisUrl = new URL(config.REDIS_URL)
export const queueConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
  tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
}

export const emailQueue = new Queue('kyber-email', { connection: queueConnection })
export const scanQueue = new Queue('kyber-file-scan', { connection: queueConnection })

export async function closeQueues() {
  await Promise.all([emailQueue.close(), scanQueue.close()])
}
