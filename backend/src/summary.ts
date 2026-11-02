export type SummaryTask = {
  status: 'todo' | 'in_progress' | 'done'
  dueDate: string | null
}

export type TaskSummary = {
  active: number
  completed: number
  overdue: number
}

export function calculateTaskSummary(
  items: SummaryTask[],
  today: string,
): TaskSummary {
  return {
    active: items.filter((item) => item.status !== 'done').length,
    completed: items.filter((item) => item.status === 'done').length,
    overdue: items.filter(
      (item) =>
        item.status !== 'done' &&
        item.dueDate !== null &&
        item.dueDate !== '' &&
        item.dueDate < today,
    ).length,
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function isSummaryTask(value: unknown): value is SummaryTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  const status = obj.status
  if (status !== 'todo' && status !== 'in_progress' && status !== 'done') {
    return false
  }
  const dueDate = obj.dueDate
  if (dueDate === null) {
    return true
  }
  if (typeof dueDate !== 'string') {
    return false
  }
  return isValidIsoDate(dueDate)
}

export function parseSummaryBody(value: unknown): SummaryTask[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Ожидается JSON-объект')
  }
  const items = (value as { items?: unknown }).items
  if (!Array.isArray(items) || items.length > 500) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'items должен быть массивом до 500 элементов',
    )
  }
  if (!items.every(isSummaryTask)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Проверьте поля элементов')
  }
  return items
}
