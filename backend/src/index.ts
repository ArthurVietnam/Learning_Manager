import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import {
  parseSummaryBody,
  calculateTaskSummary,
  HttpError,
} from './summary.js'

const app = express()
const port = Number(process.env.PORT ?? 3000)
const frontendOrigin = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '')

app.use(
  cors({
    origin: frontendOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
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

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.post('/api/summary/:kind', (request, response) => {
  if (request.params.kind !== 'tasks' && request.params.kind !== 'assignments') {
    throw new HttpError(404, 'NOT_FOUND', 'Вид сводки не найден')
  }
  const items = parseSummaryBody(request.body)
  const today = new Date().toISOString().slice(0, 10)
  const data = calculateTaskSummary(items, today)
  response.status(200).json({ data })
})

// 404 handler for unknown routes
app.use((_request, response) => {
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
        error: { code: error.code, message: error.message },
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

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))

if (isMain && process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`API: http://localhost:${port}`))
}
