import { useParams, useNavigate, Link } from 'react-router'
import type { Assignment, AssignmentDraft } from '../types/assignment.ts'
import { AssignmentForm } from '../components/AssignmentForm.tsx'

export interface EditAssignmentPageProps {
  assignments: Assignment[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onUpdate: (id: string, draft: AssignmentDraft) => Promise<void>
}

export function EditAssignmentPage({
  assignments,
  loading = false,
  error = null,
  onRetry,
  onUpdate,
}: EditAssignmentPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const assignment = assignments.find((item) => item.id === id)

  if (loading && !assignment) {
    return (
      <section className="page edit-assignment-page">
        <div className="status-notice" role="status">
          <p>Загружаем задание…</p>
        </div>
      </section>
    )
  }

  if (error && !assignment) {
    return (
      <section className="page edit-assignment-page">
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
      </section>
    )
  }

  if (!assignment) {
    return (
      <section className="page not-found-item">
        <h1>Задание не найдено</h1>
        <p>Задание с указанным идентификатором не найдено в каталоге.</p>
        <Link to="/assignments" className="button button-primary">
          К списку заданий
        </Link>
      </section>
    )
  }

  const initialValues: AssignmentDraft = {
    title: assignment.title,
    description: assignment.description,
    courseId: assignment.courseId,
    courseTitle: assignment.courseTitle,
    dueDate: assignment.dueDate,
    status: assignment.status,
    difficulty: assignment.difficulty,
  }

  async function handleSave(draft: AssignmentDraft) {
    if (!assignment) return
    await onUpdate(assignment.id, draft)
    navigate(`/assignments/${assignment.id}`)
  }

  return (
    <section className="page edit-assignment-page">
      <nav className="breadcrumbs" aria-label="Навигация назад">
        <Link to={`/assignments/${assignment.id}`} className="link-back">
          К заданию
        </Link>
      </nav>

      <header className="page-header">
        <div>
          <h2>Редактирование задания</h2>
          <p className="page-subtitle">
            Изменение параметров задания. Идентификатор записи останется прежним.
          </p>
        </div>
      </header>

      <AssignmentForm
        key={assignment.id}
        initialValues={initialValues}
        onSave={handleSave}
        onCancel={() => navigate(`/assignments/${assignment.id}`)}
      />
    </section>
  )
}
