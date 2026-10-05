import { useState } from 'react'
import { Link } from 'react-router'
import type { Assignment, AssignmentStatus } from '../types/assignment'
import { calculateAssignmentStats, isValidAssignmentStatus } from '../types/assignment'
import { AssignmentCard } from '../components/AssignmentCard'

export interface AssignmentsPageProps {
  assignments: Assignment[]
}

export function AssignmentsPage({ assignments }: AssignmentsPageProps) {
  const [statusFilter, setStatusFilter] = useState<AssignmentStatus | 'all'>('all')

  const visibleAssignments = assignments.filter(
    (item) => statusFilter === 'all' || item.status === statusFilter
  )

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

      {assignments.length > 0 && (
        <aside className="stats-summary" aria-label="Сводка по заданиям">
          <div className="stat-badge">Всего: <strong>{stats.total}</strong></div>
          <div className="stat-badge stat-badge-done">Выполнено: <strong>{stats.completed}</strong></div>
          <div className="stat-badge stat-badge-progress">В процессе: <strong>{stats.inProgress}</strong></div>
          <div className="stat-badge stat-badge-todo">К выполнению: <strong>{stats.todo}</strong></div>
          {stats.overdue > 0 && (
            <div className="stat-badge stat-badge-overdue">Просрочено: <strong>{stats.overdue}</strong></div>
          )}
        </aside>
      )}

      {assignments.length > 0 && (
        <div className="filter-bar">
          <div className="filter-group">
            <label htmlFor="status-filter" className="filter-label">
              Фильтр по статусу:
            </label>
            <select
              id="status-filter"
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'all' || isValidAssignmentStatus(val)) {
                  setStatusFilter(val)
                }
              }}
            >
              <option value="all">Все</option>
              <option value="todo">К выполнению</option>
              <option value="in_progress">В процессе</option>
              <option value="done">Выполнено</option>
            </select>
          </div>
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => setStatusFilter('all')}
            disabled={statusFilter === 'all'}
          >
            Сбросить фильтр
          </button>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="empty-state">
          <p>Заданий пока нет.</p>
          <Link to="/assignments/new" className="button button-primary">
            Создать задание
          </Link>
        </div>
      ) : visibleAssignments.length === 0 ? (
        <div className="empty-state">
          <p>Нет заданий с выбранным статусом.</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setStatusFilter('all')}
          >
            Сбросить фильтр
          </button>
        </div>
      ) : (
        <div className="assignments-grid">
          {visibleAssignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </section>
  )
}
