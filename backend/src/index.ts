import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import {
  parseCreateTask,
  parseDateRange,
  loadAllTasksForSummary,
  calculateTaskSummary,
  mapSupabaseError,
  HttpError,
} from './summary.js'
import { requireUser, createUserClient, verifyEnvAtStartup } from './auth.js'

export function validatePort(rawPort: string | undefined): number {
  const p = Number(rawPort ?? '3000')
  if (!Number.isInteger(p) || p < 1) {
    throw new Error('PORT must be a positive integer')
  }
  return p
}

export function parseAllowedOrigins(rawOrigins: string | undefined): string[] {
  const origins = (rawOrigins ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return origins.length > 0 ? origins : ['http://localhost:5173']
}

const rawPort = process.env.PORT ?? '3000'
const port = Number(rawPort)
if (!Number.isInteger(port) || port < 1) {
  throw new Error('PORT must be a positive integer')
}
const host = process.env.HOST ?? '0.0.0.0'

const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_ORIGIN)
const frontendOrigin =
  allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins

const app = express()
app.disable('x-powered-by')

app.use(
  cors({
    origin: frontendOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
)

app.use(express.json({ limit: '100kb' }))

// Catch JSON body parsing errors from express.json before routes
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status: unknown }).status === 400
  ) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Неверный формат JSON' },
    })
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    (('status' in err && (err as { status: unknown }).status === 413) ||
      ('type' in err && (err as { type: unknown }).type === 'entity.too.large'))
  ) {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Превышен максимальный размер тела запроса (100kb)',
      },
    })
  }
  next(err)
})

// Public health check
app.get('/api/health', (_request: Request, response: Response) => {
  response.status(200).json({ status: 'ok' })
})

// Lab 9: removed temporary POST /api/summary/:kind from Lab 8 in favor of authorized GET /api/summary

// POST /api/tasks and /api/assignments (create task via Node API with user context)
app.post(
  ['/api/tasks', '/api/assignments'],
  requireUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parseCreateTask(req.body)
      const { token, userId } = res.locals.auth
      const supabase = createUserClient(token)

      const { data, error } = await supabase
        .from('assignments')
        .insert({
          owner_id: userId,
          course_id: input.courseId,
          title: input.title,
          description: input.description,
          status: input.status,
          due_date: input.dueDate,
          difficulty: input.difficulty,
        })
        .select(
          'id, owner_id, course_id, title, description, status, due_date, difficulty, created_at, courses(id, name)',
        )
        .single()

      if (error) {
        throw mapSupabaseError(error)
      }

      res.status(201).json({ data })
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/summary (load tasks from DB scoped to user and compute metrics on server)
app.get(
  '/api/summary',
  requireUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const range = parseDateRange(req.query)
      const { token } = res.locals.auth
      const supabase = createUserClient(token)
      const items = await loadAllTasksForSummary(supabase, range)
      const data = calculateTaskSummary(items, range.today)
      res.status(200).json({ data })
    } catch (err) {
      next(err)
    }
  },
)

// 404 handler for unknown routes
app.use((_request: Request, response: Response) => {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Маршрут не найден' },
  })
})

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    if (error instanceof HttpError) {
      return response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields && Object.keys(error.fields).length > 0
            ? { fields: error.fields }
            : {}),
        },
      })
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      (('status' in error && (error as { status: unknown }).status === 413) ||
        ('type' in error && (error as { type: unknown }).type === 'entity.too.large'))
    ) {
      return response.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Превышен максимальный размер тела запроса (100kb)',
        },
      })
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error as { status: unknown }).status === 400
    ) {
      return response.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Неверный формат JSON' },
      })
    }
    console.error(error)
    return response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Ошибка сервера' },
    })
  },
)

export { app }
export { port, host, frontendOrigin }

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))

if (isMain && process.env.NODE_ENV !== 'test') {
  verifyEnvAtStartup()
  app.listen(port, host, () => {
    console.log(`API is listening on ${host}:${port}`)
  })
}
