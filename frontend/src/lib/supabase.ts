import { createClient } from '@supabase/supabase-js'

function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    return String(import.meta.env[name]).trim()
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  if (proc?.env && proc.env[name]) {
    return String(proc.env[name]).trim()
  }
  return ''
}

const url =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
    ? String(import.meta.env.VITE_SUPABASE_URL).trim()
    : '') || readEnv('VITE_SUPABASE_URL')

const publishableKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
    ? String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).trim()
    : '') || readEnv('VITE_SUPABASE_PUBLISHABLE_KEY')

if (!url || !publishableKey) {
  throw new Error('Не настроены переменные Supabase в .env.local')
}

export const supabase = createClient(url, publishableKey)

