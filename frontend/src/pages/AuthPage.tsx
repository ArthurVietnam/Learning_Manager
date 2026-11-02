import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router'
import { supabase } from '../lib/supabase.ts'
import type { AuthState } from '../hooks/useAuth.ts'

export interface AuthPageProps {
  auth?: AuthState
}

export function AuthPage({ auth }: AuthPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/assignments'
  const destination = !from || from === '/auth' ? '/assignments' : from

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  if (auth?.status === 'checking') {
    return <p role="status">Проверяем сессию…</p>
  }

  if (auth?.status === 'authenticated') {
    return <Navigate to={destination} replace />
  }

  function handleModeChange(nextMode: 'signin' | 'signup') {
    if (pending) return
    setMode(nextMode)
    setError('')
    setMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Укажите адрес электронной почты.')
      return
    }

    if (password.length < 6) {
      setError('Пароль должен содержать не менее 6 символов.')
      return
    }

    setError('')
    setMessage('')
    setPending(true)

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        })

        if (signUpError) throw signUpError

        if (data.session) {
          navigate(destination, { replace: true })
        } else {
          setMessage('Проверьте почту и подтвердите регистрацию.')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })

        if (signInError) throw signInError

        navigate(destination, { replace: true })
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Произошла непредвиденная ошибка аутентификации.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <h2>{mode === 'signin' ? 'Вход в систему' : 'Регистрация'}</h2>
          <p className="page-subtitle">
            {mode === 'signin'
              ? 'Войдите со своим email и паролем для доступа к личным заданиям.'
              : 'Создайте учётную запись для ведения личных учебных заданий.'}
          </p>
        </header>

        <div className="auth-mode-tabs" role="tablist" aria-label="Режим аутентификации">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => handleModeChange('signin')}
            disabled={pending}
          >
            Вход
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => handleModeChange('signup')}
            disabled={pending}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="auth-form">
          <div className="form-group">
            <label htmlFor="auth-email" className="form-label">
              Электронная почта <span className="form-required">*</span>
            </label>
            <input
              id="auth-email"
              className="form-input"
              type="email"
              autoComplete="email"
              value={email}
              required
              disabled={pending}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password" className="form-label">
              Пароль <span className="form-required">*</span>
            </label>
            <input
              id="auth-password"
              className="form-input"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              required
              disabled={pending}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="auth-notice-message" role="status">
              {message}
            </p>
          )}

          <div className="auth-form-actions">
            <button
              type="submit"
              className="button button-primary button-block"
              disabled={pending}
            >
              {pending
                ? mode === 'signin'
                  ? 'Входим…'
                  : 'Регистрируемся…'
                : mode === 'signin'
                  ? 'Войти'
                  : 'Зарегистрироваться'}
            </button>
          </div>
        </form>

        <footer className="auth-footer">
          {mode === 'signin' ? (
            <p>
              Нет учётной записи?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => handleModeChange('signup')}
                disabled={pending}
              >
                Зарегистрироваться
              </button>
            </p>
          ) : (
            <p>
              Уже зарегистрированы?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => handleModeChange('signin')}
                disabled={pending}
              >
                Войти
              </button>
            </p>
          )}
        </footer>
      </div>
    </div>
  )
}
