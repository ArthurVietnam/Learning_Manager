import { useParams, Link, useNavigate } from 'react-router'
import type { Assignment } from '../types/assignment'
import { STATUS_LABELS, DIFFICULTY_LABELS, isOverdueAssignment } from '../types/assignment'

export interface AssignmentDetailsPageProps {
  assignments: Assignment[]
  onDelete: (id: string) => void
}

export function AssignmentDetailsPage({ assignments, onDelete }: AssignmentDetailsPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const assignment = assignments.find((item) => item.id === id)

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

  const isOverdue = isOverdueAssignment(assignment)

  function handleDelete() {
    if (!assignment) {
      return
    }
    if (window.confirm(`Удалить задание «${assignment.title}»?`)) {
      onDelete(assignment.id)
      navigate('/assignments', { replace: true })
    }
  }

  return (
    <article className="page assignment-details">
      <nav className="breadcrumbs" aria-label="Навигация назад">
        <Link to="/assignments" className="link-back">
          К списку заданий
        </Link>
      </nav>

      <header className="details-header">
        <div className="card-badges">
          {isOverdue && (
            <span className="badge badge-overdue" title="Срок сдачи истёк">
              Просрочено
            </span>
          )}
          <span className={`badge status-badge status-${assignment.status}`}>
            {STATUS_LABELS[assignment.status]}
          </span>
          <span className={`badge difficulty-badge difficulty-${assignment.difficulty}`}>
            Сложность: {DIFFICULTY_LABELS[assignment.difficulty]}
          </span>
        </div>
        <h1 className="details-title">{assignment.title}</h1>
      </header>

      <div className="details-card">
        <section className="details-section">
          <h3>Описание</h3>
          <p className="details-description">{assignment.description}</p>
        </section>

        <section className="details-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Курс</span>
            <span className="meta-value">{assignment.courseTitle}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Дедлайн</span>
            <span className={`meta-value ${isOverdue ? 'due-date-overdue' : ''}`}>
              <time dateTime={assignment.dueDate}>{assignment.dueDate}</time>
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Статус</span>
            <span className="meta-value">{STATUS_LABELS[assignment.status]}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Сложность</span>
            <span className="meta-value">{DIFFICULTY_LABELS[assignment.difficulty]}</span>
          </div>
        </section>
      </div>

      <footer className="details-footer">
        <div className="details-actions">
          <Link to={`/assignments/${assignment.id}/edit`} className="button button-primary">
            Редактировать
          </Link>
          <button type="button" className="button button-danger" onClick={handleDelete}>
            Удалить
          </button>
          <Link to="/assignments" className="button button-secondary">
            К списку заданий
          </Link>
        </div>
      </footer>
    </article>
  )
}
