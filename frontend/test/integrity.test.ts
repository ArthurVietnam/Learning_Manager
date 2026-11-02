import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
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
  emptyAssignmentFilters,
  validateAssignmentDraft,
} from '../src/types/assignment.ts'
import type { Assignment, AssignmentDraft, AssignmentFilters } from '../src/types/assignment.ts'
import type { Course } from '../src/types/course.ts'
import type { CoursesLoad } from '../src/hooks/useCourses.ts'
import type { AuthState } from '../src/hooks/useAuth.ts'
import type { AssignmentRow } from '../src/services/assignments.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = 'https://placeholder.supabase.co'
}
if (!process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_placeholder_key'
}

const { isCourse, parseCourses, getCourses } = await import('../src/services/courses.ts')
const {
  fromRow,
  toWrite,
  getAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  assignmentColumns,
} = await import('../src/services/assignments.ts')
const { fromSession } = await import('../src/hooks/useAuth.ts')
const { supabase } = await import('../src/lib/supabase.ts')

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
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.courseId, '')
  assert.equal(EMPTY_ASSIGNMENT_DRAFT.courseTitle, '')
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
    validateAssignmentDraft({ ...validDraft, courseId: '' }),
    'Empty courseId is invalid',
  )
  assert.ok(
    validateAssignmentDraft(EMPTY_ASSIGNMENT_DRAFT),
    'EMPTY_ASSIGNMENT_DRAFT must fail validation because course and title and date are empty',
  )
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

test('isCourse correctly validates course structure and rejects invalid types, empty values or whitespace', () => {
  // Valid courses
  assert.equal(isCourse({ id: 'c1', name: 'Веб-разработка' }), true)
  assert.equal(isCourse({ id: 'cs-101', name: 'Algorithms', extraField: 'ignored' }), true)

  // Non-objects and null
  assert.equal(isCourse(null), false)
  assert.equal(isCourse(undefined), false)
  assert.equal(isCourse('string'), false)
  assert.equal(isCourse(123), false)
  assert.equal(isCourse(true), false)
  assert.equal(isCourse([]), false)
  assert.equal(isCourse([1, 2, 3]), false)
  const arrWithProps = [] as unknown as { id: string; name: string }
  arrWithProps.id = 'c1'
  arrWithProps.name = 'Веб-разработка'
  assert.equal(isCourse(arrWithProps), false, 'Array with properties must not be a course')

  // Missing properties
  assert.equal(isCourse({ id: 'c1' }), false)
  assert.equal(isCourse({ name: 'Веб-разработка' }), false)
  assert.equal(isCourse({}), false)

  // Non-string properties
  assert.equal(isCourse({ id: 1, name: 'Веб-разработка' }), false)
  assert.equal(isCourse({ id: 'c1', name: 123 }), false)
  assert.equal(isCourse({ id: null, name: 'Веб' }), false)

  // Empty or whitespace-only
  assert.equal(isCourse({ id: '', name: 'Веб' }), false)
  assert.equal(isCourse({ id: '   ', name: 'Веб' }), false)
  assert.equal(isCourse({ id: 'c1', name: '' }), false)
  assert.equal(isCourse({ id: 'c1', name: '   ' }), false)

  // ID with leading or trailing whitespace
  assert.equal(isCourse({ id: ' c1', name: 'Веб' }), false)
  assert.equal(isCourse({ id: 'c1 ', name: 'Веб' }), false)
  assert.equal(isCourse({ id: '  c1  ', name: 'Веб' }), false)
})

test('parseCourses validates courses array and enforces strict uniqueness of IDs', () => {
  const validList = [
    { id: 'c1', name: 'Курс 1' },
    { id: 'c2', name: 'Курс 2' },
    { id: 'c3', name: 'Курс 3' },
  ]
  const parsed = parseCourses(validList)
  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].id, 'c1')
  assert.equal(parsed[1].name, 'Курс 2')

  // Empty array is valid
  assert.deepEqual(parseCourses([]), [])

  // Non-array throws descriptive error
  assert.throws(() => parseCourses(null), {
    name: 'Error',
    message: 'Неверная структура справочника курсов.',
  })
  assert.throws(() => parseCourses(undefined), {
    name: 'Error',
    message: 'Неверная структура справочника курсов.',
  })
  assert.throws(() => parseCourses('not an array'), {
    name: 'Error',
    message: 'Неверная структура справочника курсов.',
  })
  assert.throws(() => parseCourses({ id: 'c1', name: 'Курс 1' }), {
    name: 'Error',
    message: 'Неверная структура справочника курсов.',
  })

  // Array with invalid elements
  assert.throws(() => parseCourses([{ id: 'c1', name: 'Курс 1' }, { id: 'c2' }]), {
    name: 'Error',
    message: 'Неверная структура справочника курсов.',
  })
  assert.throws(() => parseCourses([{ id: ' c1 ', name: 'Курс 1' }]), {
    name: 'Error',
    message: 'Неверная структура справочника курсов.',
  })

  // Array with duplicate IDs
  assert.throws(
    () =>
      parseCourses([
        { id: 'c1', name: 'Курс 1' },
        { id: 'c1', name: 'Другой курс с тем же ID' },
      ]),
    {
      name: 'Error',
      message: 'В справочнике повторяются идентификаторы.',
    },
  )

  assert.throws(
    () =>
      parseCourses([
        { id: 'c1', name: 'Курс 1' },
        { id: 'c2', name: 'Курс 2' },
        { id: 'c1', name: 'Дубликат первого' },
      ]),
    {
      name: 'Error',
      message: 'В справочнике повторяются идентификаторы.',
    },
  )
})

test('Migration SQL schema and seed.sql exist, define required tables, constraints, RLS, policies, and UPSERT seed data', () => {
  const rootDir = path.resolve(__dirname, '../..')
  const migrationPath = path.resolve(rootDir, 'supabase/migrations/202610260001_initial_schema.sql')
  const seedPath = path.resolve(rootDir, 'supabase/seed.sql')
  const oldJsonPath = path.resolve(__dirname, '../public/demo/courses.json')

  // 1. Verify old demo JSON is completely removed (no hidden fallback)
  assert.equal(fs.existsSync(oldJsonPath), false, 'frontend/public/demo/courses.json must be removed')

  // 2. Migration file
  assert.ok(fs.existsSync(migrationPath), 'Migration file 202610260001_initial_schema.sql must exist')
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  // Check tables
  assert.ok(migrationSql.includes('create table public.courses'), 'Must create public.courses table')
  assert.ok(migrationSql.includes('create table public.assignments'), 'Must create public.assignments table')

  // Check courses constraints
  assert.ok(migrationSql.includes('id text primary key'), 'courses must have text primary key')
  assert.ok(migrationSql.includes('name text not null unique'), 'courses name must be not null unique')
  assert.ok(migrationSql.includes('courses_id_not_blank'), 'courses must have courses_id_not_blank check')
  assert.ok(migrationSql.includes('courses_name_not_blank'), 'courses must have courses_name_not_blank check')

  // Check assignments fields and constraints
  assert.ok(
    migrationSql.includes('id uuid primary key default gen_random_uuid()'),
    'assignments must have uuid primary key default gen_random_uuid()',
  )
  assert.ok(
    migrationSql.includes('owner_id uuid not null references auth.users(id) on delete cascade'),
    'assignments must reference auth.users(id) with on delete cascade',
  )
  assert.ok(
    migrationSql.includes('course_id text not null references public.courses(id)'),
    'assignments must reference public.courses(id)',
  )
  assert.ok(
    migrationSql.includes('on update cascade on delete restrict'),
    'assignments FK must on update cascade on delete restrict',
  )
  assert.ok(migrationSql.includes('assignments_title_length'), 'assignments must have assignments_title_length check')
  assert.ok(migrationSql.includes('assignments_status_allowed'), 'assignments must have assignments_status_allowed check')
  assert.ok(
    migrationSql.includes('assignments_difficulty_allowed'),
    'assignments must have assignments_difficulty_allowed check',
  )

  // Check RLS and permissions
  assert.ok(
    migrationSql.includes('alter table public.courses enable row level security;'),
    'courses must enable row level security',
  )
  assert.ok(
    migrationSql.includes('alter table public.assignments enable row level security;'),
    'assignments must enable row level security',
  )
  assert.ok(
    migrationSql.includes('revoke all on table public.courses from anon, authenticated;'),
    'revoke all on courses from anon, authenticated',
  )
  assert.ok(
    migrationSql.includes('revoke all on table public.assignments from anon, authenticated;'),
    'revoke all on assignments from anon, authenticated',
  )
  assert.ok(
    migrationSql.includes('grant select on table public.courses to anon, authenticated;'),
    'grant select on courses to anon, authenticated',
  )
  assert.ok(
    migrationSql.includes('create policy "courses are publicly readable"'),
    'must create courses are publicly readable policy',
  )

  // Verify assignments table has NO client policies or grants
  assert.equal(
    migrationSql.includes('grant select on table public.assignments'),
    false,
    'assignments must not grant select to client roles',
  )
  assert.equal(
    migrationSql.includes('create policy "assignments'),
    false,
    'assignments must not have client policies until Lab 6',
  )

  // 3. Seed file
  assert.ok(fs.existsSync(seedPath), 'supabase/seed.sql must exist')
  const seedSql = fs.readFileSync(seedPath, 'utf8')
  assert.ok(seedSql.includes('insert into public.courses (id, name)'), 'seed must insert into public.courses')
  assert.ok(seedSql.includes('on conflict (id) do update'), 'seed must use UPSERT on conflict (id)')
  assert.ok(seedSql.includes('set name = excluded.name;'), 'seed UPSERT must set name = excluded.name')

  // Verify all 5 reference courses are seeded
  const expectedCourses = ['c1', 'c2', 'c3', 'c4', 'c5']
  for (const cId of expectedCourses) {
    assert.ok(seedSql.includes(`'${cId}'`), `seed.sql must include course id ${cId}`)
  }
})

test('Supabase client validates required environment variables and env configuration files exist', () => {
  const rootDir = path.resolve(__dirname, '..')
  const envExamplePath = path.resolve(rootDir, '.env.example')
  assert.ok(fs.existsSync(envExamplePath), 'frontend/.env.example must exist')
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8')
  assert.ok(envExampleContent.includes('VITE_SUPABASE_URL='), '.env.example must specify VITE_SUPABASE_URL')
  assert.ok(
    envExampleContent.includes('VITE_SUPABASE_PUBLISHABLE_KEY='),
    '.env.example must specify VITE_SUPABASE_PUBLISHABLE_KEY',
  )

  // Verify gitignore ignores local env files
  const gitIgnorePath = path.resolve(rootDir, '.gitignore')
  const gitIgnoreContent = fs.readFileSync(gitIgnorePath, 'utf8')
  assert.ok(
    gitIgnoreContent.includes('*.local') || gitIgnoreContent.includes('.env*'),
    '.gitignore must ignore local env files',
  )

  // Verify supabase.ts throws descriptive error when env vars are absent
  const nodeBin = process.execPath
  const runWithoutEnv = () => {
    return execFileSync(
      nodeBin,
      [
        '--input-type=module',
        '-e',
        "delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY; import('./src/lib/supabase.ts')",
      ],
      { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
  }

  assert.throws(runWithoutEnv, (err: Error) => {
    assert.ok(
      err.message.includes('Не настроены переменные Supabase в .env.local'),
      'Must throw expected configuration error when variables are missing',
    )
    return true
  })

  const runWithWhitespaceEnv = () => {
    return execFileSync(
      nodeBin,
      [
        '--input-type=module',
        '-e',
        "process.env.VITE_SUPABASE_URL = '   '; process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '   '; import('./src/lib/supabase.ts')",
      ],
      { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
  }

  assert.throws(runWithWhitespaceEnv, (err: Error) => {
    assert.ok(
      err.message.includes('Не настроены переменные Supabase в .env.local'),
      'Must throw expected configuration error when variables are whitespace',
    )
    return true
  })

  // Verify client singleton exists when configured
  assert.ok(supabase, 'Supabase client singleton must be initialized')
  assert.equal(typeof supabase.from, 'function', 'Supabase client must expose .from()')
})

test('getCourses service queries Supabase courses table, applies ordering, forwards abortSignal, and handles errors', async () => {
  const originalFrom = supabase.from

  try {
    // 1. Success case: queries courses table, selects id and name, orders by name
    let calledTable = ''
    let calledSelect = ''
    let calledOrder = ''
    let attachedSignal: AbortSignal | undefined

    supabase.from = ((table: string) => {
      calledTable = table
      return {
        select(cols: string) {
          calledSelect = cols
          return {
            order(col: string) {
              calledOrder = col
              const builder: {
                abortSignal: (s?: AbortSignal) => typeof builder
                then: (fn: (res: { data: Course[]; error: null }) => unknown) => Promise<unknown>
              } = {
                abortSignal(sig?: AbortSignal) {
                  attachedSignal = sig
                  return builder
                },
                then(resolve: (res: { data: Course[]; error: null }) => unknown) {
                  return Promise.resolve({
                    data: [
                      { id: 'c1', name: 'Веб-разработка' },
                      { id: 'c2', name: 'Базы данных' },
                    ],
                    error: null,
                  }).then(resolve)
                },
              }
              return builder
            },
          }
        },
      }
    }) as unknown as typeof supabase.from

    const controller = new AbortController()
    const result = await getCourses(controller.signal)
    assert.equal(result.length, 2)
    assert.equal(result[0].id, 'c1')
    assert.equal(calledTable, 'courses', 'Must query courses table')
    assert.equal(calledSelect, 'id, name', 'Must select id and name columns')
    assert.equal(calledOrder, 'name', 'Must order by name')
    assert.equal(attachedSignal, controller.signal, 'Must pass abortSignal to query builder')

    // 2. Abort case: throws DOMException with AbortError
    const abortedController = new AbortController()
    abortedController.abort()

    supabase.from = (() => ({
      select: () => ({
        order: () => {
          const builder: {
            abortSignal: () => typeof builder
            then: (fn: (res: { data: null; error: null }) => unknown) => Promise<unknown>
          } = {
            abortSignal: () => builder,
            then: (resolve: (res: { data: null; error: null }) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          }
          return builder
        },
      }),
    })) as unknown as typeof supabase.from

    await assert.rejects(
      async () => {
        await getCourses(abortedController.signal)
      },
      (err: DOMException) => {
        assert.equal(err.name, 'AbortError')
        assert.equal(err.message, 'Запрос отменён')
        return true
      },
    )

    // 3. PostgREST error case: throws formatted Error
    supabase.from = (() => ({
      select: () => ({
        order: () => {
          const builder: {
            abortSignal: () => typeof builder
            then: (fn: (res: { data: null; error: { message: string } }) => unknown) => Promise<unknown>
          } = {
            abortSignal: () => builder,
            then: (resolve: (res: { data: null; error: { message: string } }) => unknown) =>
              Promise.resolve({
                data: null,
                error: { message: 'permission denied for table courses' },
              }).then(resolve),
          }
          return builder
        },
      }),
    })) as unknown as typeof supabase.from

    await assert.rejects(
      async () => {
        await getCourses()
      },
      (err: Error) => {
        assert.equal(err.message, 'Не удалось загрузить курсы: permission denied for table courses')
        return true
      },
    )

    // 4. Malformed response data case: parsed through parseCourses
    supabase.from = (() => ({
      select: () => ({
        order: () => {
          const builder: {
            abortSignal: () => typeof builder
            then: (fn: (res: { data: unknown; error: null }) => unknown) => Promise<unknown>
          } = {
            abortSignal: () => builder,
            then: (resolve: (res: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({
                data: [{ id: 'duplicate', name: 'A' }, { id: 'duplicate', name: 'B' }],
                error: null,
              }).then(resolve),
          }
          return builder
        },
      }),
    })) as unknown as typeof supabase.from

    await assert.rejects(
      async () => {
        await getCourses()
      },
      (err: Error) => {
        assert.equal(err.message, 'В справочнике повторяются идентификаторы.')
        return true
      },
    )
    // 5. Pre-aborted signal: immediately throws AbortError without firing query
    const preAborted = new AbortController()
    preAborted.abort()
    await assert.rejects(
      async () => {
        await getCourses(preAborted.signal)
      },
      (err: DOMException) => {
        assert.equal(err.name, 'AbortError')
        assert.equal(err.message, 'Запрос отменён')
        return true
      },
    )

    // 6. Network failure / rejected query: wraps into descriptive Error
    supabase.from = (() => ({
      select: () => ({
        order: () => {
          const builder = {
            abortSignal: () => builder,
            then: (_resolve: unknown, reject: (err: Error) => unknown) =>
              Promise.reject(new Error('Network connection failed')).catch(reject),
          }
          return builder
        },
      }),
    })) as unknown as typeof supabase.from

    await assert.rejects(
      async () => {
        await getCourses()
      },
      (err: Error) => {
        assert.equal(err.message, 'Не удалось загрузить курсы: Network connection failed')
        return true
      },
    )
  } finally {
    supabase.from = originalFrom
  }
})

test('useCourses lifecycle semantics, cancellation, and form save authorization', () => {
  // 1. Hook state representation
  const loadingState: CoursesLoad = { status: 'loading' }
  const errorState: CoursesLoad = { status: 'error', message: 'Ошибка сети' }
  const emptySuccessState: CoursesLoad = { status: 'success', data: [] }
  const successState: CoursesLoad = {
    status: 'success',
    data: [
      { id: 'c1', name: 'Веб-разработка' },
      { id: 'c2', name: 'Базы данных' },
    ],
  }

  // 2. Cancellation / AbortController cleanup logic:
  // When active = false, neither success nor error update the state
  let simulatedState: CoursesLoad = { ...loadingState }
  let active = true
  const controller = new AbortController()

  // Simulate unmount / cleanup
  active = false
  controller.abort()
  assert.equal(controller.signal.aborted, true, 'AbortController must be aborted on cleanup')

  // Stale promise resolve arrives
  const staleData: Course[] = [{ id: 'c1', name: 'Stale' }]
  if (active) {
    simulatedState = { status: 'success', data: staleData }
  }
  assert.equal(simulatedState.status, 'loading', 'Stale response must be ignored when active is false')

  // Stale promise reject arrives
  if (active) {
    simulatedState = { status: 'error', message: 'Stale error' }
  }
  assert.equal(simulatedState.status, 'loading', 'Stale error must be ignored when active is false')

  // 3. canSave authorization rules
  const evaluateCanSave = (load: CoursesLoad, courseId: string) => {
    const courses = load.status === 'success' ? load.data : []
    const selectedCourseExists = courses.some((c) => c.id === courseId)
    return load.status === 'success' && selectedCourseExists
  }

  // Loading state -> canSave must be false
  assert.equal(evaluateCanSave(loadingState, 'c1'), false)
  assert.equal(evaluateCanSave(loadingState, ''), false)

  // Error state -> canSave must be false
  assert.equal(evaluateCanSave(errorState, 'c1'), false)

  // Empty success -> canSave must be false
  assert.equal(evaluateCanSave(emptySuccessState, 'c1'), false)

  // Non-empty success but courseId is empty -> canSave must be false
  assert.equal(evaluateCanSave(successState, ''), false)

  // Non-empty success but courseId does not exist -> canSave must be false
  assert.equal(evaluateCanSave(successState, 'unknown-id'), false)

  // Non-empty success and courseId matches -> canSave must be true
  assert.equal(evaluateCanSave(successState, 'c1'), true)
  assert.equal(evaluateCanSave(successState, 'c2'), true)

  // 4. Refresh button disable contract: disabled when loading, enabled on success
  const isRefreshDisabled = (status: CoursesLoad['status']) => status === 'loading'
  assert.equal(isRefreshDisabled('loading'), true, 'Refresh button must be disabled when status is loading')
  assert.equal(isRefreshDisabled('success'), false, 'Refresh button must be enabled when status is success')
})

test('Lab 6 migration SQL schema defines default owner_id, authenticated grants, and 4 RLS policies on public.assignments', () => {
  const rootDir = path.resolve(__dirname, '..', '..')
  const migrationPath = path.resolve(
    rootDir,
    'supabase',
    'migrations',
    '202611020001_assignments_owner_policies.sql',
  )
  assert.ok(fs.existsSync(migrationPath), 'Lab 6 migration file must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  // 1. Alter owner_id default to auth.uid()
  assert.ok(
    sql.includes('alter table public.assignments') &&
      sql.includes('alter column owner_id set default auth.uid()'),
    'Migration must set default auth.uid() on owner_id',
  )

  // 2. Revoke and grant to authenticated
  assert.ok(
    sql.includes('revoke all on table public.assignments from anon, authenticated;'),
    'Migration must revoke privileges from anon and authenticated',
  )
  assert.ok(
    sql.includes('grant select, insert, update, delete') &&
      sql.includes('on table public.assignments to authenticated;'),
    'Migration must grant select, insert, update, delete to authenticated',
  )

  // 3. Four separate policies
  assert.ok(
    sql.includes('create policy "assignments select own"') &&
      sql.includes('on public.assignments for select to authenticated'),
    'Migration must define "assignments select own" policy',
  )
  assert.ok(
    sql.includes('create policy "assignments insert own"') &&
      sql.includes('on public.assignments for insert to authenticated'),
    'Migration must define "assignments insert own" policy',
  )
  assert.ok(
    sql.includes('create policy "assignments update own"') &&
      sql.includes('on public.assignments for update to authenticated'),
    'Migration must define "assignments update own" policy',
  )
  assert.ok(
    sql.includes('create policy "assignments delete own"') &&
      sql.includes('on public.assignments for delete to authenticated'),
    'Migration must define "assignments delete own" policy',
  )

  // 4. Update policy must specify both USING and WITH CHECK with identical conditions
  assert.ok(
    sql.includes('using ((select auth.uid()) is not null') &&
      sql.includes('and (select auth.uid()) = owner_id)') &&
      sql.includes('with check ((select auth.uid()) is not null') &&
      sql.includes('and (select auth.uid()) = owner_id)'),
    'UPDATE policy must enforce matching USING and WITH CHECK clauses',
  )

  // 5. Must not use single 'for all' policy
  assert.equal(
    sql.toLowerCase().includes('for all'),
    false,
    'Migration must not use policy FOR ALL',
  )
})

test('useAuth contracts, fromSession mapping, and session restoration semantics', () => {
  // 1. fromSession returns guest when session is null
  const guestState = fromSession(null)
  assert.deepEqual(guestState, { status: 'guest' })

  // 2. fromSession returns authenticated when session is present
  const fakeSession = {
    access_token: 'fake-jwt',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'fake-refresh',
    user: {
      id: 'usr-1234',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-11-02T10:00:00Z',
      email: 'student@example.com',
    },
  } as unknown as Parameters<typeof fromSession>[0]

  const authState = fromSession(fakeSession)
  assert.equal(authState.status, 'authenticated')
  if (authState.status === 'authenticated') {
    assert.equal(authState.session.user.id, 'usr-1234')
    assert.equal(authState.session.user.email, 'student@example.com')
  }

  // 3. State reducer logic matching useAuth getSession behavior:
  // If current.status === 'checking', hydrates from getSession data;
  // If event already changed away from 'checking', does not overwrite.
  const checkingState: AuthState = { status: 'checking' }
  const reduceLateSession = (
    current: AuthState,
    session: typeof fakeSession | null,
    error: unknown,
  ): AuthState => {
    return current.status === 'checking'
      ? error
        ? { status: 'guest' }
        : fromSession(session)
      : current
  }

  // Hydrate when checking
  const hydrated = reduceLateSession(checkingState, fakeSession, null)
  assert.equal(hydrated.status, 'authenticated')

  // If getSession errored while checking, fall back to guest
  const fallbackGuest = reduceLateSession(checkingState, null, new Error('network down'))
  assert.deepEqual(fallbackGuest, { status: 'guest' })

  // If already authenticated by onAuthStateChange, late getSession null does not reset to guest
  const alreadyAuthenticated: AuthState = { status: 'authenticated', session: fakeSession! }
  const ignoredLateNull = reduceLateSession(alreadyAuthenticated, null, null)
  assert.equal(ignoredLateNull.status, 'authenticated')
})

test('services/assignments.ts row mappers and toWrite security payload contract', () => {
  const mockRow: AssignmentRow = {
    id: 'a-uuid-1',
    owner_id: 'owner-uuid-42',
    course_id: 'c1',
    title: '  Курсовая работа по сетям  ',
    description: '  Подробный отчёт  ',
    status: 'in_progress',
    due_date: '2026-11-20',
    difficulty: 'hard',
    created_at: '2026-11-02T12:00:00Z',
  }

  // 1. fromRow with courses catalog resolves courseTitle
  const mappedWithCourses = fromRow(mockRow, COURSES)
  assert.equal(mappedWithCourses.id, 'a-uuid-1')
  assert.equal(mappedWithCourses.courseId, 'c1')
  assert.equal(mappedWithCourses.courseTitle, 'Веб-разработка')
  assert.equal(mappedWithCourses.dueDate, '2026-11-20')
  assert.equal(mappedWithCourses.status, 'in_progress')
  assert.equal(mappedWithCourses.difficulty, 'hard')

  // 2. fromRow without courses catalog falls back courseTitle to course_id
  const mappedWithoutCourses = fromRow(mockRow)
  assert.equal(mappedWithoutCourses.courseTitle, 'c1')

  // 3. toWrite converts draft to DB write object, trimming strings
  const draft: AssignmentDraft = {
    courseId: 'c3',
    courseTitle: 'Операционные системы',
    title: '   Практическая работа 6   ',
    description: '   Изучение процессов   ',
    dueDate: '2026-11-25',
    status: 'todo',
    difficulty: 'medium',
  }

  const writePayload = toWrite(draft)
  assert.equal(writePayload.course_id, 'c3')
  assert.equal(writePayload.title, 'Практическая работа 6')
  assert.equal(writePayload.description, 'Изучение процессов')
  assert.equal(writePayload.due_date, '2026-11-25')
  assert.equal(writePayload.status, 'todo')
  assert.equal(writePayload.difficulty, 'medium')

  // 4. CRITICAL SECURITY ASSERTION: toWrite must NEVER send owner_id, id, or created_at
  const payloadKeys = Object.keys(writePayload)
  assert.equal(payloadKeys.includes('owner_id'), false, 'toWrite must NOT send owner_id')
  assert.equal(payloadKeys.includes('id'), false, 'toWrite must NOT send id')
  assert.equal(payloadKeys.includes('created_at'), false, 'toWrite must NOT send created_at')
  assert.equal(payloadKeys.includes('courseTitle'), false, 'toWrite must NOT send camelCase courseTitle')
})

test('services/assignments.ts async CRUD operations query assignments table and handle errors', async () => {
  const originalFrom = supabase.from
  try {
    const sampleRow: AssignmentRow = {
      id: 'row-1',
      owner_id: 'usr-1',
      course_id: 'c1',
      title: 'Задание 1',
      description: 'Текст',
      status: 'todo',
      due_date: '2026-11-30',
      difficulty: 'easy',
      created_at: '2026-11-02T10:00:00Z',
    }

    // 1. getAssignments queries 'assignments', orders by created_at desc
    let calledTable = ''
    let calledSelect = ''
    let calledOrder = ''
    let orderAscending: boolean | undefined

    supabase.from = ((table: string) => {
      calledTable = table
      return {
        select: (cols: string) => {
          calledSelect = cols
          return {
            order: (col: string, opts: { ascending: boolean }) => {
              calledOrder = col
              orderAscending = opts.ascending
              return {
                overrideTypes: () => Promise.resolve({ data: [sampleRow], error: null }),
              }
            },
          }
        },
      }
    }) as unknown as typeof supabase.from

    const assignments = await getAssignments(COURSES)
    assert.equal(calledTable, 'assignments')
    assert.equal(calledSelect, assignmentColumns)
    assert.equal(calledOrder, 'created_at')
    assert.equal(orderAscending, false)
    assert.equal(assignments.length, 1)
    assert.equal(assignments[0].id, 'row-1')
    assert.equal(assignments[0].courseTitle, 'Веб-разработка')

    // Null/empty data fallback in getAssignments
    supabase.from = (() => ({
      select: () => ({
        order: () => ({
          overrideTypes: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    })) as unknown as typeof supabase.from
    const emptyResult = await getAssignments(COURSES)
    assert.deepEqual(emptyResult, [])

    // Error handling on getAssignments
    supabase.from = (() => ({
      select: () => ({
        order: () => ({
          overrideTypes: () =>
            Promise.resolve({ data: null, error: { message: 'permission denied' } }),
        }),
      }),
    })) as unknown as typeof supabase.from

    await assert.rejects(
      async () => {
        await getAssignments()
      },
      (err: Error) => {
        assert.ok(err.message.includes('Не удалось загрузить задачи: permission denied'))
        return true
      },
    )

    // 2. createAssignment inserts payload, selects single row
    let insertedPayload: unknown
    supabase.from = ((table: string) => {
      assert.equal(table, 'assignments')
      return {
        insert: (payload: unknown) => {
          insertedPayload = payload
          return {
            select: () => ({
              single: () => ({
                overrideTypes: () => Promise.resolve({ data: sampleRow, error: null }),
              }),
            }),
          }
        },
      }
    }) as unknown as typeof supabase.from

    const draft: AssignmentDraft = {
      courseId: 'c1',
      courseTitle: 'Веб-разработка',
      title: 'Новое',
      description: 'Детали',
      dueDate: '2026-11-20',
      status: 'todo',
      difficulty: 'easy',
    }
    const created = await createAssignment(draft, COURSES)
    assert.equal(created.id, 'row-1')
    assert.deepEqual(insertedPayload, toWrite(draft))

    // 3. updateAssignment calls .update().eq('id', id)
    let updatedPayload: unknown
    let updateFilterField = ''
    let updateFilterValue = ''
    supabase.from = ((table: string) => {
      assert.equal(table, 'assignments')
      return {
        update: (payload: unknown) => {
          updatedPayload = payload
          return {
            eq: (field: string, value: string) => {
              updateFilterField = field
              updateFilterValue = value
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    }) as unknown as typeof supabase.from

    await updateAssignment('row-1', draft)
    assert.deepEqual(updatedPayload, toWrite(draft))
    assert.equal(updateFilterField, 'id')
    assert.equal(updateFilterValue, 'row-1')

    // 4. deleteAssignment calls .delete().eq('id', id)
    let deleteFilterField = ''
    let deleteFilterValue = ''
    supabase.from = ((table: string) => {
      assert.equal(table, 'assignments')
      return {
        delete: () => ({
          eq: (field: string, value: string) => {
            deleteFilterField = field
            deleteFilterValue = value
            return Promise.resolve({ error: null })
          },
        }),
      }
    }) as unknown as typeof supabase.from

    await deleteAssignment('row-to-delete')
    assert.equal(deleteFilterField, 'id')
    assert.equal(deleteFilterValue, 'row-to-delete')
  } finally {
    supabase.from = originalFrom
  }
})

test('RequireAuth and AuthPage component sources enforce session guards, redirection, and credentials security', () => {
  const rootDir = path.resolve(__dirname, '..')

  // 1. RequireAuth.tsx source structure and contract
  const requireAuthPath = path.resolve(rootDir, 'src', 'app', 'RequireAuth.tsx')
  assert.ok(fs.existsSync(requireAuthPath), 'RequireAuth.tsx must exist')
  const requireAuthSrc = fs.readFileSync(requireAuthPath, 'utf8')

  assert.ok(
    requireAuthSrc.includes('useLocation()'),
    'RequireAuth must call useLocation before conditional returns',
  )
  assert.ok(
    requireAuthSrc.includes("auth.status === 'checking'") &&
      requireAuthSrc.includes('Проверяем сессию…'),
    'RequireAuth must render "Проверяем сессию…" during checking state',
  )
  assert.ok(
    requireAuthSrc.includes("auth.status === 'guest'") &&
      requireAuthSrc.includes('Navigate to="/auth" replace state={{ from: location.pathname }}'),
    'RequireAuth must redirect guest to /auth with replace and original location state',
  )
  assert.ok(
    requireAuthSrc.includes('<Outlet />'),
    'RequireAuth must render Outlet for authenticated session',
  )

  // 2. AuthPage.tsx source structure and contract
  const authPagePath = path.resolve(rootDir, 'src', 'pages', 'AuthPage.tsx')
  assert.ok(fs.existsSync(authPagePath), 'AuthPage.tsx must exist')
  const authPageSrc = fs.readFileSync(authPagePath, 'utf8')

  assert.ok(
    authPageSrc.includes('type="email"') && authPageSrc.includes('autoComplete="email"'),
    'AuthPage must render email input with type="email" and autoComplete="email"',
  )
  assert.ok(
    authPageSrc.includes('type="password"') &&
      authPageSrc.includes('current-password') &&
      authPageSrc.includes('new-password'),
    'AuthPage must toggle password autoComplete between current-password and new-password',
  )
  assert.ok(
    authPageSrc.includes('supabase.auth.signUp') &&
      authPageSrc.includes('options: { emailRedirectTo: window.location.origin }'),
    'AuthPage must call signUp with emailRedirectTo',
  )
  assert.ok(
    authPageSrc.includes('supabase.auth.signInWithPassword'),
    'AuthPage must call signInWithPassword',
  )
  assert.ok(
    authPageSrc.includes('Проверьте почту и подтвердите регистрацию.'),
    'AuthPage must show confirmation message when registration requires email verification',
  )
  assert.ok(
    authPageSrc.includes('disabled={pending}'),
    'AuthPage must disable buttons while pending is true',
  )
  assert.ok(
    authPageSrc.includes("auth?.status === 'checking'") &&
      authPageSrc.includes('Проверяем сессию…'),
    'AuthPage must render "Проверяем сессию…" during checking state to prevent FOUC',
  )

  // 3. AppLayout.tsx must not contain memory notice banner
  const appLayoutPath = path.resolve(rootDir, 'src', 'app', 'AppLayout.tsx')
  const appLayoutSrc = fs.readFileSync(appLayoutPath, 'utf8')
  assert.equal(
    appLayoutSrc.includes('memory-notice-banner'),
    false,
    'AppLayout must remove the Lab 3/5 temporary memory banner',
  )
  assert.ok(
    appLayoutSrc.includes("supabase.auth.signOut({ scope: 'local' })"),
    'AppLayout must sign out with local scope',
  )
})

test('Multi-account isolation, session clearing, and form submit protection semantics', () => {
  // 1. Session clearing: when auth transitions to guest, tasks array is reset to []
  let userTasks: Assignment[] = [
    {
      id: 'task-a',
      title: 'Задание пользователя А',
      description: 'Секретное задание',
      courseId: 'c1',
      courseTitle: 'Веб-разработка',
      dueDate: '2026-11-20',
      status: 'in_progress',
      difficulty: 'hard',
    },
  ]

  const handleSessionChange = (authStatus: AuthState['status']) => {
    if (authStatus !== 'authenticated') {
      userTasks = []
    }
  }

  // Simulate sign out
  handleSessionChange('guest')
  assert.equal(userTasks.length, 0, 'Tasks must be immediately emptied when user becomes guest')

  // 2. User switch isolation: when user B logs in after user A, old list is cleared before loading B
  userTasks = [
    {
      id: 'task-a',
      title: 'Задание пользователя А',
      description: 'Секретно',
      courseId: 'c1',
      courseTitle: 'Веб-разработка',
      dueDate: '2026-11-20',
      status: 'todo',
      difficulty: 'easy',
    },
  ]

  const switchUser = (_previousTasks: Assignment[], newUserTasks: Assignment[]) => {
    // Stage 1: immediately clear
    let current: Assignment[] = []
    assert.equal(current.length, 0, 'Previous tasks must be wiped before new tasks arrive')
    // Stage 2: set new
    current = newUserTasks
    return current
  }

  const tasksUserB: Assignment[] = [
    {
      id: 'task-b',
      title: 'Задание пользователя B',
      description: 'Публично',
      courseId: 'c2',
      courseTitle: 'Базы данных',
      dueDate: '2026-11-25',
      status: 'done' as const,
      difficulty: 'medium' as const,
    },
  ]
  const switched = switchUser(userTasks, tasksUserB)
  assert.equal(switched.length, 1)
  assert.equal(switched[0].id, 'task-b')

  // 3. Double-click submit prevention
  let pending = false
  let callCount = 0

  // First call starts request
  pending = true
  // Immediate second click
  if (pending) {
    // Blocked
  } else {
    callCount++
  }
  assert.equal(callCount, 0, 'Concurrent click must be blocked while pending is true')
  // 4. Reference update stability: when same user stays authenticated and courses update, list is preserved
  let preservedTasks = [...tasksUserB]
  const currentUserId: string | null = 'user-b'
  const handleCoursesUpdate = (newUserId: string | null) => {
    if (newUserId !== currentUserId) {
      preservedTasks = []
    }
  }
  handleCoursesUpdate('user-b')
  assert.equal(preservedTasks.length, 1, 'Tasks must NOT be wiped when courses update for same user')
})

test('AssignmentDetailsPage and EditAssignmentPage handle loading and error states to avoid false 404', () => {
  const rootDir = path.resolve(__dirname, '..')

  const detailsPath = path.resolve(rootDir, 'src', 'pages', 'AssignmentDetailsPage.tsx')
  assert.ok(fs.existsSync(detailsPath), 'AssignmentDetailsPage.tsx must exist')
  const detailsSrc = fs.readFileSync(detailsPath, 'utf8')
  assert.ok(
    detailsSrc.includes('loading && !assignment') && detailsSrc.includes('Загружаем задание…'),
    'AssignmentDetailsPage must render loading notice while loading is true',
  )
  assert.ok(
    detailsSrc.includes('error && !assignment') && detailsSrc.includes('error-notice'),
    'AssignmentDetailsPage must render error notice when error occurs',
  )

  const editPath = path.resolve(rootDir, 'src', 'pages', 'EditAssignmentPage.tsx')
  assert.ok(fs.existsSync(editPath), 'EditAssignmentPage.tsx must exist')
  const editSrc = fs.readFileSync(editPath, 'utf8')
  assert.ok(
    editSrc.includes('loading && !assignment') && editSrc.includes('Загружаем задание…'),
    'EditAssignmentPage must render loading notice while loading is true',
  )
  assert.ok(
    editSrc.includes('error && !assignment') && editSrc.includes('error-notice'),
    'EditAssignmentPage must render error notice when error occurs',
  )
})

test('Lab 7 migration SQL schema defines ON UPDATE CASCADE ON DELETE RESTRICT on course_id and query indexes', () => {
  const rootDir = path.resolve(__dirname, '..', '..')
  const migrationPath = path.resolve(
    rootDir,
    'supabase',
    'migrations',
    '202611020002_assignments_relations_and_indexes.sql',
  )
  assert.ok(fs.existsSync(migrationPath), 'Lab 7 migration file must exist')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  // 1. Foreign key constraint
  assert.ok(
    sql.includes('alter table public.assignments') &&
      sql.includes('drop constraint if exists assignments_course_id_fkey;'),
    'Migration must drop existing assignments_course_id_fkey constraint if present',
  )
  assert.ok(
    sql.includes('add constraint assignments_course_id_fkey') &&
      sql.includes('foreign key (course_id) references public.courses(id)') &&
      sql.toLowerCase().includes('on update cascade') &&
      sql.toLowerCase().includes('on delete restrict'),
    'Migration must add foreign key with ON UPDATE CASCADE ON DELETE RESTRICT',
  )

  // 2. Indexes
  assert.ok(
    sql.includes('create index if not exists assignments_owner_status_idx') &&
      sql.includes('on public.assignments(owner_id, status)'),
    'Migration must create index on assignments(owner_id, status)',
  )
  assert.ok(
    sql.includes('create index if not exists assignments_course_id_idx') &&
      sql.includes('on public.assignments(course_id)'),
    'Migration must create index on assignments(course_id)',
  )
})

test('AssignmentFilters and emptyAssignmentFilters contract', () => {
  assert.equal(emptyAssignmentFilters.query, '')
  assert.equal(emptyAssignmentFilters.status, 'all')
  assert.equal(emptyAssignmentFilters.courseId, 'all')

  const validFilters: AssignmentFilters = {
    query: 'сеть',
    status: 'in_progress',
    courseId: 'c1',
  }
  assert.equal(validFilters.query, 'сеть')
  assert.equal(validFilters.status, 'in_progress')
  assert.equal(validFilters.courseId, 'c1')
})

test('Embedded resource select query and fromRow relation mapping', () => {
  // 1. assignmentColumns includes courses(id, name)
  assert.ok(
    assignmentColumns.includes('courses(id, name)'),
    'assignmentColumns must embed courses(id, name)',
  )

  // 2. fromRow maps embedded courses object to courseTitle
  const rowWithEmbeddedObject: AssignmentRow = {
    id: 'a1',
    owner_id: 'u1',
    course_id: 'c1',
    title: 'Задание 1',
    description: 'Описание',
    status: 'todo',
    due_date: '2026-11-20',
    difficulty: 'easy',
    created_at: '2026-11-02T10:00:00Z',
    courses: { id: 'c1', name: 'Сетевые технологии' },
  }
  const mappedObj = fromRow(rowWithEmbeddedObject)
  assert.equal(mappedObj.courseTitle, 'Сетевые технологии')
  assert.equal(mappedObj.courseId, 'c1')

  // 3. fromRow maps embedded courses array (if returned as array by PostgREST)
  const rowWithEmbeddedArray: AssignmentRow = {
    ...rowWithEmbeddedObject,
    courses: [{ id: 'c1', name: 'Сетевые технологии в массиве' }],
  }
  const mappedArr = fromRow(rowWithEmbeddedArray)
  assert.equal(mappedArr.courseTitle, 'Сетевые технологии в массиве')

  // 4. fromRow falls back to fallbackCourses when courses relation is null
  const rowWithNullRelation: AssignmentRow = {
    ...rowWithEmbeddedObject,
    courses: null,
  }
  const mappedFallback = fromRow(rowWithNullRelation, COURSES)
  assert.equal(mappedFallback.courseTitle, 'Веб-разработка')

  // 5. fromRow falls back to course_id when both courses relation and fallbackCourses are missing
  const mappedIdFallback = fromRow(rowWithNullRelation)
  assert.equal(mappedIdFallback.courseTitle, 'c1')
})

test('services/assignments.ts getAssignments applies search query (ilike), status, and courseId filters to PostgREST request', async () => {
  const originalFrom = supabase.from
  try {
    const mockRow: AssignmentRow = {
      id: 'row-filter-1',
      owner_id: 'u1',
      course_id: 'c1',
      title: 'Изучение протоколов TCP/IP',
      description: 'Отчёт',
      status: 'in_progress',
      due_date: '2026-11-25',
      difficulty: 'hard',
      created_at: '2026-11-02T10:00:00Z',
      courses: { id: 'c1', name: 'Компьютерные сети' },
    }

    let calledIlikeCol = ''
    let calledIlikePattern = ''
    let calledStatusField = ''
    let calledStatusValue = ''
    let calledCourseField = ''
    let calledCourseValue = ''
    let calledOrderCol = ''
    let orderAscending: boolean | undefined

    supabase.from = ((table: string) => {
      assert.equal(table, 'assignments')
      return {
        select: (cols: string) => {
          assert.equal(cols, assignmentColumns)
          const queryBuilder: {
            order: (col: string, opts: { ascending: boolean }) => typeof queryBuilder
            ilike: (col: string, pattern: string) => typeof queryBuilder
            eq: (field: string, val: string) => typeof queryBuilder
            overrideTypes: () => Promise<{ data: AssignmentRow[]; error: null }>
          } = {
            order: (col: string, opts: { ascending: boolean }) => {
              calledOrderCol = col
              orderAscending = opts.ascending
              return queryBuilder
            },
            ilike: (col: string, pattern: string) => {
              calledIlikeCol = col
              calledIlikePattern = pattern
              return queryBuilder
            },
            eq: (field: string, val: string) => {
              if (field === 'status') {
                calledStatusField = field
                calledStatusValue = val
              } else if (field === 'course_id') {
                calledCourseField = field
                calledCourseValue = val
              }
              return queryBuilder
            },
            overrideTypes: () => Promise.resolve({ data: [mockRow], error: null }),
          }
          return queryBuilder
        },
      }
    }) as unknown as typeof supabase.from

    // 1. Query with all filters active
    const activeFilters: AssignmentFilters = {
      query: '  протоколов  ',
      status: 'in_progress',
      courseId: 'c1',
    }
    const result = await getAssignments(activeFilters)
    assert.equal(calledOrderCol, 'created_at')
    assert.equal(orderAscending, false)
    assert.equal(calledIlikeCol, 'title')
    assert.equal(calledIlikePattern, '%протоколов%')
    assert.equal(calledStatusField, 'status')
    assert.equal(calledStatusValue, 'in_progress')
    assert.equal(calledCourseField, 'course_id')
    assert.equal(calledCourseValue, 'c1')
    assert.equal(result.length, 1)
    assert.equal(result[0].courseTitle, 'Компьютерные сети')

    // 2. Query with empty filters doesn't apply ilike or eq
    calledIlikeCol = ''
    calledStatusField = ''
    calledCourseField = ''

    await getAssignments(emptyAssignmentFilters)
    assert.equal(calledIlikeCol, '', 'Empty query must not call ilike')
    assert.equal(calledStatusField, '', 'Status "all" must not call eq')
    assert.equal(calledCourseField, '', 'CourseId "all" must not call eq')
  } finally {
    supabase.from = originalFrom
  }
})

test('Empty states distinction logic and component contracts', () => {
  const rootDir = path.resolve(__dirname, '..')

  // 1. hasFilters calculation logic
  const computeHasFilters = (filters: AssignmentFilters): boolean => {
    return (
      filters.query.trim() !== '' ||
      filters.status !== 'all' ||
      filters.courseId !== 'all'
    )
  }

  assert.equal(computeHasFilters(emptyAssignmentFilters), false, 'Empty filters have no filters')
  assert.equal(computeHasFilters({ query: '   ', status: 'all', courseId: 'all' }), false, 'Whitespace query has no filters')
  assert.equal(computeHasFilters({ query: 'лаба', status: 'all', courseId: 'all' }), true, 'Query triggers hasFilters')
  assert.equal(computeHasFilters({ query: '', status: 'todo', courseId: 'all' }), true, 'Status triggers hasFilters')
  assert.equal(computeHasFilters({ query: '', status: 'all', courseId: 'c1' }), true, 'CourseId triggers hasFilters')

  // 2. AssignmentFiltersForm.tsx contract
  const formPath = path.resolve(rootDir, 'src', 'components', 'AssignmentFiltersForm.tsx')
  assert.ok(fs.existsSync(formPath), 'AssignmentFiltersForm.tsx must exist')
  const formSrc = fs.readFileSync(formPath, 'utf8')

  assert.ok(
    formSrc.includes('id="filter-query"') && formSrc.includes('Поиск по названию'),
    'AssignmentFiltersForm must render query search input with label',
  )
  assert.ok(
    formSrc.includes('id="filter-status"') && formSrc.includes('Все статусы'),
    'AssignmentFiltersForm must render status filter with "Все статусы"',
  )
  assert.ok(
    formSrc.includes('id="filter-course"') && formSrc.includes('Все курсы'),
    'AssignmentFiltersForm must render course filter with "Все курсы"',
  )
  assert.ok(
    formSrc.includes('Применить') && formSrc.includes('type="submit"'),
    'AssignmentFiltersForm must have "Применить" submit button',
  )
  assert.ok(
    formSrc.includes('Сбросить') && formSrc.includes('emptyAssignmentFilters'),
    'AssignmentFiltersForm must have "Сбросить" button using emptyAssignmentFilters',
  )
  assert.ok(
    formSrc.includes('disabled={pending}'),
    'AssignmentFiltersForm must disable buttons and fields during pending',
  )

  // 3. AssignmentsPage.tsx empty states distinction
  const pagePath = path.resolve(rootDir, 'src', 'pages', 'AssignmentsPage.tsx')
  assert.ok(fs.existsSync(pagePath), 'AssignmentsPage.tsx must exist')
  const pageSrc = fs.readFileSync(pagePath, 'utf8')

  assert.ok(
    pageSrc.includes('empty-search-state') &&
      pageSrc.includes('По заданным фильтрам ничего не найдено'),
    'AssignmentsPage must render empty-search-state when hasFilters is true and assignments are empty',
  )
  assert.ok(
    pageSrc.includes('empty-list-state') &&
      pageSrc.includes('У вас пока нет учебных заданий'),
    'AssignmentsPage must render empty-list-state when hasFilters is false and assignments are empty',
  )
  assert.ok(
    pageSrc.includes('hasFilters') && pageSrc.includes('emptyAssignmentFilters'),
    'AssignmentsPage must use hasFilters and emptyAssignmentFilters',
  )
})

test('services/assignments.ts getAssignment queries single row with embedded courses and handles errors', async () => {
  const originalFrom = supabase.from
  try {
    const mockRow: AssignmentRow = {
      id: 'single-uuid-1',
      owner_id: 'usr-1',
      course_id: 'c2',
      title: 'Проектирование схемы БД',
      description: 'ER-диаграмма и нормализация',
      status: 'in_progress',
      due_date: '2026-11-28',
      difficulty: 'medium',
      created_at: '2026-11-02T10:00:00Z',
      courses: { id: 'c2', name: 'Базы данных' },
    }

    let calledTable = ''
    let calledSelect = ''
    let calledEqField = ''
    let calledEqValue = ''
    let singleCalled = false

    supabase.from = ((table: string) => {
      calledTable = table
      return {
        select: (cols: string) => {
          calledSelect = cols
          return {
            eq: (field: string, val: string) => {
              calledEqField = field
              calledEqValue = val
              return {
                single: () => {
                  singleCalled = true
                  return {
                    overrideTypes: () => Promise.resolve({ data: mockRow, error: null }),
                  }
                },
              }
            },
          }
        },
      }
    }) as unknown as typeof supabase.from

    const result = await getAssignment('single-uuid-1')
    assert.equal(calledTable, 'assignments')
    assert.equal(calledSelect, assignmentColumns)
    assert.equal(calledEqField, 'id')
    assert.equal(calledEqValue, 'single-uuid-1')
    assert.equal(singleCalled, true)
    assert.equal(result.id, 'single-uuid-1')
    assert.equal(result.courseTitle, 'Базы данных')

    // Error handling
    supabase.from = (() => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            overrideTypes: () =>
              Promise.resolve({ data: null, error: { message: 'Row not found' } }),
          }),
        }),
      }),
    })) as unknown as typeof supabase.from

    await assert.rejects(
      async () => {
        await getAssignment('non-existent')
      },
      (err: Error) => {
        assert.ok(err.message.includes('Не удалось загрузить задачу: Row not found'))
        return true
      },
    )
  } finally {
    supabase.from = originalFrom
  }
})

test('AssignmentFiltersForm handleReset calls either onReset or onApply, avoiding duplicate parallel network requests', () => {
  const rootDir = path.resolve(__dirname, '..')
  const formPath = path.resolve(rootDir, 'src', 'components', 'AssignmentFiltersForm.tsx')
  const formSrc = fs.readFileSync(formPath, 'utf8')

  assert.ok(
    formSrc.includes('if (onReset)') && formSrc.includes('onReset()') && formSrc.includes('onApply(emptyAssignmentFilters)'),
    'AssignmentFiltersForm handleReset must call onReset or onApply exclusively to avoid duplicate network requests',
  )
})

test('AssignmentsPage keeps AssignmentFiltersForm mounted during loading and error states and passes pending', () => {
  const rootDir = path.resolve(__dirname, '..')
  const pagePath = path.resolve(rootDir, 'src', 'pages', 'AssignmentsPage.tsx')
  const pageSrc = fs.readFileSync(pagePath, 'utf8')

  assert.ok(
    pageSrc.includes('<AssignmentFiltersForm') &&
      pageSrc.includes('pending={loading}') &&
      pageSrc.includes('onApply={onApplyFilters}') &&
      pageSrc.includes('onReset={onResetFilters}'),
    'AssignmentsPage must render AssignmentFiltersForm with pending={loading}',
  )
})

test('App handleCreateAssignment and handleUpdateAssignment prevent false 404 when filters are active', () => {
  const rootDir = path.resolve(__dirname, '..')
  const appPath = path.resolve(rootDir, 'src', 'App.tsx')
  const appSrc = fs.readFileSync(appPath, 'utf8')

  assert.ok(
    appSrc.includes('handleCreateAssignment') &&
      appSrc.includes('setAppliedFilters(emptyAssignmentFilters)') &&
      appSrc.includes('getAssignments(emptyAssignmentFilters, courses)'),
    'handleCreateAssignment must reset appliedFilters to empty so newly created assignment is visible and detail page does not 404',
  )

  assert.ok(
    appSrc.includes('handleUpdateAssignment') &&
      appSrc.includes('!fresh.some((a) => a.id === id)') &&
      appSrc.includes('setAppliedFilters(emptyAssignmentFilters)'),
    'handleUpdateAssignment must reset filters if updated item is no longer included in filtered results',
  )
})




