import { Link } from 'react-router'

export function NewAssignmentPage() {
  return (
    <section className="page new-assignment-page">
      <nav className="breadcrumbs" aria-label="Навигация назад">
        <Link to="/assignments" className="link-back">
          К списку заданий
        </Link>
      </nav>

      <h1>Создание задания</h1>

      <div className="stub-notice">
        <p>Форма появится в следующей лабораторной работе (ЛР 3); сохранение пока не выполняется.</p>
      </div>

      <div className="form-stub-placeholder">
        <p className="placeholder-text">
          В следующей лабораторной работе здесь будет представлена форма добавления учебного задания:
          название, подробное описание, выбор курса из справочника, указание срока сдачи (дедлайна),
          начального статуса и уровня сложности.
        </p>
        <Link to="/assignments" className="button button-secondary">
          К списку заданий
        </Link>
      </div>
    </section>
  )
}
