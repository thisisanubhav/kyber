import { describe, expect, it } from 'vitest'
import { EMAIL_PATTERN, hashPassword, matchesDeclaredFileType, normalizeEmail, opaqueToken, tokenHash, verifyPassword } from './security.js'

describe('security primitives', () => {
  it('normalizes and validates email addresses before lookup', () => {
    expect(normalizeEmail(' Person@Example.COM ')).toBe('person@example.com')
    expect(EMAIL_PATTERN.test('person@example.com')).toBe(true)
    expect(EMAIL_PATTERN.test('invalid-email')).toBe(false)
  })

  it('hashes passwords with Argon2id and verifies without retaining plaintext', async () => {
    const encoded = await hashPassword('A-long-local-password!')
    expect(encoded).not.toContain('A-long-local-password!')
    await expect(verifyPassword(encoded, 'A-long-local-password!')).resolves.toBe(true)
    await expect(verifyPassword(encoded, 'wrong-password')).resolves.toBe(false)
  })

  it('generates opaque one-way token identifiers', () => {
    const token = opaqueToken()
    expect(token.length).toBeGreaterThanOrEqual(40)
    expect(tokenHash(token)).not.toContain(token)
    expect(tokenHash(token)).toBe(tokenHash(token))
  })

  it('checks uploaded file signatures instead of trusting a declared MIME type', () => {
    expect(matchesDeclaredFileType(Buffer.from('%PDF-1.4'), 'application/pdf')).toBe(true)
    expect(matchesDeclaredFileType(Buffer.from('not a PDF'), 'application/pdf')).toBe(false)
    expect(matchesDeclaredFileType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'video/webm')).toBe(true)
  })
})
