import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AssignmentDraft } from '../types/assignment'
import {
  isValidAssignmentStatus,
  isValidAssignmentDifficulty,
  validateAssignmentDraft,
} from '../types/assignment'
import { COURSES } from '../data/courses'

export interface AssignmentFormProps {
  initialValues: AssignmentDraft
  onSave: (draft: AssignmentDraft) => void
  onCancel: () => void
}

export function AssignmentForm(props: AssignmentFormProps) {
  const [draft, setDraft] = useState<AssignmentDraft>(() => ({ ...props.initialValues }))
  const [error, setError] = useState<string>('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedTitle = draft.title.trim()
    const trimmedDescription = draft.description.trim()
    const validationError = validateAssignmentDraft({
      ...draft,
      title: trimmedTitle,
      description: trimmedDescription,
    })

    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    props.onSave({
      ...draft,
      title: trimmedTitle,
      description: trimmedDescription,
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="assignment-form">
      <div className="form-group">
        <label htmlFor="assignment-title" className="form-label">
          Название <span className="form-required">*</span>
        </label>
        <input
          id="assignment-title"
          className="form-input"
          type="text"
          value={draft.title}
          required
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Например, Лабораторная работа 3"
        />
      </div>

      <div className="form-row form-row-2">
        <div className="form-group">
          <label htmlFor="assignment-course" className="form-label">
            Курс <span className="form-required">*</span>
          </label>
          <select
            id="assignment-course"
            className="form-select"
            value={draft.courseId}
            onChange={(e) => {
              const selectedCourse = COURSES.find((c) => c.id === e.target.value)
              if (selectedCourse) {
                setDraft({
                  ...draft,
                  courseId: selectedCourse.id,
                  courseTitle: selectedCourse.title,
                })
              }
            }}
          >
            {COURSES.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title} ({course.code})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="assignment-date" className="form-label">
            Срок сдачи <span className="form-required">*</span>
          </label>
          <input
            id="assignment-date"
            className="form-input"
            type="date"
            value={draft.dueDate}
            required
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
        </div>
      </div>

      <div className="form-row form-row-2">
        <div className="form-group">
          <label htmlFor="assignment-status" className="form-label">
            Статус
          </label>
          <select
            id="assignment-status"
            className="form-select"
            value={draft.status}
            onChange={(e) => {
              const value = e.target.value
              if (isValidAssignmentStatus(value)) {
                setDraft({ ...draft, status: value })
              }
            }}
          >
            <option value="todo">К выполнению</option>
            <option value="in_progress">В процессе</option>
            <option value="done">Выполнено</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="assignment-difficulty" className="form-label">
            Сложность
          </label>
          <select
            id="assignment-difficulty"
            className="form-select"
            value={draft.difficulty}
            onChange={(e) => {
              const value = e.target.value
              if (isValidAssignmentDifficulty(value)) {
                setDraft({ ...draft, difficulty: value })
              }
            }}
          >
            <option value="easy">Низкая</option>
            <option value="medium">Средняя</option>
            <option value="hard">Высокая</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="assignment-description" className="form-label">
          Описание {draft.status === 'done' && <span className="form-required">*</span>}
        </label>
        <textarea
          id="assignment-description"
          className="form-textarea"
          rows={4}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Подробное описание требований или результатов выполнения..."
        />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button button-primary">
          Сохранить
        </button>
        <button type="button" className="button button-secondary" onClick={props.onCancel}>
          Отмена
        </button>
      </div>
    </form>
  )
}
