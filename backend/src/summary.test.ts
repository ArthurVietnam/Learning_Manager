import test, { describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  calculateTaskSummary,
  isSummaryTask,
  parseSummaryBody,
  HttpError,
  type SummaryTask,
} from './summary.js'

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
      [
        { status: 'todo', dueDate: '2024-02-29' },
      ],
      '2024-03-01',
    )
    assert.deepEqual(result, { active: 1, completed: 0, overdue: 1 })
  })
})

describe('Runtime validation: isSummaryTask & parseSummaryBody', () => {
  test('isSummaryTask validates correct items', () => {
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2026-10-15' }), true)
    assert.equal(isSummaryTask({ status: 'in_progress', dueDate: '2026-01-01' }), true)
    assert.equal(isSummaryTask({ status: 'done', dueDate: null }), true)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2024-02-29' }), true) // Leap year
  })

  test('isSummaryTask rejects invalid structures, statuses and dates', () => {
    assert.equal(isSummaryTask(null), false)
    assert.equal(isSummaryTask(undefined), false)
    assert.equal(isSummaryTask([]), false)
    assert.equal(isSummaryTask('string'), false)
    assert.equal(isSummaryTask({ status: 'unknown', dueDate: null }), false)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: 'invalid-date' }), false)
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2026-02-29' }), false) // non-leap year Feb 29
    assert.equal(isSummaryTask({ status: 'todo', dueDate: '2026-02-30' }), false) // non-existent date
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

  test('parseSummaryBody throws on non-object root', () => {
    assert.throws(
      () => parseSummaryBody(null),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'Ожидается JSON-объект')
        return true
      },
    )
    assert.throws(
      () => parseSummaryBody([]),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'Ожидается JSON-объект')
        return true
      },
    )
    assert.throws(
      () => parseSummaryBody('just a string'),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
  })

  test('parseSummaryBody throws when items is missing or not an array', () => {
    assert.throws(
      () => parseSummaryBody({}),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'items должен быть массивом до 500 элементов')
        return true
      },
    )
    assert.throws(
      () => parseSummaryBody({ items: 'not an array' }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    )
  })

  test('parseSummaryBody throws when items count exceeds 500', () => {
    const tooMany = Array.from({ length: 501 }, () => ({
      status: 'todo',
      dueDate: null,
    }))
    assert.throws(
      () => parseSummaryBody({ items: tooMany }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'items должен быть массивом до 500 элементов')
        return true
      },
    )
  })

  test('parseSummaryBody throws when item elements are invalid', () => {
    assert.throws(
      () =>
        parseSummaryBody({
          items: [{ status: 'invalid_status', dueDate: null }],
        }),
      (err: unknown) => {
        assert.ok(err instanceof HttpError)
        assert.equal(err.status, 400)
        assert.equal(err.code, 'VALIDATION_ERROR')
        assert.equal(err.message, 'Проверьте поля элементов')
        return true
      },
    )
  })
})

describe('HTTP endpoints integration', () => {
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

  test('POST /api/summary/tasks returns 200 and calculated summary', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await fetch(`${baseUrl}/api/summary/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { status: 'todo', dueDate: today },
          { status: 'done', dueDate: '2020-01-01' },
          { status: 'in_progress', dueDate: '2020-01-01' },
        ],
      }),
    })
    assert.equal(res.status, 200)
    const json = (await res.json()) as {
      data: { active: number; completed: number; overdue: number }
    }
    assert.deepEqual(json, {
      data: {
        active: 2,
        completed: 1,
        overdue: 1,
      },
    })
  })

  test('POST /api/summary/assignments returns 200 (semantic alias)', async () => {
    const res = await fetch(`${baseUrl}/api/summary/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ status: 'todo', dueDate: null }],
      }),
    })
    assert.equal(res.status, 200)
    const json = (await res.json()) as { data: { active: number } }
    assert.equal(json.data.active, 1)
  })

  test('POST /api/summary/:kind with unknown kind returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/summary/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    })
    assert.equal(res.status, 404)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.deepEqual(json, {
      error: { code: 'NOT_FOUND', message: 'Вид сводки не найден' },
    })
  })

  test('GET /unknown-route returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`)
    assert.equal(res.status, 404)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.deepEqual(json, {
      error: { code: 'NOT_FOUND', message: 'Маршрут не найден' },
    })
  })

  test('POST /api/summary/tasks with invalid body returns 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${baseUrl}/api/summary/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ status: 'not_a_valid_status', dueDate: null }],
      }),
    })
    assert.equal(res.status, 400)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.equal(json.error.code, 'VALIDATION_ERROR')
    assert.equal(json.error.message, 'Проверьте поля элементов')
  })

  test('POST /api/summary/tasks with invalid JSON syntax returns 400 BAD_REQUEST', async () => {
    const res = await fetch(`${baseUrl}/api/summary/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"items": [invalid-json}',
    })
    assert.equal(res.status, 400)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.deepEqual(json, {
      error: { code: 'BAD_REQUEST', message: 'Неверный формат JSON' },
    })
  })

  test('POST /api/summary/tasks with payload > 100kb returns 413 PAYLOAD_TOO_LARGE', async () => {
    const bigPayload = JSON.stringify({
      items: [
        {
          status: 'todo',
          dueDate: '2026-10-10',
          filler: 'a'.repeat(105 * 1024),
        },
      ],
    })
    const res = await fetch(`${baseUrl}/api/summary/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bigPayload,
    })
    assert.equal(res.status, 413)
    const json = (await res.json()) as { error: { code: string; message: string } }
    assert.equal(json.error.code, 'PAYLOAD_TOO_LARGE')
    assert.ok(json.error.message.includes('100kb'))
  })

  test('CORS headers and OPTIONS preflight respond correctly', async () => {
    // 1. GET /api/health includes CORS origin
    const getRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    })
    assert.equal(getRes.headers.get('access-control-allow-origin'), 'http://localhost:5173')

    // 2. Preflight OPTIONS on /api/summary/tasks
    const optRes = await fetch(`${baseUrl}/api/summary/tasks`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    })
    assert.equal(optRes.status, 204)
    assert.equal(optRes.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.ok(optRes.headers.get('access-control-allow-methods')?.includes('POST'))
  })
})
