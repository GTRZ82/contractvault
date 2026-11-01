import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

import ContractsPage from './pages/ContractsPage'
import LoginPage from './pages/LoginPage'
import PasswordRecoveryPage from './pages/PasswordRecoveryPage'
import { hasInvalidRecoveryParameters, hasRecoveryParameters } from './auth/passwordRecovery'

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState<'form' | 'invalid' | null>(null)
  const recoveryModeRef = useRef<'form' | 'invalid' | null>(null)

  useEffect(() => {
    if (hasInvalidRecoveryParameters()) {
      recoveryModeRef.current = 'invalid'
      setRecoveryMode('invalid')
    } else if (hasRecoveryParameters()) {
      recoveryModeRef.current = 'form'
      setRecoveryMode('form')
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (recoveryModeRef.current !== 'invalid') {
          recoveryModeRef.current = 'form'
        }
        setRecoveryMode(recoveryModeRef.current)
        setLoggedIn(false)
        return
      }

      if (recoveryModeRef.current) return

      if (event === 'SIGNED_IN') {
        setLoggedIn(!!session)
      } else if (event === 'SIGNED_OUT') {
        setLoggedIn(false)
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!hasInvalidRecoveryParameters()) {
        setLoggedIn(!!data.session && recoveryModeRef.current === null)
      }
    })

    return () => authListener.subscription.unsubscribe()
  }, [])

  async function exitRecoveryMode() {
    recoveryModeRef.current = null
    setRecoveryMode(null)
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
    await supabase.auth.signOut()
    setLoggedIn(false)
  }

  if (recoveryMode) {
    return <PasswordRecoveryPage invalid={recoveryMode === 'invalid'} onComplete={exitRecoveryMode} />
  }

  return loggedIn ? <ContractsPage /> : <LoginPage />
}