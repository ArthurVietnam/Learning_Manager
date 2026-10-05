import { useNavigate, Link } from 'react-router'
import type { AssignmentDraft } from '../types/assignment'
import { EMPTY_ASSIGNMENT_DRAFT } from '../types/assignment'
import { AssignmentForm } from '../components/AssignmentForm'

export interface NewAssignmentPageProps {
  onCreate: (draft: AssignmentDraft) => string
}

export function NewAssignmentPage({ onCreate }: NewAssignmentPageProps) {
  const navigate = useNavigate()

  function handleSave(draft: AssignmentDraft) {
    const id = onCreate(draft)
    navigate(`/assignments/${id}`)
  }

  return (
    <section className="page new-assignment-page">
      <nav className="breadcrumbs" aria-label="Навигация назад">
        <Link to="/assignments" className="link-back">
          К списку заданий
        </Link>
      </nav>

      <header className="page-header">
        <div>
          <h2>Создание задания</h2>
          <p className="page-subtitle">
            Заполните параметры учебного задания и сохраните в локальный список.
          </p>
        </div>
      </header>

      <AssignmentForm
        initialValues={EMPTY_ASSIGNMENT_DRAFT}
        onSave={handleSave}
        onCancel={() => navigate('/assignments')}
      />
    </section>
  )
}
