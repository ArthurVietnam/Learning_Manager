import type { Assignment } from '../types/assignment.ts'
import { apiFetch, ApiError, API_BASE_URL } from './api.ts'

export type SummaryTask = {
  status: 'todo' | 'in_progress' | 'done'
  dueDate: string | null
}

export type TaskSummary = {
  active: number
  completed: number
  overdue: number
}

export type SummaryDateRange = {
  from?: string
  to?: string
}

export { API_BASE_URL, ApiError }

/**
 * Lab 9: Server-side summary calculation via GET /api/summary.
 * Queries Supabase through request-scoped client under user context and returns computed metrics.
 */
export async function getTaskSummaryApi(
  range: SummaryDateRange = {},
  accessToken: string,
): Promise<TaskSummary> {
  const queryParams = new URLSearchParams()
  if (range.from) queryParams.set('from', range.from)
  if (range.to) queryParams.set('to', range.to)
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''

  return apiFetch<TaskSummary>(`/api/summary${queryString}`, accessToken)
}

/**
 * Universal summary getter supporting both Lab 9 authorized GET and Lab 8 backward-compatible POST.
 */
export async function getTaskSummary(
  rangeOrItemsOrToken:
    | SummaryDateRange
    | Pick<Assignment, 'status' | 'dueDate'>[]
    | string,
  tokenOrBaseUrl?: string,
  _customBaseUrl?: string,
): Promise<TaskSummary> {
  // Case 1: Lab 8 legacy call passing items array: getTaskSummary(items, baseUrl?)
  if (Array.isArray(rangeOrItemsOrToken)) {
    const items = rangeOrItemsOrToken
    const baseUrl = (tokenOrBaseUrl || API_BASE_URL).replace(/\/+$/, '')
    let response: Response
    try {
      response = await fetch(`${baseUrl}/api/summary/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ status, dueDate }) => ({
            status,
            dueDate: dueDate && dueDate.trim() !== '' ? dueDate.trim() : null,
          })),
        }),
      })
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Ошибка сетевого соединения'
      throw new Error(
        `Node API недоступен (${baseUrl}): ${errorMsg}. Убедитесь, что backend запущен.`,
      )
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: TaskSummary; error?: { message?: string; code?: string } }
      | null

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ?? `Ошибка API: ${response.status}`,
      )
    }

    if (!payload?.data) {
      throw new Error('Ответ сервера не содержит данных сводки.')
    }

    return payload.data
  }

  // Case 2: Lab 9 string token shorthand: getTaskSummary(accessToken)
  if (typeof rangeOrItemsOrToken === 'string') {
    const accessToken = rangeOrItemsOrToken
    return getTaskSummaryApi({}, accessToken)
  }

  // Case 3: Lab 9 range object: getTaskSummary({ from, to }, accessToken)
  const range = rangeOrItemsOrToken ?? {}
  const accessToken = tokenOrBaseUrl ?? ''
  return getTaskSummaryApi(range, accessToken)
}
