import { useParams, useNavigate, Link } from 'react-router'
import type { Assignment, AssignmentDraft } from '../types/assignment'
import { AssignmentForm } from '../components/AssignmentForm'

export interface EditAssignmentPageProps {
  assignments: Assignment[]
  onUpdate: (id: string, draft: AssignmentDraft) => void
}

export function EditAssignmentPage({ assignments, onUpdate }: EditAssignmentPageProps) {
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

  const initialValues: AssignmentDraft = {
    title: assignment.title,
    description: assignment.description,
    courseId: assignment.courseId,
    courseTitle: assignment.courseTitle,
    dueDate: assignment.dueDate,
    status: assignment.status,
    difficulty: assignment.difficulty,
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
        onSave={(draft) => {
          onUpdate(assignment.id, draft)
          navigate(`/assignments/${assignment.id}`)
        }}
        onCancel={() => navigate(`/assignments/${assignment.id}`)}
      />
    </section>
  )
}
