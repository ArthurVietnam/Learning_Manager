import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="page not-found-page">
      <h1>Страница не найдена</h1>
      <p>Запрошенный адрес не существует или страница была перемещена.</p>
      <Link to="/assignments" className="button button-primary">
        К списку заданий
      </Link>
    </section>
  )
}
