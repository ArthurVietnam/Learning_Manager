import type { Course } from './course'
import { COURSES } from '../data/courses.ts'

export type AssignmentStatus = 'todo' | 'in_progress' | 'done'

export type AssignmentDifficulty = 'easy' | 'medium' | 'hard'

export interface Assignment {
  id: string
  title: string
  description: string
  courseId: Course['id']
  courseTitle: string
  dueDate: string
  status: AssignmentStatus
  difficulty: AssignmentDifficulty
}

export type AssignmentDraft = Omit<Assignment, 'id'>

export const EMPTY_ASSIGNMENT_DRAFT: AssignmentDraft = {
  title: '',
  description: '',
  courseId: COURSES[0].id,
  courseTitle: COURSES[0].title,
  dueDate: '',
  status: 'todo',
  difficulty: 'medium',
}

export function validateAssignmentDraft(draft: AssignmentDraft): string | null {
  const title = draft.title.trim()
  if (title.length < 3 || title.length > 100) {
    return 'Название должно содержать от 3 до 100 символов.'
  }
  if (!draft.dueDate) {
    return 'Укажите срок сдачи задания.'
  }
  if (!isValidDueDate(draft.dueDate)) {
    return 'Укажите корректную дату сдачи в формате ГГГГ-ММ-ДД.'
  }
  if (!draft.courseId || !COURSES.some((c) => c.id === draft.courseId)) {
    return 'Выберите корректный курс из справочника.'
  }
  if (!isValidAssignmentStatus(draft.status)) {
    return 'Укажите корректный статус задания.'
  }
  if (!isValidAssignmentDifficulty(draft.difficulty)) {
    return 'Укажите корректный уровень сложности.'
  }
  if (draft.status === 'done' && draft.description.trim().length < 5) {
    return 'Для выполненного задания обязательно подробное описание результата (не менее 5 символов).'
  }
  return null
}

export const STATUS_LABELS = {
  todo: 'К выполнению',
  in_progress: 'В процессе',
  done: 'Выполнено',
} as const satisfies Record<AssignmentStatus, string>

export const DIFFICULTY_LABELS = {
  easy: 'Низкая',
  medium: 'Средняя',
  hard: 'Высокая',
} as const satisfies Record<AssignmentDifficulty, string>

export function isValidAssignmentStatus(status: unknown): status is AssignmentStatus {
  return typeof status === 'string' && (status === 'todo' || status === 'in_progress' || status === 'done')
}

export function isValidAssignmentDifficulty(difficulty: unknown): difficulty is AssignmentDifficulty {
  return typeof difficulty === 'string' && (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard')
}

export function isValidDueDate(dueDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return false
  }
  const date = new Date(dueDate)
  return !Number.isNaN(date.getTime())
}

export function isOverdueAssignment(assignment: Assignment, referenceDate: string = '2026-09-28'): boolean {
  if (assignment.status === 'done') {
    return false
  }
  return assignment.dueDate < referenceDate
}

export interface AssignmentStats {
  total: number
  completed: number
  inProgress: number
  todo: number
  overdue: number
}

export function calculateAssignmentStats(
  assignments: Assignment[],
  referenceDate: string = '2026-09-28',
): AssignmentStats {
  let completed = 0
  let inProgress = 0
  let todo = 0
  let overdue = 0

  for (const item of assignments) {
    if (item.status === 'done') {
      completed++
    } else if (item.status === 'in_progress') {
      inProgress++
    } else if (item.status === 'todo') {
      todo++
    }

    if (isOverdueAssignment(item, referenceDate)) {
      overdue++
    }
  }

  return {
    total: assignments.length,
    completed,
    inProgress,
    todo,
    overdue,
  }
}

