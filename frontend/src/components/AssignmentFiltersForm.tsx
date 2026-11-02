import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import type {
  AssignmentFilters,
  AssignmentStatus,
} from '../types/assignment.ts'
import {
  emptyAssignmentFilters,
  isValidAssignmentStatus,
} from '../types/assignment.ts'
import type { Course } from '../types/course.ts'

export interface AssignmentFiltersFormProps {
  value: AssignmentFilters
  pending?: boolean
  courses?: Course[]
  onApply: (filters: AssignmentFilters) => void
  onReset?: () => void
}

export function AssignmentFiltersForm({
  value,
  pending = false,
  courses = [],
  onApply,
  onReset,
}: AssignmentFiltersFormProps) {
  const [draft, setDraft] = useState<AssignmentFilters>(() => ({ ...value }))

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setDraft({ ...value })
  }, [value])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onApply({
      ...draft,
      query: draft.query.trim(),
    })
  }

  function handleReset() {
    setDraft(emptyAssignmentFilters)
    if (onReset) {
      onReset()
    } else {
      onApply(emptyAssignmentFilters)
    }
  }

  function handleClearQuery() {
    setDraft((prev) => ({ ...prev, query: '' }))
  }

  return (
    <form
      className="assignment-filters-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Фильтры заданий"
    >
      <div className="filters-grid">
        <div className="filter-field filter-field-search">
          <label htmlFor="filter-query" className="filter-label">
            Поиск по названию
          </label>
          <div className="filter-input-wrap">
            <input
              id="filter-query"
              type="text"
              className="form-input filter-search-input"
              value={draft.query}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, query: e.target.value }))
              }
              placeholder="Поиск по названию..."
              maxLength={100}
              disabled={pending}
            />
            {draft.query.length > 0 && (
              <button
                type="button"
                className="filter-clear-btn"
                onClick={handleClearQuery}
                disabled={pending}
                aria-label="Очистить строку поиска"
                title="Очистить"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        <div className="filter-field">
          <label htmlFor="filter-status" className="filter-label">
            Статус
          </label>
          <select
            id="filter-status"
            className="form-select filter-select"
            value={draft.status}
            disabled={pending}
            onChange={(e) => {
              const val = e.target.value
              if (val === 'all' || isValidAssignmentStatus(val)) {
                setDraft((prev) => ({
                  ...prev,
                  status: val as 'all' | AssignmentStatus,
                }))
              }
            }}
          >
            <option value="all">Все статусы</option>
            <option value="todo">К выполнению</option>
            <option value="in_progress">В процессе</option>
            <option value="done">Выполнено</option>
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="filter-course" className="filter-label">
            Курс
          </label>
          <select
            id="filter-course"
            className="form-select filter-select"
            value={draft.courseId}
            disabled={pending}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                courseId: e.target.value,
              }))
            }
          >
            <option value="all">Все курсы</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-actions">
          <button
            type="submit"
            className="button button-primary"
            disabled={pending}
          >
            Применить
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={handleReset}
          >
            Сбросить
          </button>
          {pending && (
            <span
              className="filter-pending-indicator"
              role="status"
              aria-live="polite"
            >
              Загрузка…
            </span>
          )}
        </div>
      </div>
    </form>
  )
}
