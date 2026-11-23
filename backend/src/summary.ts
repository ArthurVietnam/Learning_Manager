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
    public fields?: Record<string, string>,
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

export type CreateTaskInput = {
  courseId: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done'
  dueDate: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export function parseCreateTask(value: unknown): CreateTaskInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Ожидается JSON-объект')
  }

  const record = value as Record<string, unknown>

  if ('owner_id' in record || 'ownerId' in record) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Поле owner_id не принимается клиентом',
      { owner_id: 'Поле owner_id не принимается клиентом' },
    )
  }
  if ('id' in record) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Поле id не принимается клиентом',
      { id: 'Поле id не принимается клиентом' },
    )
  }
  if ('created_at' in record || 'createdAt' in record) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Поле created_at не принимается клиентом',
      { created_at: 'Поле created_at не принимается клиентом' },
    )
  }

  const rawTitle = record.title
  if (typeof rawTitle !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Поле title обязательно',
      { title: 'Поле title обязательно' },
    )
  }
  const title = rawTitle.trim()
  if (title.length < 3 || title.length > 100) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Длина названия должна быть от 3 до 100 символов',
      { title: 'Длина названия должна быть от 3 до 100 символов' },
    )
  }

  const rawCourse =
    record.courseId ?? record.course_id ?? record.tagId ?? record.tag_id
  if (typeof rawCourse !== 'string' || !rawCourse.trim()) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Поле courseId обязательно',
      { courseId: 'Поле courseId обязательно' },
    )
  }
  const courseId = rawCourse.trim()

  if (
    record.description !== undefined &&
    typeof record.description !== 'string'
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Описание должно быть строкой',
      { description: 'Описание должно быть строкой' },
    )
  }
  const description =
    typeof record.description === 'string' ? record.description.trim() : ''

  const status = record.status
  if (status !== 'todo' && status !== 'in_progress' && status !== 'done') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Недопустимый статус (допустимы todo, in_progress, done)',
      { status: 'Недопустимый статус (допустимы todo, in_progress, done)' },
    )
  }

  const rawDueDate = record.dueDate ?? record.due_date
  if (typeof rawDueDate !== 'string' || !isValidIsoDate(rawDueDate)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Срок сдачи (dueDate) должен быть датой YYYY-MM-DD',
      { dueDate: 'Срок сдачи (dueDate) должен быть датой YYYY-MM-DD' },
    )
  }
  const dueDate = rawDueDate

  let difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  const rawDifficulty = record.difficulty ?? record.priority
  if (rawDifficulty !== undefined) {
    if (rawDifficulty === 'easy' || rawDifficulty === 'low') {
      difficulty = 'easy'
    } else if (rawDifficulty === 'medium') {
      difficulty = 'medium'
    } else if (rawDifficulty === 'hard' || rawDifficulty === 'high') {
      difficulty = 'hard'
    } else {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Недопустимая сложность (допустимы easy, medium, hard)',
        { difficulty: 'Недопустимая сложность (допустимы easy, medium, hard)' },
      )
    }
  }

  return {
    courseId,
    title,
    description,
    status,
    dueDate,
    difficulty,
  }
}

export type DateRange = {
  from: string
  to: string
  today: string
}

export function parseDateRange(query: unknown): DateRange {
  const today = new Date().toISOString().slice(0, 10)
  if (!query || typeof query !== 'object') {
    return { from: '1970-01-01', to: '2099-12-31', today }
  }

  const q = query as Record<string, unknown>
  if (q.from !== undefined && typeof q.from !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Параметр from должен быть датой YYYY-MM-DD',
      { from: 'Параметр from должен быть датой YYYY-MM-DD' },
    )
  }
  if (q.to !== undefined && typeof q.to !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Параметр to должен быть датой YYYY-MM-DD',
      { to: 'Параметр to должен быть датой YYYY-MM-DD' },
    )
  }

  const from =
    typeof q.from === 'string' && q.from.trim() ? q.from.trim() : undefined
  const to = typeof q.to === 'string' && q.to.trim() ? q.to.trim() : undefined

  if (from !== undefined && !isValidIsoDate(from)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Параметр from должен быть датой YYYY-MM-DD',
      { from: 'Параметр from должен быть датой YYYY-MM-DD' },
    )
  }
  if (to !== undefined && !isValidIsoDate(to)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Параметр to должен быть датой YYYY-MM-DD',
      { to: 'Параметр to должен быть датой YYYY-MM-DD' },
    )
  }

  const effectiveFrom = from ?? '1970-01-01'
  const effectiveTo = to ?? '2099-12-31'

  if (effectiveFrom > effectiveTo) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Параметр from не может быть позже to',
      { range: 'Параметр from не может быть позже to' },
    )
  }

  if (from && to) {
    const fromTime = new Date(`${from}T00:00:00Z`).getTime()
    const toTime = new Date(`${to}T00:00:00Z`).getTime()
    const diffDays = (toTime - fromTime) / (1000 * 60 * 60 * 24)
    if (diffDays > 3660) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Период выборки превышает допустимый лимит (10 лет)',
        { range: 'Период выборки превышает допустимый лимит (10 лет)' },
      )
    }
  }

  return { from: effectiveFrom, to: effectiveTo, today }
}

export function mapSupabaseError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  if (!error || typeof error !== 'object') {
    return new HttpError(
      500,
      'INTERNAL_ERROR',
      'Непредвиденная ошибка базы данных',
    )
  }

  const err = error as { code?: string; message?: string }
  if (err.code === '23505') {
    return new HttpError(409, 'CONFLICT', 'Конфликт уникальности записи')
  }
  if (err.code === '23503') {
    return new HttpError(
      400,
      'VALIDATION_ERROR',
      'Связанная запись не найдена (нарушение внешнего ключа)',
      { courseId: 'Связанная запись не найдена' },
    )
  }
  if (err.code === '23514') {
    return new HttpError(
      400,
      'VALIDATION_ERROR',
      'Нарушение ограничений целостности данных (CHECK)',
    )
  }
  if (err.code === '42501') {
    return new HttpError(
      403,
      'FORBIDDEN',
      'Доступ запрещён политикой безопасности',
    )
  }
  if (err.code === 'PGRST116') {
    return new HttpError(404, 'NOT_FOUND', 'Запись не найдена')
  }

  return new HttpError(500, 'INTERNAL_ERROR', 'Ошибка базы данных')
}

export async function loadAllTasksForSummary(
  supabase: any,
  range: { from: string; to: string },
): Promise<SummaryTask[]> {
  const pageSize = 500
  const result: SummaryTask[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('assignments')
      .select('status, due_date')
      .gte('due_date', range.from)
      .lte('due_date', range.to)
      .range(from, from + pageSize - 1)

    if (error) {
      throw mapSupabaseError(error)
    }

    if (!data || !Array.isArray(data)) {
      return result
    }

    for (const row of data) {
      result.push({
        status: row.status,
        dueDate: row.due_date ?? null,
      })
    }

    if (data.length < pageSize) {
      return result
    }
  }
}
