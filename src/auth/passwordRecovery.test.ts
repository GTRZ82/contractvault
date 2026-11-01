import { describe, expect, it } from 'vitest'
import { validateNewPassword, MIN_PASSWORD_LENGTH } from './passwordRecovery'

describe('password recovery validation', () => {
  it('requires both password fields', () => {
    expect(validateNewPassword('', '')).toBe('Please enter and confirm your new password.')
  })

  it('requires the minimum password length', () => {
    expect(validateNewPassword('1234567', '1234567')).toBe(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  })

  it('requires matching passwords', () => {
    expect(validateNewPassword('password1', 'password2')).toBe('Passwords do not match.')
  })

  it('accepts matching passwords with sufficient length', () => {
    expect(validateNewPassword('password1', 'password1')).toBeNull()
  })
})
