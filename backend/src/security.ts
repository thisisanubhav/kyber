import { createHash, createHmac, randomBytes } from 'node:crypto'
import { hash, verify, Algorithm } from '@node-rs/argon2'
import { config } from './config.js'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function opaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function tokenHash(token: string) {
  return createHmac('sha256', config.TOKEN_PEPPER).update(token).digest('hex')
}

export function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function hashPassword(password: string) {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  })
}

export async function verifyPassword(encoded: string, password: string) {
  return verify(encoded, password)
}

export function safeFileName(value: string) {
  return value.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload'
}

export function matchesDeclaredFileType(header: Buffer, contentType: string) {
  if (contentType === 'application/pdf') return header.subarray(0, 5).toString() === '%PDF-'
  if (contentType === 'application/msword') return header.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return header.subarray(0, 2).toString() === 'PK'
  }
  if (contentType === 'video/mp4' || contentType === 'video/quicktime') return header.subarray(4, 8).toString() === 'ftyp'
  if (contentType === 'video/webm') return header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  return false
}
