import test from 'node:test'
import assert from 'node:assert/strict'
import { COURSES } from '../src/data/courses.ts'
import { ASSIGNMENTS } from '../src/data/assignments.ts'
import {
  STATUS_LABELS,
  DIFFICULTY_LABELS,
  isValidAssignmentStatus,
  isValidAssignmentDifficulty,
  isValidDueDate,
  isOverdueAssignment,
  calculateAssignmentStats,
} from '../src/types/assignment.ts'

test('COURSES catalog contains valid reference items', () => {
  assert.ok(COURSES.length >= 5, 'Must have at least 5 courses')

  const idSet = new Set<string>()
  for (const course of COURSES) {
    assert.ok(course.id, 'Course must have id')
    assert.ok(course.title, 'Course must have title')
    assert.ok(course.code, 'Course must have code')
    assert.ok(course.description, 'Course must have description')
    assert.ok(!idSet.has(course.id), `Course id ${course.id} must be unique`)
    idSet.add(course.id)
  }
})

test('ASSIGNMENTS dataset references valid courses and conforms to schema', () => {
  assert.ok(ASSIGNMENTS.length >= 5, 'Must have at least 5 assignments')

  const coursesMap = new Map(COURSES.map((c) => [c.id, c]))
  const idSet = new Set<string>()

  for (const assignment of ASSIGNMENTS) {
    assert.ok(assignment.id, 'Assignment must have an id')
    assert.ok(!idSet.has(assignment.id), `Assignment id ${assignment.id} must be unique`)
    idSet.add(assignment.id)

    assert.ok(assignment.title.trim().length > 0, 'Assignment must have title')
    assert.ok(assignment.description.trim().length > 0, 'Assignment must have description')

    // Link to courses catalog
    assert.ok(coursesMap.has(assignment.courseId), `courseId "${assignment.courseId}" must exist in COURSES`)
    const course = coursesMap.get(assignment.courseId)!
    assert.equal(assignment.courseTitle, course.title, 'courseTitle must match referenced course title')

    // Deadline check
    assert.ok(isValidDueDate(assignment.dueDate), `dueDate "${assignment.dueDate}" must be valid YYYY-MM-DD`)

    // Status and difficulty validation
    assert.ok(isValidAssignmentStatus(assignment.status), `status "${assignment.status}" must be valid`)
    assert.ok(isValidAssignmentDifficulty(assignment.difficulty), `difficulty "${assignment.difficulty}" must be valid`)

    // Labels exist
    assert.ok(STATUS_LABELS[assignment.status], `Label must exist for status "${assignment.status}"`)
    assert.ok(DIFFICULTY_LABELS[assignment.difficulty], `Label must exist for difficulty "${assignment.difficulty}"`)
  }
})

test('Assignment stats correctly aggregates completed, in-progress, todo, and overdue', () => {
  const stats = calculateAssignmentStats(ASSIGNMENTS, '2026-09-28')

  assert.equal(stats.total, ASSIGNMENTS.length, 'Total matches length')
  assert.ok(stats.completed > 0, 'Must have completed tasks')
  assert.ok(stats.inProgress > 0, 'Must have in_progress tasks')
  assert.ok(stats.todo > 0, 'Must have todo tasks')
  assert.ok(stats.overdue > 0, 'Must have overdue tasks for deadline verification')
  assert.equal(stats.completed + stats.inProgress + stats.todo, stats.total, 'Sum of statuses equals total')
})

test('isOverdueAssignment correctly evaluates deadlines', () => {
  const pastDone = {
    id: 't1',
    title: 'Done in past',
    description: 'test',
    courseId: 'c1',
    courseTitle: 'Веб-разработка',
    dueDate: '2026-09-10',
    status: 'done' as const,
    difficulty: 'easy' as const,
  }
  assert.equal(isOverdueAssignment(pastDone, '2026-09-28'), false, 'Done task in past is not overdue')

  const pastTodo = {
    id: 't2',
    title: 'Todo in past',
    description: 'test',
    courseId: 'c1',
    courseTitle: 'Веб-разработка',
    dueDate: '2026-09-10',
    status: 'todo' as const,
    difficulty: 'easy' as const,
  }
  assert.equal(isOverdueAssignment(pastTodo, '2026-09-28'), true, 'Todo task in past is overdue')

  const futureTodo = {
    id: 't3',
    title: 'Todo in future',
    description: 'test',
    courseId: 'c1',
    courseTitle: 'Веб-разработка',
    dueDate: '2026-10-10',
    status: 'todo' as const,
    difficulty: 'easy' as const,
  }
  assert.equal(isOverdueAssignment(futureTodo, '2026-09-28'), false, 'Todo task in future is not overdue')
})
