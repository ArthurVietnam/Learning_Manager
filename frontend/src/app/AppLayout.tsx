import { NavLink, Outlet } from 'react-router'

export function AppLayout() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-inner">
          <h1 className="app-brand">
            <NavLink to="/assignments" className="brand-link">
              Учебный менеджер
            </NavLink>
          </h1>
          <nav className="app-nav" aria-label="Основная навигация">
            <NavLink
              to="/assignments"
              end
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Задания
            </NavLink>
            <NavLink
              to="/assignments/new"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Добавить задание
            </NavLink>
          </nav>
        </div>
      </header>

      <aside className="memory-notice-banner" role="status">
        <span className="notice-icon" aria-hidden="true">ℹ️</span>
        <span>
          Данные сохраняются временно в оперативной памяти приложения. При перезагрузке страницы (F5) восстановится демонстрационный набор заданий. Постоянное хранение появится вместе с Supabase.
        </span>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
