import type { Assignment } from '../types/assignment.ts'

export type SummaryTask = {
  status: 'todo' | 'in_progress' | 'done'
  dueDate: string | null
}

export type TaskSummary = {
  active: number
  completed: number
  overdue: number
}

function getEnvApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '')
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  if (proc?.env?.VITE_API_BASE_URL) {
    return String(proc.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '')
  }
  return 'http://localhost:3000'
}

export const API_BASE_URL = getEnvApiBaseUrl()

export async function getTaskSummary(
  items: Pick<Assignment, 'status' | 'dueDate'>[],
  baseUrl: string = API_BASE_URL,
): Promise<TaskSummary> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  let response: Response
  try {
    response = await fetch(`${normalizedBaseUrl}/api/summary/tasks`, {
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
      `Node API недоступен (${normalizedBaseUrl}): ${errorMsg}. Убедитесь, что backend запущен.`,
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
