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
  EMPTY_ASSIGNMENT_DRAFT,
  validateAssignmentDraft,
} from '../src/types/assignment.ts'
import type { Assignment, AssignmentDraft } from '../src/types/assignment.ts'

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

test('EMPTY_ASSIGNMENT_DRAFT conforms to AssignmentDraft contract and schema defaults', () => {
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.title, '')
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.description, '')
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.courseId, COURSES[0].id)
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.courseTitle, COURSES[0].title)
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.dueDate, '')
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.status, 'todo')
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.difficulty, 'medium')
  assert.equal('id' in EMPTY_ASSIGNMENT_DRAFT, false, 'Draft must not have an id field')
})

test('validateAssignmentDraft correctly validates draft fields, boundaries, and subject rules', () => {
  const validDraft: AssignmentDraft = {
    title: 'Корректное задание',
    description: 'Описание задания',
    courseId: COURSES[0].id,
    courseTitle: COURSES[0].title,
    dueDate: '2026-10-15',
    status: 'todo',
    difficulty: 'medium',
  }
  assert.equal(validateAssignmentDraft(validDraft), null)

  // Title boundaries: 3..100 characters
  assert.equal(validateAssignmentDraft({ ...validDraft, title: 'abc' }), null, 'Length 3 title is valid')
  assert.equal(validateAssignmentDraft({ ...validDraft, title: '  abc  ' }), null, 'Trimmed length 3 title is valid')
  assert.equal(validateAssignmentDraft({ ...validDraft, title: 'a'.repeat(100) }), null, 'Length 100 title is valid')

  assert.ok(validateAssignmentDraft({ ...validDraft, title: '' }), 'Empty title is invalid')
  assert.ok(validateAssignmentDraft({ ...validDraft, title: '   ' }), 'Whitespace title is invalid')
  assert.ok(validateAssignmentDraft({ ...validDraft, title: 'ab' }), 'Length 2 title is invalid')
  assert.ok(validateAssignmentDraft({ ...validDraft, title: '  ab  ' }), 'Trimmed length 2 title is invalid')
  assert.ok(validateAssignmentDraft({ ...validDraft, title: 'a'.repeat(101) }), 'Length 101 title is invalid')

  // DueDate validation
  assert.ok(validateAssignmentDraft({ ...validDraft, dueDate: '' }), 'Empty dueDate is invalid')
  assert.ok(validateAssignmentDraft({ ...validDraft, dueDate: 'invalid-date' }), 'Malformed dueDate is invalid')

  // Course, status, and difficulty validation
  assert.ok(
    validateAssignmentDraft({ ...validDraft, courseId: 'non-existent' }),
    'Non-existent courseId is invalid',
  )
  assert.ok(
    validateAssignmentDraft({ ...validDraft, status: 'invalid_status' as unknown as AssignmentDraft['status'] }),
    'Invalid status is invalid',
  )
  assert.ok(
    validateAssignmentDraft({
      ...validDraft,
      difficulty: 'extreme' as unknown as AssignmentDraft['difficulty'],
    }),
    'Invalid difficulty is invalid',
  )

  // Subject validation for done status
  const doneWithoutDesc: AssignmentDraft = {
    ...validDraft,
    status: 'done',
    description: '',
  }
  assert.ok(validateAssignmentDraft(doneWithoutDesc), 'Done assignment must require description')

  const doneWithSpacesDesc: AssignmentDraft = {
    ...validDraft,
    status: 'done',
    description: '     ',
  }
  assert.ok(validateAssignmentDraft(doneWithSpacesDesc), 'Done assignment description cannot be only whitespace')

  const doneWithShortDesc: AssignmentDraft = {
    ...validDraft,
    status: 'done',
    description: '1234',
  }
  assert.ok(validateAssignmentDraft(doneWithShortDesc), 'Done assignment requires at least 5 chars description')

  const doneWith5CharsDesc: AssignmentDraft = {
    ...validDraft,
    status: 'done',
    description: '12345',
  }
  assert.equal(validateAssignmentDraft(doneWith5CharsDesc), null, 'Done assignment with 5 chars is valid')

  const doneWithValidDesc: AssignmentDraft = {
    ...validDraft,
    status: 'done',
    description: 'Выполнено успешно',
  }
  assert.equal(validateAssignmentDraft(doneWithValidDesc), null)

  // Non-done can have empty description
  const todoWithoutDesc: AssignmentDraft = {
    ...validDraft,
    status: 'todo',
    description: '',
  }
  assert.equal(validateAssignmentDraft(todoWithoutDesc), null)
})

test('CRUD operations perform immutable updates to assignments state', () => {
  let list: Assignment[] = ASSIGNMENTS.map((item) => ({ ...item }))
  const initialCount = list.length

  // Create
  const draft: AssignmentDraft = {
    title: 'Новая лабораторная',
    description: 'Описание новой работы',
    courseId: COURSES[0].id,
    courseTitle: COURSES[0].title,
    dueDate: '2026-11-01',
    status: 'todo',
    difficulty: 'easy',
  }

  const newId = crypto.randomUUID()
  const createdList = [...list, { ...draft, id: newId }]
  assert.equal(createdList.length, initialCount + 1)
  assert.equal(list.length, initialCount, 'Original array must remain unmutated')
  const createdItem = createdList.find((item) => item.id === newId)
  assert.ok(createdItem)
  assert.equal(createdItem.title, 'Новая лабораторная')

  // Update
  list = createdList
  const updateDraft: AssignmentDraft = {
    ...draft,
    title: 'Обновленная лабораторная',
    status: 'in_progress',
  }
  const updatedList = list.map((item) => (item.id === newId ? { ...updateDraft, id: item.id } : item))
  assert.equal(updatedList.length, initialCount + 1)
  const updatedItem = updatedList.find((item) => item.id === newId)
  assert.equal(updatedItem?.title, 'Обновленная лабораторная')
  assert.equal(updatedItem?.status, 'in_progress')
  assert.equal(updatedItem?.id, newId, 'ID must remain preserved')
  assert.equal(list.find((item) => item.id === newId)?.title, 'Новая лабораторная', 'Previous list unmutated')

  // Delete
  const deletedList = updatedList.filter((item) => item.id !== newId)
  assert.equal(deletedList.length, initialCount)
  assert.equal(deletedList.find((item) => item.id === newId), undefined)
  assert.equal(updatedList.length, initialCount + 1, 'Previous list unmutated')
})

test('Status filtering correctly segregates assignments and handles both empty states', () => {
  const filterAssignments = (items: Assignment[], status: AssignmentDraft['status'] | 'all') =>
    items.filter((item) => status === 'all' || item.status === status)

  // 1. All filter
  const allFiltered = filterAssignments(ASSIGNMENTS, 'all')
  assert.equal(allFiltered.length, ASSIGNMENTS.length)

  // 2. Specific status filters
  const todoFiltered = filterAssignments(ASSIGNMENTS, 'todo')
  assert.ok(todoFiltered.length > 0)
  assert.ok(todoFiltered.every((item) => item.status === 'todo'))

  const inProgressFiltered = filterAssignments(ASSIGNMENTS, 'in_progress')
  assert.ok(inProgressFiltered.length > 0)
  assert.ok(inProgressFiltered.every((item) => item.status === 'in_progress'))

  const doneFiltered = filterAssignments(ASSIGNMENTS, 'done')
  assert.ok(doneFiltered.length > 0)
  assert.ok(doneFiltered.every((item) => item.status === 'done'))

  // 3. First empty state: Total empty assignments list
  const emptyList: Assignment[] = []
  assert.equal(emptyList.length, 0)
  assert.equal(filterAssignments(emptyList, 'all').length, 0)

  // 4. Second empty state: List has items, but none match the filter
  const onlyTodoItems = ASSIGNMENTS.filter((item) => item.status === 'todo')
  const noDoneMatches = filterAssignments(onlyTodoItems, 'done')
  assert.equal(noDoneMatches.length, 0)
  assert.ok(onlyTodoItems.length > 0, 'Original list is not empty, but filtered results are empty')
})
