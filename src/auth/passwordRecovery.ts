export const MIN_PASSWORD_LENGTH = 8

export function validateNewPassword(newPassword: string, confirmPassword: string): string | null {
  if (!newPassword || !confirmPassword) return 'Please enter and confirm your new password.'
  if (newPassword.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  if (newPassword !== confirmPassword) return 'Passwords do not match.'
  return null
}

export function hasRecoveryParameters(): boolean {
  const hash = window.location.hash.replace(/^#/, '')
  const hashParams = hash ? new URLSearchParams(hash) : new URLSearchParams()
  if (hashParams.get('type') === 'recovery') return true

  const queryParams = new URLSearchParams(window.location.search)
  return queryParams.has('code')
}

export function hasInvalidRecoveryParameters(): boolean {
  const hash = window.location.hash.replace(/^#/, '')
  const hashParams = hash ? new URLSearchParams(hash) : new URLSearchParams()
  const queryParams = new URLSearchParams(window.location.search)

  return hashParams.has('error') || hashParams.has('error_code') || hashParams.has('error_description') ||
    queryParams.has('error') || queryParams.has('error_code') || queryParams.has('error_description')
}
