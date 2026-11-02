import type {
  Assignment,
  AssignmentDraft,
  AssignmentStatus,
  AssignmentDifficulty,
  AssignmentFilters,
} from '../types/assignment.ts'
import { emptyAssignmentFilters } from '../types/assignment.ts'
import type { Course } from '../types/course.ts'
import { supabase } from '../lib/supabase.ts'

export type { AssignmentFilters }
export { emptyAssignmentFilters }

export type AssignmentRow = {
  id: string
  owner_id: string
  course_id: string
  title: string
  description: string
  status: AssignmentStatus
  due_date: string
  difficulty: AssignmentDifficulty
  created_at: string
  courses?: { id: string; name: string } | { id: string; name: string }[] | null
}

export const assignmentColumns = `
  id, owner_id, course_id, title, description,
  status, due_date, difficulty, created_at,
  courses(id, name)
`

export function fromRow(row: AssignmentRow, fallbackCourses?: Course[]): Assignment {
  const embeddedCourseTitle = Array.isArray(row.courses)
    ? row.courses[0]?.name
    : row.courses?.name
  const fallbackCourse = fallbackCourses?.find((c) => c.id === row.course_id)

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    courseId: row.course_id,
    courseTitle: embeddedCourseTitle ?? fallbackCourse?.name ?? row.course_id,
    dueDate: row.due_date,
    status: row.status,
    difficulty: row.difficulty,
  }
}

export function toWrite(draft: AssignmentDraft) {
  return {
    course_id: draft.courseId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    status: draft.status,
    due_date: draft.dueDate,
    difficulty: draft.difficulty,
  }
}

export async function getAssignments(
  filtersOrCourses?: AssignmentFilters | Course[],
  fallbackCourses?: Course[],
): Promise<Assignment[]> {
  let filters: AssignmentFilters = emptyAssignmentFilters
  let courses: Course[] | undefined = fallbackCourses

  if (Array.isArray(filtersOrCourses)) {
    courses = filtersOrCourses
  } else if (filtersOrCourses) {
    filters = filtersOrCourses
  }

  let request = supabase
    .from('assignments')
    .select(assignmentColumns)
    .order('created_at', { ascending: false })

  const query = (filters.query ?? '').trim()
  if (query) {
    request = request.ilike('title', `%${query}%`)
  }
  if (filters.status !== 'all') {
    request = request.eq('status', filters.status)
  }
  if (filters.courseId !== 'all') {
    request = request.eq('course_id', filters.courseId)
  }

  const { data, error } = await request
    .overrideTypes<AssignmentRow[], { merge: false }>()

  if (error) throw new Error(`Не удалось загрузить задачи: ${error.message}`)
  return (data ?? []).map((row) => fromRow(row, courses))
}

export async function getAssignment(
  id: string,
  courses?: Course[],
): Promise<Assignment> {
  const { data, error } = await supabase
    .from('assignments')
    .select(assignmentColumns)
    .eq('id', id)
    .single()
    .overrideTypes<AssignmentRow, { merge: false }>()

  if (error) throw new Error(`Не удалось загрузить задачу: ${error.message}`)
  return fromRow(data, courses)
}

export async function createAssignment(
  draft: AssignmentDraft,
  courses?: Course[],
): Promise<Assignment> {
  const { data, error } = await supabase
    .from('assignments')
    .insert(toWrite(draft))
    .select(assignmentColumns)
    .single()
    .overrideTypes<AssignmentRow, { merge: false }>()

  if (error) throw new Error(`Не удалось создать задачу: ${error.message}`)
  return fromRow(data, courses)
}

export async function updateAssignment(
  id: string,
  draft: AssignmentDraft,
): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update(toWrite(draft))
    .eq('id', id)

  if (error) throw new Error(`Не удалось изменить задачу: ${error.message}`)
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('assignments').delete().eq('id', id)

  if (error) throw new Error(`Не удалось удалить задачу: ${error.message}`)
}
