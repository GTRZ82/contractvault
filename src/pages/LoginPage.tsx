import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    window.location.reload()
  }

  async function resetPassword() {
    if (!email) {
      setMessage('Please enter your email address first')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Password reset email sent')
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">CV</div>
          <div>
            <h1>ContractVault</h1>
            <p>Contracts and invoices, organized securely.</p>
          </div>
        </div>

        <label className="login-field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="login-field">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>

        <button className="login-primary" onClick={signIn}>Login</button>
        <button className="login-link" onClick={resetPassword}>Forgot Password?</button>
        {message && <p className="login-message">{message}</p>}
      </div>
    </div>
  )
}