import type { FastifyReply, FastifyRequest } from 'fastify'
import { rateLimit } from './redis.js'
import { stableHash } from './security.js'

export function clientIp(request: FastifyRequest) {
  return request.ip || request.socket.remoteAddress || 'unknown'
}

export async function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  namespace: string,
  limit: number,
  seconds: number,
  discriminator = '',
) {
  const identity = stableHash(`${clientIp(request)}:${discriminator}`)
  const result = await rateLimit(`${namespace}:${identity}`, limit, seconds)
  reply.header('X-RateLimit-Remaining', result.remaining)
  if (!result.allowed) {
    return reply.code(429).send({ error: 'rate_limited', message: 'Too many attempts. Please try again later.' })
  }
}

export function validationError(reply: FastifyReply, issues: unknown) {
  return reply.code(400).send({ error: 'validation_error', message: 'Check the submitted fields.', issues })
}
