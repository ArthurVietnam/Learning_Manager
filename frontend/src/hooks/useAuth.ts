import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'

export type AuthState =
  | { status: 'checking' }
  | { status: 'guest' }
  | { status: 'authenticated'; session: Session }

export function fromSession(session: Session | null): AuthState {
  return session
    ? { status: 'authenticated', session }
    : { status: 'guest' }
}

export function useAuth(): AuthState {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' })

  useEffect(() => {
    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuth(fromSession(session))
    })

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        setAuth((current) =>
          current.status === 'checking'
            ? error
              ? { status: 'guest' }
              : fromSession(data.session)
            : current,
        )
      })
      .catch(() => {
        if (!active) return
        setAuth((current) =>
          current.status === 'checking' ? { status: 'guest' } : current,
        )
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return auth
}
