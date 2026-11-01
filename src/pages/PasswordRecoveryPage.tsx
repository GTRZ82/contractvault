import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../auth/passwordRecovery'

type PasswordRecoveryPageProps = {
  invalid?: boolean
  onComplete: () => void
}

export default function PasswordRecoveryPage({ invalid = false, onComplete }: PasswordRecoveryPageProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [success, setSuccess] = useState(false)

  async function updatePassword() {
    if (isUpdating) return
    const validationError = validateNewPassword(newPassword, confirmPassword)
    if (validationError) {
      setMessage(validationError)
      return
    }

    setIsUpdating(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setIsUpdating(false)

    if (error) {
      setMessage('This password reset link is invalid or has expired. Please request a new one.')
      return
    }

    await supabase.auth.signOut()
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
    setNewPassword('')
    setConfirmPassword('')
    setSuccess(true)
  }

  return (
    <div className="login-shell">
      <div className="login-card recovery-card" role="main">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">CV</div>
          <div>
            <h1>ContractVault</h1>
            <p>Contracts and invoices, organized securely.</p>
          </div>
        </div>

        {invalid ? (
          <>
            <h2>Reset link unavailable</h2>
            <p className="login-message recovery-message">This password reset link is invalid or has expired. Please request a new one.</p>
            <button className="login-primary" type="button" onClick={onComplete}>Back to Login</button>
          </>
        ) : success ? (
          <>
            <h2>Password updated successfully</h2>
            <p className="recovery-success">Your password has been updated. You can now continue to ContractVault.</p>
            <button className="login-primary" type="button" onClick={onComplete}>Continue to Login</button>
          </>
        ) : (
          <form className="recovery-form" onSubmit={(event) => { event.preventDefault(); void updatePassword() }}>
            <h2>Set New Password</h2>
            <label className="login-field">New Password *
              <input type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={isUpdating} />
            </label>
            <label className="login-field">Confirm New Password *
              <input type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={isUpdating} />
            </label>
            {message && <p className="login-message recovery-message" role="alert">{message}</p>}
            <button className="login-primary" type="submit" disabled={isUpdating}>{isUpdating ? 'Updating...' : 'Update Password'}</button>
            <button className="login-link" type="button" onClick={onComplete} disabled={isUpdating}>Back to Login</button>
          </form>
        )}
      </div>
    </div>
  )
}
