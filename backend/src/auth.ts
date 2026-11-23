import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Request, Response, NextFunction } from 'express'
import { HttpError } from './summary.js'

// Automatically load .env if not loaded yet
try {
  process.loadEnvFile?.()
} catch {
  // Ignore when .env does not exist or already provided in process.env
}

export interface RequestAuthContext {
  token: string
  userId: string
}

export function verifyEnvAtStartup(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) {
    throw new Error(
      'service_role or secret_key is strictly prohibited on the backend. Use SUPABASE_PUBLISHABLE_KEY only.',
    )
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim()
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim()

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      'Missing required environment variables: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be defined in backend/.env',
    )
  }
}

// Prohibit service_role and secret keys to guarantee RLS boundaries at import time
if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) {
  throw new Error(
    'service_role or secret_key is strictly prohibited on the backend. Use SUPABASE_PUBLISHABLE_KEY only.',
  )
}

export function getSupabaseConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim()
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim()

  if (!supabaseUrl || !publishableKey) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        'Warning: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be defined in backend/.env',
      )
    }
  }

  return {
    supabaseUrl: supabaseUrl || 'https://placeholder.supabase.co',
    publishableKey: publishableKey || 'placeholder_publishable_key',
  }
}

const { supabaseUrl, publishableKey } = getSupabaseConfig()

let defaultAuthClient: SupabaseClient = createClient(supabaseUrl, publishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})

// Test injection helper for offline unit testing
export function setAuthClientForTest(client: SupabaseClient | null) {
  if (client) {
    defaultAuthClient = client
  } else {
    const config = getSupabaseConfig()
    defaultAuthClient = createClient(config.supabaseUrl, config.publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  }
}

export function getAuthClient(): SupabaseClient {
  return defaultAuthClient
}

export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'UNAUTHORIZED', 'Требуется вход'))
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    return next(new HttpError(401, 'UNAUTHORIZED', 'Требуется вход'))
  }

  try {
    const { data, error } = await defaultAuthClient.auth.getUser(token)
    if (error || !data?.user) {
      return next(new HttpError(401, 'UNAUTHORIZED', 'Сессия недействительна'))
    }
    res.locals.auth = { token, userId: data.user.id }
    next()
  } catch (_err) {
    return next(new HttpError(401, 'UNAUTHORIZED', 'Сессия недействительна'))
  }
}

type UserClientFactory = (token: string) => SupabaseClient
let customUserClientFactory: UserClientFactory | null = null

export function setUserClientFactoryForTest(factory: UserClientFactory | null) {
  customUserClientFactory = factory
}

export function createUserClient(token: string): SupabaseClient {
  if (customUserClientFactory) {
    return customUserClientFactory(token)
  }

  const config = getSupabaseConfig()
  return createClient(config.supabaseUrl, config.publishableKey, {
    accessToken: async () => token,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
