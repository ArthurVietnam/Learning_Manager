import test, { describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  calculateTaskSummary,
  isSummaryTask,
  parseSummaryBody,
  parseCreateTask,
  parseDateRange,
  mapSupabaseError,
  loadAllTasksForSummary,
  HttpError,
  type SummaryTask,
} from './summary.js'
import {
  requireUser,
  createUserClient,
  setAuthClientForTest,
  setUserClientFactoryForTest,
  verifyEnvAtStartup,
} from './auth.js'

process.env.NODE_ENV = 'test'
const { app } = await import('./index.js')

describe('Pure calculation: calculateTaskSummary', () => {
  test('empty task list', () => {
    assert.deepEqual(calculateTaskSummary([], '2026-09-22'), {
      active: 0,
      completed: 0,
      overdue: 0,
    })
  })

  test('today is not overdue and completed is excluded', () => {
    const result = calculateTaskSummary(
      [
        { status: 'todo', dueDate: '2026-09-22' },
        { status: 'done', dueDate: '2026-09-20' },
        { status: 'in_progress', dueDate: '2026-09-21' },
      ],
      '2026-09-22',
    )
    assert.deepEqual(result, { active: 2, completed: 1, overdue: 1 })
  })

  test('null or empty dueDate is never counted as overdue', () => {
    const result = calculateTaskSummary(
      [
        { status: 'todo', dueDate: null },
        { status: 'in_progress', dueDate: null },
        { status: 'done', dueDate: null },
        { status: 'todo', dueDate: '' },
      ],
      '2026-09-22',
    )
    assert.deepEqual(result, { active: 3, completed: 1, overdue: 0 })
  })

  test('future dueDate is not overdue', () => {
    const result = calculateTaskSummary(
      [
        { status: 'todo', dueDate: '2026-09-23' },
        { status: 'in_progress', dueDate: '2026-10-01' },
      ],
      '2026-09-22',
    )
    assert.deepEqual(result, { active: 2, completed: 0, overdue: 0 })
  })

  test('valid leap year date is handled correctly', () => {
    const result = calculateTaskSummary(
      [{ status: 'todo', dueDate: '2024-02-29' }],
      '2024-03-01',
    )
    assert.deepEqual(result, { active: 1, completed: 0, overdue: 1 })
  })
})

describe('Runtime validation: isSummaryTask & parseSummaryBody (Lab 8)', () => {
  test('isSummaryTask validates correct items', () => {
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2026-10-15' }), true)
    assert.equal(isSummaryTask({ status: 'in_progress', dueDate: '2026-01-01' }), true)
    assert.equal(isSummaryTask({ status: 'done', dueDate: null }), true)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2024-02-29' }), true)
  })

  test('isSummaryTask rejects invalid structures, statuses and dates', () => {
    assert.equal(isSummaryTask(null), false)
    assert.equal(isSummaryTask(undefined), false)
    assert.equal(isSummaryTask([]), false)
    assert.equal(isSummaryTask('string'), false)
    assert.equal(isSummaryTask({ status: 'unknown', dueDate: null }), false)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: 'invalid-date' }), false)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2026-02-29' }), false)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2026-02-30' }), false)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '' }), false)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: 12345 }), false)
  })

  test('parseSummaryBody validates JSON object with items array', () => {
    const validItems: SummaryTask[] = [
      { status: 'todo', dueDate: '2026-10-15' },
      { status: 'done', dueDate: null },
    ]
    const parsed = parseSummaryBody({ items: validItems })
    assert.deepEqual(parsed, validItems)
  })

  test('parseSummaryBody throws on non-object root or invalid items', () => {
    assert.throws(
      () => parseSummaryBody(null),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
    assert.throws(
      () => parseSummaryBody({ items: 'not an array' }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
    assert.throws(
      () => parseSummaryBody({ items: [{ status: 'bad', dueDate: null }] }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
  })
})

describe('Lab 9 Runtime Validation: parseCreateTask, parseDateRange, mapSupabaseError', () => {
  test('parseCreateTask successfully parses valid assignment draft', () => {
    const valid = {
      courseId: 'c1',
      title: 'Лабораторная работа 9',
      description: 'Связать React, Node и Supabase',
      status: 'todo',
      dueDate: '2026-11-25',
      difficulty: 'medium',
    }
    const parsed = parseCreateTask(valid)
    assert.deepEqual(parsed, {
      courseId: 'c1',
      title: 'Лабораторная работа 9',
      description: 'Связать React, Node и Supabase',
      status: 'todo',
      dueDate: '2026-11-25',
      difficulty: 'medium',
    })
  })

  test('parseCreateTask accepts priority aliases (low -> easy, high -> hard)', () => {
    const draftLow = {
      tagId: 'course-1',
      title: 'Задание низкой сложности',
      status: 'in_progress',
      dueDate: '2026-12-01',
      priority: 'low',
    }
    assert.equal(parseCreateTask(draftLow).difficulty, 'easy')
    assert.equal(parseCreateTask(draftLow).courseId, 'course-1')

    const draftHigh = {
      course_id: 'course-2',
      title: 'Задание высокой сложности',
      status: 'done',
      dueDate: '2026-12-01',
      priority: 'high',
    }
    assert.equal(parseCreateTask(draftHigh).difficulty, 'hard')
  })

  test('parseCreateTask rejects owner_id and id injection', () => {
    assert.throws(
      () =>
        parseCreateTask({
          owner_id: 'attacker-uuid',
          courseId: 'c1',
          title: 'Поддельная задача',
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'Поле owner_id не принимается клиентом')
        return true
      },
    )

    assert.throws(
      () =>
        parseCreateTask({
          id: 'existing-uuid',
          courseId: 'c1',
          title: 'Поддельная задача',
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'Поле id не принимается клиентом')
        return true
      },
    )

    assert.throws(
      () =>
        parseCreateTask({
          created_at: '2020-01-01',
          courseId: 'c1',
          title: 'Поддельная задача',
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'Поле created_at не принимается клиентом')
        return true
      },
    )
  })

  test('parseCreateTask validates title length boundary (3..100)', () => {
    assert.throws(
      () =>
        parseCreateTask({
          courseId: 'c1',
          title: 'ab',
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )

    assert.throws(
      () =>
        parseCreateTask({
          courseId: 'c1',
          title: 'a'.repeat(101),
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
  })

  test('parseCreateTask validates status, dueDate, and courseId presence', () => {
    assert.throws(
      () =>
        parseCreateTask({
          courseId: '  ',
          title: 'Заголовок',
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )

    assert.throws(
      () =>
        parseCreateTask({
          courseId: 'c1',
          title: 'Заголовок',
          status: 'invalid_status',
          dueDate: '2026-11-25',
        }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )

    assert.throws(
      () =>
        parseCreateTask({
          courseId: 'c1',
          title: 'Заголовок',
          status: 'todo',
          dueDate: 'not-a-date',
        }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
  })

  test('parseDateRange parses valid date range or provides defaults', () => {
    const range = parseDateRange({
      from: '2026-01-01',
      to: '2026-12-31',
    })
    assert.equal(range.from, '2026-01-01')
    assert.equal(range.to, '2026-12-31')
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(range.today))

    // Default bounds when omitted
    const defaultRange = parseDateRange({})
    assert.equal(defaultRange.from, '1970-01-01')
    assert.equal(defaultRange.to, '2099-12-31')
  })

  test('parseDateRange rejects invalid dates and inverted ranges', () => {
    assert.throws(
      () => parseDateRange({ from: 'invalid' }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )

    assert.throws(
      () => parseDateRange({ from: '2026-12-31', to: '2026-01-01' }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.message, 'Параметр from не может быть позже to')
        return true
      },
    )

    assert.throws(
      () => parseDateRange({ from: '2000-01-01', to: '2020-01-01' }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
  })

  test('mapSupabaseError maps DB error codes to safe HTTP errors', () => {
    const conflict = mapSupabaseError({ code: '23505' })
    assert.equal(conflict.status, 409)
    assert.equal(conflict.code, 'CONFLICT')

    const fkError = mapSupabaseError({ code: '23503' })
    assert.equal(fkError.status, 400)
    assert.equal(fkError.code, 'VALIDATION_ERROR')

    const checkError = mapSupabaseError({ code: '23514' })
    assert.equal(checkError.status, 400)
    assert.equal(checkError.code, 'VALIDATION_ERROR')

    const notFound = mapSupabaseError({ code: 'PGRST116' })
    assert.equal(notFound.status, 404)
    assert.equal(notFound.code, 'NOT_FOUND')

    const serverError = mapSupabaseError({ code: 'unknown' })
    assert.equal(serverError.status, 500)
    assert.equal(serverError.code, 'INTERNAL_ERROR')
  })
})

describe('Server Auth Middleware & Request-Scoped Client isolation (Lab 9)', () => {
  test('requireUser rejects requests missing Authorization header', async () => {
    const req = { get: () => undefined } as any
    const res = { locals: {} } as any
    let errorReturned: unknown

    await requireUser(req, res, (err) => {
      errorReturned = err
    })

    assert.ok(errorReturned instanceof HttpError)
    assert.equal((errorReturned as HttpError).status, 401)
    assert.equal((errorReturned as HttpError).code, 'UNAUTHORIZED')
    assert.equal((errorReturned as HttpError).message, 'Требуется вход')
  })

  test('requireUser rejects non-Bearer or empty token header', async () => {
    const req1 = { get: () => 'Basic 12345' } as any
    const res = { locals: {} } as any
    let err1: unknown
    await requireUser(req1, res, (err) => {
      err1 = err
    })
    assert.equal((err1 as HttpError).status, 401)

    const req2 = { get: () => 'Bearer    ' } as any
    let err2: unknown
    await requireUser(req2, res, (err) => {
      err2 = err
    })
    assert.equal((err2 as HttpError).status, 401)
  })

  test('requireUser rejects invalid token when auth verifier returns error', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async (_token: string) => ({
          data: { user: null },
          error: { message: 'Invalid JWT' },
        }),
      },
    } as unknown as SupabaseClient

    setAuthClientForTest(mockAuthClient)
    try {
      const req = { get: () => 'Bearer forged-token' } as any
      const res = { locals: {} } as any
      let returnedErr: unknown

      await requireUser(req, res, (err) => {
        returnedErr = err
      })

      assert.ok(returnedErr instanceof HttpError)
      assert.equal((returnedErr as HttpError).status, 401)
      assert.equal((returnedErr as HttpError).code, 'UNAUTHORIZED')
      assert.equal((returnedErr as HttpError).message, 'Сессия недействительна')
      assert.equal(res.locals.auth, undefined)
    } finally {
      setAuthClientForTest(null)
    }
  })

  test('requireUser sets res.locals.auth on valid token without mutating other scopes', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async (token: string) => ({
          data: { user: { id: `user-for-${token}` } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient

    setAuthClientForTest(mockAuthClient)
    try {
      const reqA = { get: () => 'Bearer token-A' } as any
      const resA = { locals: {} } as any
      let nextCalledA = false
      await requireUser(reqA, resA, () => {
        nextCalledA = true
      })

      assert.ok(nextCalledA)
      assert.deepEqual(resA.locals.auth, {
        token: 'token-A',
        userId: 'user-for-token-A',
      })

      // Parallel request B does not see A's context
      const reqB = { get: () => 'Bearer token-B' } as any
      const resB = { locals: {} } as any
      let nextCalledB = false
      await requireUser(reqB, resB, () => {
        nextCalledB = true
      })

      assert.ok(nextCalledB)
      assert.deepEqual(resB.locals.auth, {
        token: 'token-B',
        userId: 'user-for-token-B',
      })
      assert.notEqual(resA.locals.auth.userId, resB.locals.auth.userId)
    } finally {
      setAuthClientForTest(null)
    }
  })

  test('createUserClient returns a fresh Supabase client configured with request token', () => {
    const client1 = createUserClient('token-1')
    const client2 = createUserClient('token-2')
    assert.ok(client1 !== client2, 'Factory must return isolated client instances')
  })
})

describe('loadAllTasksForSummary paginated fetching (Lab 9)', () => {
  test('fetches all tasks across multiple 500-item pages until incomplete page', async () => {
    const pagesRequested: { from: number; to: number }[] = []

    const mockSupabase = {
      from: (table: string) => {
        assert.equal(table, 'assignments')
        return {
          select: (_cols: string) => ({
            gte: (_f: string, _v: string) => ({
              lte: (_f2: string, _v2: string) => ({
                range: async (from: number, to: number) => {
                  pagesRequested.push({ from, to })
                  if (from === 0) {
                    // Page 1: 500 items
                    return {
                      data: Array.from({ length: 500 }, (_, i) => ({
                        status: 'todo',
                        due_date: '2026-11-20',
                        id: `id-${i}`,
                      })),
                      error: null,
                    }
                  } else if (from === 500) {
                    // Page 2: 25 items (less than pageSize, terminates loop)
                    return {
                      data: Array.from({ length: 25 }, (_, i) => ({
                        status: 'done',
                        due_date: '2026-11-10',
                        id: `id-${500 + i}`,
                      })),
                      error: null,
                    }
                  }
                  return { data: [], error: null }
                },
              }),
            }),
          }),
        }
      },
    }

    const items = await loadAllTasksForSummary(mockSupabase, {
      from: '2026-01-01',
      to: '2026-12-31',
    })

    assert.equal(items.length, 525)
    assert.deepEqual(pagesRequested, [
      { from: 0, to: 499 },
      { from: 500, to: 999 },
    ])
    assert.equal(items[0].status, 'todo')
    assert.equal(items[524].status, 'done')
  })
})

describe('HTTP endpoints integration: Lab 9 routes & security', () => {
  let server: Server
  let baseUrl: string

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  test('GET /api/health returns 200 { status: "ok" }', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    assert.equal(res.status, 200)
    const json = (await res.json()) as { status: string }
    assert.deepEqual(json, { status: 'ok' })
  })

  test('POST /api/tasks without Authorization returns 401 UNAUTHORIZED', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Тест без токена',
        courseId: 'c1',
        status: 'todo',
        dueDate: '2026-11-25',
      }),
    })
    assert.equal(res.status, 401)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.equal(json.error.code, 'UNAUTHORIZED')
    assert.equal(json.error.message, 'Требуется вход')
  })

  test('GET /api/summary without Authorization returns 401 UNAUTHORIZED', async () => {
    const res = await fetch(`${baseUrl}/api/summary`)
    assert.equal(res.status, 401)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.equal(json.error.code, 'UNAUTHORIZED')
  })

  test('POST /api/tasks with invalid/forged token returns 401 without stack trace', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: 'invalid token' },
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    try {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer random-forged-string',
        },
        body: JSON.stringify({
          title: 'Тест с поддельным токеном',
          courseId: 'c1',
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      })
      assert.equal(res.status, 401)
      const json = (await res.json()) as { error: { code: string; message: string; stack?: unknown } }
      assert.equal(json.error.code, 'UNAUTHORIZED')
      assert.equal(json.error.message, 'Сессия недействительна')
      assert.equal(json.error.stack, undefined)
    } finally {
      setAuthClientForTest(null)
    }
  })

  test('POST /api/tasks rejects owner_id injection even with valid token', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'victim-user-id' } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    try {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify({
          owner_id: 'attacker-id',
          title: 'Попытка подмены',
          courseId: 'c1',
          status: 'todo',
          dueDate: '2026-11-25',
        }),
      })
      assert.equal(res.status, 400)
      const json = (await res.json()) as { error: { code: string; message: string } }
      assert.equal(json.error.code, 'VALIDATION_ERROR')
      assert.equal(json.error.message, 'Поле owner_id не принимается клиентом')
    } finally {
      setAuthClientForTest(null)
    }
  })

  test('POST /api/tasks creates entity via request-scoped client with verified userId (201)', async () => {
    let insertedRow: any = null
    let clientTokenSeen = ''

    const mockAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-alice-123' } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    setUserClientFactoryForTest((token: string) => {
      clientTokenSeen = token
      return {
        from: (table: string) => {
          assert.equal(table, 'assignments')
          return {
            insert: (row: any) => {
              insertedRow = row
              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      id: 'new-assignment-uuid',
                      ...row,
                      created_at: '2026-11-23T12:00:00Z',
                      courses: { id: row.course_id, name: 'Веб-разработка' },
                    },
                    error: null,
                  }),
                }),
              }
            },
          }
        },
      } as any
    })

    try {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer alice-jwt-token',
        },
        body: JSON.stringify({
          title: 'Лабораторная работа 9',
          description: 'Тестовое описание',
          courseId: 'c1',
          status: 'todo',
          dueDate: '2026-11-30',
          difficulty: 'medium',
        }),
      })

      assert.equal(res.status, 201)
      const json = (await res.json()) as { data: { id: string; owner_id: string; title: string } }
      assert.equal(json.data.id, 'new-assignment-uuid')
      assert.equal(json.data.owner_id, 'user-alice-123')
      assert.equal(json.data.title, 'Лабораторная работа 9')

      assert.equal(clientTokenSeen, 'alice-jwt-token')
      assert.equal(insertedRow.owner_id, 'user-alice-123')
      assert.equal(insertedRow.course_id, 'c1')
    } finally {
      setAuthClientForTest(null)
      setUserClientFactoryForTest(null)
    }
  })

  test('POST /api/assignments semantic alias also creates entity with 201', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-bob-456' } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    setUserClientFactoryForTest(() => ({
      from: () => ({
        insert: (row: any) => ({
          select: () => ({
            single: async () => ({
              data: { id: 'bob-uuid', ...row },
              error: null,
            }),
          }),
        }),
      }),
    } as any))

    try {
      const res = await fetch(`${baseUrl}/api/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer bob-token',
        },
        body: JSON.stringify({
          title: 'Задание Боба',
          courseId: 'c2',
          status: 'in_progress',
          dueDate: '2026-12-05',
        }),
      })

      assert.equal(res.status, 201)
      const json = (await res.json()) as { data: { id: string } }
      assert.equal(json.data.id, 'bob-uuid')
    } finally {
      setAuthClientForTest(null)
      setUserClientFactoryForTest(null)
    }
  })

  test('GET /api/summary loads items from DB for authenticated user and returns 200 calculated metrics', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-alice' } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    setUserClientFactoryForTest(() => ({
      from: () => ({
        select: () => ({
          gte: () => ({
            lte: () => ({
              range: async () => ({
                data: [
                  { status: 'todo', due_date: '2026-12-01' },
                  { status: 'in_progress', due_date: '2020-01-01' },
                  { status: 'done', due_date: '2020-01-01' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any))

    try {
      const res = await fetch(`${baseUrl}/api/summary?from=2025-01-01&to=2027-01-01`, {
        headers: {
          Authorization: 'Bearer alice-token',
        },
      })

      assert.equal(res.status, 200)
      const json = (await res.json()) as {
        data: { active: number; completed: number; overdue: number }
      }
      assert.equal(json.data.active, 2)
      assert.equal(json.data.completed, 1)
      assert.equal(json.data.overdue, 1)
    } finally {
      setAuthClientForTest(null)
      setUserClientFactoryForTest(null)
    }
  })

  test('GET /api/summary rejects inverted date range with 400 VALIDATION_ERROR', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-alice' } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    try {
      const res = await fetch(`${baseUrl}/api/summary?from=2026-12-31&to=2026-01-01`, {
        headers: {
          Authorization: 'Bearer alice-token',
        },
      })

      assert.equal(res.status, 400)
      const json = (await res.json()) as { error: { code: string; message: string } }
      assert.equal(json.error.code, 'VALIDATION_ERROR')
      assert.equal(json.error.message, 'Параметр from не может быть позже to')
    } finally {
      setAuthClientForTest(null)
    }
  })

  test('Lab 8 temporary route POST /api/summary/:kind now returns 404 NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/summary/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    })
    assert.equal(res.status, 404)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.equal(json.error.code, 'NOT_FOUND')
    assert.equal(json.error.message, 'Маршрут не найден')
  })

  test('GET /unknown-route returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`)
    assert.equal(res.status, 404)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.deepEqual(json, {
      error: { code: 'NOT_FOUND', message: 'Маршрут не найден' },
    })
  })

  test('POST with invalid JSON syntax returns 400 BAD_REQUEST', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title": [invalid-json}',
    })
    assert.equal(res.status, 400)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.deepEqual(json, {
      error: { code: 'BAD_REQUEST', message: 'Неверный формат JSON' },
    })
  })

  test('POST with payload > 100kb returns 413 PAYLOAD_TOO_LARGE', async () => {
    const bigPayload = JSON.stringify({
      title: 'Большая задача',
      filler: 'a'.repeat(105 * 1024),
    })
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bigPayload,
    })
    assert.equal(res.status, 413)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.equal(json.error.code, 'PAYLOAD_TOO_LARGE')
  })

  test('CORS headers and OPTIONS preflight allow Authorization and Content-Type', async () => {
    const optRes = await fetch(`${baseUrl}/api/tasks`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    })
    assert.equal(optRes.status, 204)
    assert.equal(optRes.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    const allowedHeaders = optRes.headers.get('access-control-allow-headers') || ''
    assert.ok(allowedHeaders.includes('Authorization'))
    assert.ok(allowedHeaders.includes('Content-Type'))
  })

  test('verifyEnvAtStartup validates required environment variables and forbids service_role', () => {
    const origUrl = process.env.SUPABASE_URL
    const origKey = process.env.SUPABASE_PUBLISHABLE_KEY
    const origRole = process.env.SUPABASE_SERVICE_ROLE_KEY

    try {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      process.env.SUPABASE_URL = 'https://valid.supabase.co'
      process.env.SUPABASE_PUBLISHABLE_KEY = 'valid-anon-key'
      assert.doesNotThrow(() => verifyEnvAtStartup())

      // Missing URL
      process.env.SUPABASE_URL = ''
      assert.throws(
        () => verifyEnvAtStartup(),
        /Missing required environment variables/,
      )

      // Service role key prohibited
      process.env.SUPABASE_URL = 'https://valid.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_secret'
      assert.throws(
        () => verifyEnvAtStartup(),
        /service_role or secret_key is strictly prohibited/,
      )
    } finally {
      process.env.SUPABASE_URL = origUrl
      process.env.SUPABASE_PUBLISHABLE_KEY = origKey
      if (origRole !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = origRole
      } else {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    }
  })

  test('mapSupabaseError correctly maps 42501 RLS security violation to 403 FORBIDDEN', () => {
    const err = mapSupabaseError({
      code: '42501',
      message: 'new row violates row-level security policy for table assignments',
    })
    assert.equal(err.status, 403)
    assert.equal(err.code, 'FORBIDDEN')
    assert.equal(err.message, 'Доступ запрещён политикой безопасности')
  })

  test('parseCreateTask attaches field errors in HttpError for specific validation failures', () => {
    try {
      parseCreateTask({
        courseId: 'c1',
        title: 'ab',
        status: 'todo',
        dueDate: '2026-11-25',
      })
      assert.fail('Should throw')
    } catch (e: unknown) {
      assert.ok(e instanceof HttpError)
      assert.equal(e.status, 400)
      assert.ok(e.fields)
      assert.ok(e.fields.title)
    }
  })

  test('parseDateRange rejects array/polluted parameters with 400', () => {
    assert.throws(
      () => parseDateRange({ from: ['2026-01-01', '2026-01-02'] }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
  })

  test('POST /api/tasks returns structured fields on 400 validation failure', async () => {
    const mockAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-val-test' } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    try {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer val-token',
        },
        body: JSON.stringify({
          title: 'x', // too short (< 3 chars)
          courseId: 'c1',
          status: 'todo',
          dueDate: '2026-12-01',
        }),
      })
      assert.equal(res.status, 400)
      const json = (await res.json()) as {
        error: { code: string; message: string; fields?: Record<string, string> }
      }
      assert.equal(json.error.code, 'VALIDATION_ERROR')
      assert.ok(json.error.fields)
      assert.ok(json.error.fields.title)
    } finally {
      setAuthClientForTest(null)
    }
  })

  test('Malformed/corrupted tokens return 401 without stack trace across multiple invalid token formats', async () => {
    const corruptedTokens = [
      'corrupted.jwt.with.invalid.dots',
      'unpadded_base64_%%%===',
      'eyJhbGciOiJub25lIn0.e30.unsigned',
      'header.random-gibberish-token.signature',
    ]

    for (const badToken of corruptedTokens) {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${badToken}`,
        },
        body: JSON.stringify({
          title: 'Тест битого токена',
          courseId: 'c1',
          status: 'todo',
          dueDate: '2026-12-01',
        }),
      })
      assert.equal(res.status, 401)
      const json = (await res.json()) as {
        error: { code: string; message: string; stack?: unknown }
      }
      assert.equal(json.error.code, 'UNAUTHORIZED')
      assert.equal(json.error.stack, undefined)
    }
  })

  test('High concurrency: 50 simultaneous parallel requests isolate request-scoped clients without context leaks', async () => {
    const TOTAL_REQUESTS = 50
    const tokensSeen: string[] = []

    // Auth mock that extracts user ID from token
    const mockAuthClient = {
      auth: {
        getUser: async (token: string) => ({
          data: { user: { id: `user-for-${token}` } },
          error: null,
        }),
      },
    } as unknown as SupabaseClient
    setAuthClientForTest(mockAuthClient)

    // Factory creates client validating that each request client gets its own token
    setUserClientFactoryForTest((token: string) => {
      tokensSeen.push(token)
      const currentToken = token
      return {
        from: (table: string) => {
          assert.equal(table, 'assignments')
          return {
            insert: (row: any) => {
              // Ensure row.owner_id corresponds to the client's token
              assert.equal(row.owner_id, `user-for-${currentToken}`)
              return {
                select: () => ({
                  single: async () => {
                    // Small jitter to test race conditions under async event loop
                    await new Promise((resolve) => setTimeout(resolve, Math.random() * 15))
                    return {
                      data: {
                        id: `id-${currentToken}`,
                        owner_id: `user-for-${currentToken}`,
                        title: row.title,
                        course_id: row.course_id,
                      },
                      error: null,
                    }
                  },
                }),
              }
            },
          }
        },
      } as any
    })

    try {
      const requests = Array.from({ length: TOTAL_REQUESTS }, async (_, idx) => {
        const userToken = `token-user-${idx}`
        const res = await fetch(`${baseUrl}/api/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            title: `Параллельное задание ${idx}`,
            courseId: `course-${idx % 5}`,
            status: 'todo',
            dueDate: '2026-12-15',
          }),
        })
        assert.equal(res.status, 201)
        const json = (await res.json()) as {
          data: { id: string; owner_id: string; title: string }
        }
        assert.equal(json.data.owner_id, `user-for-${userToken}`)
        assert.equal(json.data.id, `id-${userToken}`)
        assert.equal(json.data.title, `Параллельное задание ${idx}`)
        return json.data
      })

      const results = await Promise.all(requests)
      assert.equal(results.length, TOTAL_REQUESTS)
      assert.equal(tokensSeen.length, TOTAL_REQUESTS)
      // Confirm all 50 tokens were unique
      const uniqueTokens = new Set(tokensSeen)
      assert.equal(uniqueTokens.size, TOTAL_REQUESTS)
    } finally {
      setAuthClientForTest(null)
      setUserClientFactoryForTest(null)
    }
  })
})
