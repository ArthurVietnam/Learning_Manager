import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase.ts'
import type { AuthState } from '../hooks/useAuth.ts'

export interface AppLayoutProps {
  auth?: AuthState
}

export function AppLayout({ auth }: AppLayoutProps) {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    try {
      setIsSigningOut(true)
      setSignOutError('')
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch (err: unknown) {
      setSignOutError(
        err instanceof Error ? err.message : 'Не удалось выйти из системы.',
      )
    } finally {
      setIsSigningOut(false)
    }
  }

  const userEmail =
    auth && auth.status === 'authenticated' ? auth.session.user.email : null

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-inner">
          <h1 className="app-brand">
            <NavLink to="/assignments" className="brand-link">
              Учебный менеджер
            </NavLink>
          </h1>
          <nav className="app-nav" aria-label="Основная навигация">
            <NavLink
              to="/assignments"
              end
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              Задания
            </NavLink>
            <NavLink
              to="/assignments/new"
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              Добавить задание
            </NavLink>
          </nav>

          <div className="app-user-panel">
            {auth?.status === 'authenticated' && (
              <div className="user-info">
                <span className="user-email" title={userEmail || undefined}>
                  {userEmail}
                </span>
                <button
                  type="button"
                  className="button button-secondary button-sm button-signout"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? 'Выход…' : 'Выйти'}
                </button>
              </div>
            )}
            {auth?.status === 'guest' && (
              <NavLink
                to="/auth"
                className="button button-secondary button-sm"
              >
                Войти
              </NavLink>
            )}
          </div>
        </div>
        {signOutError && (
          <div className="signout-error-bar" role="alert">
            {signOutError}
          </div>
        )}
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
