import { Link } from 'react-router'
import type { Assignment } from '../types/assignment'
import { STATUS_LABELS, DIFFICULTY_LABELS, isOverdueAssignment } from '../types/assignment'

interface AssignmentCardProps {
  assignment: Assignment
}

export function AssignmentCard({ assignment }: AssignmentCardProps) {
  const isOverdue = isOverdueAssignment(assignment)

  return (
    <article className="assignment-card">
      <header className="card-header">
        <span className="card-course">{assignment.courseTitle}</span>
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
            {DIFFICULTY_LABELS[assignment.difficulty]}
          </span>
        </div>
      </header>

      <h3 className="card-title">
        <Link to={`/assignments/${assignment.id}`} className="card-title-link">
          {assignment.title}
        </Link>
      </h3>

      <p className="card-description">{assignment.description}</p>

      <footer className="card-footer">
        <span className={`card-due-date ${isOverdue ? 'due-date-overdue' : ''}`}>
          Срок: <time dateTime={assignment.dueDate}>{assignment.dueDate}</time>
        </span>
        <Link to={`/assignments/${assignment.id}`} className="card-details-link">
          Подробнее &rarr;
        </Link>
      </footer>
    </article>
  )
}
