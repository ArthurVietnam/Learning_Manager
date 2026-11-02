import { Navigate, Outlet, useLocation } from 'react-router'
import type { AuthState } from '../hooks/useAuth.ts'

export interface RequireAuthProps {
  auth: AuthState
}

export function RequireAuth({ auth }: RequireAuthProps) {
  const location = useLocation()

  if (auth.status === 'checking') {
    return <p role="status">Проверяем сессию…</p>
  }

  if (auth.status === 'guest') {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
