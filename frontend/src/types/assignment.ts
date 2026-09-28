import type { Course } from './course'

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
