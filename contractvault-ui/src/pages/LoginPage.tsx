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
    <div style={{ padding: 40 }}>
      <h1>ContractVault Login</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <br />
      <br />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <br />
      <br />

      <button onClick={signIn}>
        Login
      </button>

      <br />
      <br />

      <button onClick={resetPassword}>
        Forgot Password?
      </button>

      <br />
      <br />

      <p>{message}</p>
    </div>
  )
}