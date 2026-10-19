import type { Course } from '../types/course'

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

const baseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
export const COURSES_URL = `${baseUrl}demo/courses.json`

export async function getCourses(signal?: AbortSignal, url: string = COURSES_URL): Promise<Course[]> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Не удалось загрузить курсы: HTTP ${response.status}`)
  }
  const value: unknown = await response.json()
  return parseCourses(value)
}
