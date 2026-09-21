import './App.css'

const appTitle: string = 'Учебный менеджер'

export default function App() {
  return (
    <main className="app">
      <header>
        <h1>{appTitle}</h1>
        <p>Личные учебные задания по вашим курсам: сроки, статус и сложность.</p>
      </header>

      <section aria-labelledby="items-title">
        <h2 id="items-title">Мои задания</h2>
        <p>Здесь появится список ваших заданий.</p>
      </section>
    </main>
  )
}
