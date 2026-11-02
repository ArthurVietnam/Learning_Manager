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
