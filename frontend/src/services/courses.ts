import type { Course } from '../types/course.ts'
import { supabase } from '../lib/supabase.ts'

export function isCourse(value: unknown): value is Course {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    value.id === value.id.trim() &&
    'name' in value &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0
  )
}

export function parseCourses(value: unknown): Course[] {
  if (!Array.isArray(value) || !value.every(isCourse)) {
    throw new Error('Неверная структура справочника курсов.')
  }
  const courses: Course[] = value
  const ids = new Set(courses.map((course) => course.id))
  if (ids.size !== courses.length) {
    throw new Error('В справочнике повторяются идентификаторы.')
  }
  return courses
}

export async function getCourses(signal?: AbortSignal): Promise<Course[]> {
  if (signal?.aborted) {
    throw new DOMException('Запрос отменён', 'AbortError')
  }

  let query = supabase
    .from('courses')
    .select('id, name')
    .order('name')

  if (signal) {
    query = query.abortSignal(signal)
  }

  let data: unknown
  let error: { message: string } | null = null

  try {
    const response = await query
    data = response.data
    error = response.error
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException('Запрос отменён', 'AbortError')
    }
    throw new Error(
      `Не удалось загрузить курсы: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (signal?.aborted) {
    throw new DOMException('Запрос отменён', 'AbortError')
  }

  if (error) {
    throw new Error(`Не удалось загрузить курсы: ${error.message}`)
  }

  return parseCourses(data)
}

