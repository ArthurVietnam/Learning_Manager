import { Link } from 'react-router'
import type { Assignment } from '../types/assignment'
import { ASSIGNMENTS } from '../data/assignments'
import { calculateAssignmentStats } from '../types/assignment'
import { AssignmentCard } from '../components/AssignmentCard'

interface AssignmentsPageProps {
  assignments?: Assignment[]
}

export function AssignmentsPage({ assignments = ASSIGNMENTS }: AssignmentsPageProps) {
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

      {assignments.length === 0 ? (
        <div className="empty-state">
          <p>Заданий пока нет.</p>
        </div>
      ) : (
        <div className="assignments-grid">
          {assignments.map((assignment) => (
            <AssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </section>
  )
}
