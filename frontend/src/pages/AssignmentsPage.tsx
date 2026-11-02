import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import type {
  Assignment,
  AssignmentFilters,
} from '../types/assignment.ts'
import {
  calculateAssignmentStats,
  emptyAssignmentFilters,
} from '../types/assignment.ts'
import type { Course } from '../types/course.ts'
import { AssignmentCard } from '../components/AssignmentCard.tsx'
import { AssignmentFiltersForm } from '../components/AssignmentFiltersForm.tsx'
import { getTaskSummary, type TaskSummary, API_BASE_URL } from '../services/summary.ts'

export interface AssignmentsPageProps {
  assignments: Assignment[]
  loading?: boolean
  error?: string | null
  filters?: AssignmentFilters
  courses?: Course[]
  onApplyFilters?: (filters: AssignmentFilters) => void
  onResetFilters?: () => void
  onRetry?: () => void
}

export function AssignmentsPage({
  assignments,
  loading = false,
  error = null,
  filters = emptyAssignmentFilters,
  courses = [],
  onApplyFilters = () => {},
  onResetFilters = () => {},
  onRetry,
}: AssignmentsPageProps) {
  const hasFilters =
    filters.query.trim() !== '' ||
    filters.status !== 'all' ||
    filters.courseId !== 'all'

  const stats = calculateAssignmentStats(assignments)

  // Node API Summary State
  const [summaryStatus, setSummaryStatus] = useState<
    'idle' | 'pending' | 'success' | 'error'
  >('idle')
  const [summary, setSummary] = useState<TaskSummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isStale, setIsStale] = useState<boolean>(false)
  const lastCalculatedSnapshotRef = useRef<string | null>(null)

  // Invalidate / mark summary as stale when assignments list changes
  useEffect(() => {
    if (summaryStatus === 'success' && lastCalculatedSnapshotRef.current !== null) {
      const currentSnapshot = assignments
        .map((a) => `${a.id}:${a.status}:${a.dueDate}`)
        .join('|')
      if (lastCalculatedSnapshotRef.current !== currentSnapshot) {
        setIsStale(true)
      }
    }
  }, [assignments, summaryStatus])

  async function handleCalculateSummary() {
    setSummaryStatus('pending')
    setSummaryError(null)
    const currentList = assignments
    const currentSnapshot = currentList
      .map((a) => `${a.id}:${a.status}:${a.dueDate}`)
      .join('|')
    try {
      const result = await getTaskSummary(currentList)
      setSummary(result)
      setSummaryStatus('success')
      lastCalculatedSnapshotRef.current = currentSnapshot
      const latestSnapshot = assignments
        .map((a) => `${a.id}:${a.status}:${a.dueDate}`)
        .join('|')
      setIsStale(currentSnapshot !== latestSnapshot)
    } catch (err: unknown) {
      setSummaryStatus('error')
      setSummaryError(
        err instanceof Error ? err.message : 'Не удалось получить сводку от Node API.',
      )
    }
  }

  return (
    <section className="page assignments-page">
      <header className="page-header">
        <div>
          <h2>Все задания</h2>
          <p className="page-subtitle">
            Учебные задания по фиксированным курсам: сроки, статус и сложность.
          </p>
        </div>
        <Link to="/assignments/new" className="button button-primary">
          Добавить задание
        </Link>
      </header>

      {/* Node API Summary Widget */}
      <section className="summary-widget" aria-label="Сводка Node API">
        <div className="summary-widget-header">
          <div>
            <h3 className="summary-widget-title">Сводка заданий (Node API)</h3>
            <p className="summary-widget-subtitle">
              Серверный расчёт показателей через HTTP API ({API_BASE_URL})
            </p>
          </div>
          {summaryStatus === 'success' && (
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={handleCalculateSummary}
              disabled={loading}
            >
              Пересчитать
            </button>
          )}
        </div>

        {summaryStatus === 'idle' && (
          <div className="summary-state summary-idle">
            <p className="summary-state-description">
              Сводка ещё не рассчитывалась. Нажмите кнопку для серверного расчёта через Node API.
            </p>
            <button
              type="button"
              className="button button-primary button-sm"
              onClick={handleCalculateSummary}
              disabled={loading}
            >
              Рассчитать сводку (Node API)
            </button>
          </div>
        )}

        {summaryStatus === 'pending' && (
          <div className="summary-state summary-pending" role="status">
            <span className="summary-spinner" aria-hidden="true" />
            <p className="summary-pending-text">
              Выполняется расчёт сводки через Node API…
            </p>
            <button
              type="button"
              className="button button-secondary button-sm"
              disabled
            >
              Расчёт выполняется…
            </button>
          </div>
        )}

        {summaryStatus === 'error' && (
          <div className="summary-state summary-error" role="alert">
            <div className="summary-error-content">
              <strong className="summary-error-title">
                Ошибка обращения к Node API
              </strong>
              <p className="summary-error-message">{summaryError}</p>
              <p className="summary-error-notice">
                Сервер Node API недоступен ({API_BASE_URL}). Убедитесь, что backend запущен.
                При этом CRUD-операции и хранилище Supabase остаются полностью работоспособными.
              </p>
            </div>
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={handleCalculateSummary}
              disabled={loading}
            >
              Повторить
            </button>
          </div>
        )}

        {summaryStatus === 'success' && summary && (
          <div className="summary-state summary-success">
            {isStale && (
              <div className="summary-stale-banner" role="status">
                ⚠️ Записи изменились после расчёта. Нажмите «Пересчитать», чтобы обновить сводку.
              </div>
            )}
            <div className="summary-metrics-grid">
              <div className="summary-metric-card summary-metric-active">
                <span className="summary-metric-label">Активные</span>
                <span className="summary-metric-value">{summary.active}</span>
                <span className="summary-metric-hint">todo и in_progress</span>
              </div>
              <div className="summary-metric-card summary-metric-completed">
                <span className="summary-metric-label">Выполнено</span>
                <span className="summary-metric-value">{summary.completed}</span>
                <span className="summary-metric-hint">status = done</span>
              </div>
              <div className="summary-metric-card summary-metric-overdue">
                <span className="summary-metric-label">Просрочено</span>
                <span className="summary-metric-value">{summary.overdue}</span>
                <span className="summary-metric-hint">срок раньше сегодня</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {assignments.length > 0 && !loading && !error && (
        <aside className="stats-summary" aria-label="Сводка по заданиям">
          <div className="stat-badge">
            Всего: <strong>{stats.total}</strong>
          </div>
          <div className="stat-badge stat-badge-done">
            Выполнено: <strong>{stats.completed}</strong>
          </div>
          <div className="stat-badge stat-badge-progress">
            В процессе: <strong>{stats.inProgress}</strong>
          </div>
          <div className="stat-badge stat-badge-todo">
            К выполнению: <strong>{stats.todo}</strong>
          </div>
          {stats.overdue > 0 && (
            <div className="stat-badge stat-badge-overdue">
              Просрочено: <strong>{stats.overdue}</strong>
            </div>
          )}
        </aside>
      )}

      <AssignmentFiltersForm
        value={filters}
        pending={loading}
        courses={courses}
        onApply={onApplyFilters}
        onReset={onResetFilters}
      />

      {loading && (
        <div className="status-notice" role="status">
          <p>Загружаем задания…</p>
        </div>
      )}

      {error && !loading && (
        <div className="error-notice" role="alert">
          <p className="form-error">{error}</p>
          {onRetry && (
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={onRetry}
            >
              Повторить
            </button>
          )}
        </div>
      )}

      {!loading && !error && (
        assignments.length === 0 ? (
          hasFilters ? (
            <div className="empty-state empty-search-state">
              <p>По заданным фильтрам ничего не найдено.</p>
              <button
                type="button"
                className="button button-secondary"
                onClick={onResetFilters}
              >
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <div className="empty-state empty-list-state">
              <p>У вас пока нет учебных заданий.</p>
              <Link to="/assignments/new" className="button button-primary">
                Добавить задание
              </Link>
            </div>
          )
        ) : (
          <div className="assignments-grid">
            {assignments.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        )
      )}
    </section>
  )
}
