import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { AssignmentDraft } from '../types/assignment.ts'
import {
  isValidAssignmentStatus,
  isValidAssignmentDifficulty,
  validateAssignmentDraft,
} from '../types/assignment.ts'
import { useCourses } from '../hooks/useCourses.ts'
import { ApiError } from '../services/api.ts'

export interface AssignmentFormProps {
  initialValues: AssignmentDraft
  onSave: (draft: AssignmentDraft) => Promise<void> | void
  onCancel: () => void
}

export function AssignmentForm(props: AssignmentFormProps) {
  const [draft, setDraft] = useState<AssignmentDraft>(() => ({ ...props.initialValues }))
  const [error, setError] = useState<string>('')
  const [submitError, setSubmitError] = useState<string>('')
  const [isAuthExpired, setIsAuthExpired] = useState<boolean>(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<boolean>(false)
  const { load, retry } = useCourses()

  const courses = load.status === 'success' ? load.data : []
  const selectedCourseExists = courses.some((c) => c.id === draft.courseId)
  const canSave = load.status === 'success' && selectedCourseExists

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (!canSave) {
      setError('Дождитесь справочника и выберите доступный курс.')
      return
    }

    const trimmedTitle = draft.title.trim()
    const trimmedDescription = draft.description.trim()
    const selectedCourse = courses.find((c) => c.id === draft.courseId)
    const courseTitle = selectedCourse ? selectedCourse.name : draft.courseTitle

    const validationError = validateAssignmentDraft(
      {
        ...draft,
        title: trimmedTitle,
        description: trimmedDescription,
        courseTitle,
      },
      courses,
    )

    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSubmitError('')
    setIsAuthExpired(false)
    setFieldErrors({})

    try {
      setPending(true)
      await props.onSave({
        ...draft,
        title: trimmedTitle,
        description: trimmedDescription,
        courseTitle,
      })
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setIsAuthExpired(true)
          setSubmitError(
            err.message || 'Сессия истекла или недействительна. Пожалуйста, выполните вход снова.',
          )
        } else if (err.status === 400 && err.error?.fields) {
          setFieldErrors(err.error.fields)
          setSubmitError(err.message || 'Ошибка валидации полей')
        } else {
          setSubmitError(err.message)
        }
      } else if (err instanceof Error) {
        if (err.message.includes('Сессия истекла') || err.message.includes('401')) {
          setIsAuthExpired(true)
        }
        setSubmitError(err.message)
      } else {
        setSubmitError('Не удалось сохранить запись.')
      }
    } finally {
      setPending(false)
    }
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
          disabled={pending}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Например, Лабораторная работа 6"
        />
        {fieldErrors.title && (
          <p role="alert" className="form-feedback-error">
            {fieldErrors.title}
          </p>
        )}
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
            required
            disabled={load.status !== 'success' || courses.length === 0 || pending}
            onChange={(e) => {
              const nextId = e.target.value
              const selectedCourse = courses.find((c) => c.id === nextId)
              setDraft({
                ...draft,
                courseId: nextId,
                courseTitle: selectedCourse
                  ? selectedCourse.name
                  : nextId === ''
                    ? ''
                    : draft.courseTitle,
              })
            }}
          >
            <option value="">Выберите курс</option>
            {draft.courseId !== '' && !selectedCourseExists && (
              <option value={draft.courseId} disabled>
                Текущий код: {draft.courseId} — выберите доступный курс
              </option>
            )}
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>

          {load.status === 'loading' && (
            <p role="status" className="form-hint">
              Загружаем курсы…
            </p>
          )}

          {load.status === 'error' && (
            <div className="course-feedback-block">
              <p role="alert" className="form-feedback-error">
                {load.message}
              </p>
              <button
                type="button"
                className="button button-secondary button-sm"
                onClick={retry}
                disabled={pending}
              >
                Повторить
              </button>
            </div>
          )}

          {load.status === 'success' && courses.length === 0 && (
            <p role="status" className="form-feedback-empty">
              Курсов пока нет. Сохранение недоступно.
            </p>
          )}

          {load.status !== 'error' && (
            <div className="course-feedback-block">
              <button
                type="button"
                className="button button-secondary button-sm"
                onClick={retry}
                disabled={load.status === 'loading' || pending}
              >
                Обновить справочник
              </button>
            </div>
          )}

          {fieldErrors.courseId && (
            <p role="alert" className="form-feedback-error">
              {fieldErrors.courseId}
            </p>
          )}

          {load.status === 'success' &&
            courses.length > 0 &&
            draft.courseId !== '' &&
            !selectedCourseExists && (
              <p role="status" className="form-hint form-hint-warning">
                Курс «{draft.courseId}» не найден в справочнике. Выберите доступный курс.
              </p>
            )}
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
            disabled={pending}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
          {fieldErrors.dueDate && (
            <p role="alert" className="form-feedback-error">
              {fieldErrors.dueDate}
            </p>
          )}
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
            disabled={pending}
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
            disabled={pending}
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
          disabled={pending}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Подробное описание требований или результатов выполнения..."
        />
        {fieldErrors.description && (
          <p role="alert" className="form-feedback-error">
            {fieldErrors.description}
          </p>
        )}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {isAuthExpired ? (
        <div className="form-error form-error-auth" role="alert">
          <p style={{ margin: 0 }}>
            {submitError || 'Сессия истекла или недействительна. Черновик сохранён в форме.'}
          </p>
          <div style={{ marginTop: '8px' }}>
            <Link to="/auth" className="button button-primary button-sm">
              Войти снова
            </Link>
          </div>
        </div>
      ) : (
        submitError && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )
      )}

      <div className="form-actions">
        <button
          type="submit"
          className="button button-primary"
          disabled={!canSave || pending}
        >
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={props.onCancel}
          disabled={pending}
        >
          Отмена
        </button>
      </div>
    </form>
  )
}
