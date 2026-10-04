import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import UploadContract from '../components/UploadContract'
import ContractList from '../components/MyList'

export default function ContractsPage() {
  const [email, setEmail] = useState('')

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

  if (user) {
  setEmail(user.email || '')
}
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <div style={{ padding: 40 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>{email}</div>

        <button onClick={logout}>
          Logout
        </button>
      </div>

      <h1>ContractVault</h1>

      <button disabled>
        📷 Take Photo (Coming Soon)
      </button>

      <br />
      <br />

      <UploadContract />

      <br />
      <br />

      <h3>Uploaded Contracts</h3>

      <ContractList />
    </div>
  )
}
``