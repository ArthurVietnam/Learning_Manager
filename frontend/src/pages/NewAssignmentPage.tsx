import { useNavigate, Link } from 'react-router'
import type { AssignmentDraft } from '../types/assignment.ts'
import { EMPTY_ASSIGNMENT_DRAFT } from '../types/assignment.ts'
import { AssignmentForm } from '../components/AssignmentForm.tsx'

export interface NewAssignmentPageProps {
  onCreate: (draft: AssignmentDraft) => Promise<string>
}

export function NewAssignmentPage({ onCreate }: NewAssignmentPageProps) {
  const navigate = useNavigate()

  async function handleSave(draft: AssignmentDraft) {
    const id = await onCreate(draft)
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
            Заполните параметры учебного задания и сохраните в Supabase.
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
