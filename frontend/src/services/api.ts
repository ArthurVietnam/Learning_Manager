export class ApiError extends Error {
  status: number
  error?: {
    code?: string
    message?: string
    fields?: Record<string, string>
  } | null

  constructor(
    status: number,
    error?: {
      code?: string
      message?: string
      fields?: Record<string, string>
    } | null,
  ) {
    super(error?.message ?? `Ошибка API: ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.error = error
  }
}

export function getEnvApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '')
  }
  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }).process
  if (proc?.env?.VITE_API_BASE_URL) {
    return String(proc.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '')
  }
  return 'http://localhost:3000'
}

export const API_BASE_URL = getEnvApiBaseUrl()

export async function apiFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    })
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Ошибка сетевого соединения'
    throw new Error(
      `Node API недоступен (${API_BASE_URL}): ${errorMsg}. Убедитесь, что backend запущен.`,
    )
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(401, {
        code: payload?.error?.code ?? 'UNAUTHORIZED',
        message:
          'Сессия истекла или недействительна. Пожалуйста, выполните вход снова.',
        ...(payload?.error?.fields ? { fields: payload.error.fields } : {}),
      })
    }
    throw new ApiError(response.status, payload?.error)
  }
  return payload.data as T
}
