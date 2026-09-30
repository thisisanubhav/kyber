import { Redis } from 'ioredis'
import { config } from './config.js'

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
})

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const fullKey = `kyber:rate:${key}`
  const count = await redis.incr(fullKey)
  if (count === 1) await redis.expire(fullKey, windowSeconds)
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
}

export async function closeRedis() {
  await redis.quit()
}
