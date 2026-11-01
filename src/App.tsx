import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

import ContractsPage from './pages/ContractsPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session)
    })
  }, [])

  return loggedIn ? <ContractsPage /> : <LoginPage />
}