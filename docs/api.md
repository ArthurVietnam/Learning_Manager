# Контракт HTTP API (Лабораторная работа 9)

Документация авторизованного backend-сервиса на Node.js, TypeScript и Express, взаимодействующего с базой данных Supabase под контекстом текущего пользователя (`React → Node → Supabase`).

---

## 1. Архитектурный обзор и разделение ответственности

В Лабораторной работе 9 реализован сквозной защищённый сценарий взаимодействия трех компонентов системы:

```
[ Frontend (React SPA) ]
         │
         │  HTTP + Authorization: Bearer <JWT>
         ▼
[ Backend (Node API Express) ]
         │
         │  1. requireUser: authClient.auth.getUser(token)
         │  2. Runtime validation: parseCreateTask / parseDateRange
         │  3. Request-scoped client: createUserClient(token)
         ▼
[ Database (Supabase / PostgreSQL) ]
         │
         │  Row Level Security (RLS): auth.uid() = owner_id
         ▼
[ Response 200 / 201 ] ──► [ Node API ] ──► [ Frontend ]
```

### Принципы безопасности и изоляции:
1. **Bearer token и проверка подлинности**:
   - Браузер передаёт действующий сессионный `access_token` в заголовке `Authorization: Bearer <token>`.
   - Node API не доверяет сырому JWT и не декодирует base64 вручную: проверка выполняется официальным методом `authClient.auth.getUser(token)`.
   - Если токен отсутствует, повреждён, истёк или сфальсифицирован, сервер возвращает статус **401 Unauthorized** без раскрытия stack trace.
2. **Request-scoped Supabase-клиент**:
   - Для каждого входящего HTTP-запроса создаётся изолированный экземпляр клиента через фабрику `createUserClient(token)`.
   - Опция `accessToken: async () => token` передаёт JWT пользователя в каждый запрос к PostgREST.
   - Клиенты разных пользователей **не смешиваются** и не хранятся в глобальных переменных.
3. **Строгий запрет `service_role`**:
   - Node API использует только `SUPABASE_PUBLISHABLE_KEY` (`anon key`).
   - Ключи `service_role` и `secret key` исключены: Node API не имеет права обходить Row Level Security.
4. **Недоверие к `owner_id` из браузера**:
   - Поле `owner_id` удалено из входного контракта создания сущности.
   - Если клиент передаёт `owner_id`, `id` или `created_at` в теле запроса, сервер отклоняет запрос со статусом **400 Validation Error** («Поле owner_id не принимается клиентом»).
   - Доверенный `owner_id` извлекается строго из проверенного результата `getUser(token)` (`res.locals.auth.userId`).
5. **Удаление временного маршрута ЛР 8**:
   - Временный эндпоинт `POST /api/summary/:kind` удалён: браузер больше не передаёт массив задач для итогового расчёта. Расчёт показателей выполняется на сервере на основе данных, загруженных из БД в контексте владельца.

---

## 2. Общие параметры взаимодействия

- **Базовый URL разработки:** `http://localhost:3000`
- **Протокол:** HTTP/1.1
- **Формат обмена:** `application/json` (кодировка UTF-8)
- **Лимит тела запроса:** `100kb` (`express.json({ limit: '100kb' })`)
- **CORS:** Настроен для источника, указанного в `FRONTEND_ORIGIN` (по умолчанию `http://localhost:5173`), разрешены методы `GET`, `POST`, `OPTIONS` и заголовки `Content-Type`, `Authorization`.

### Единый конверт ответов

- **Успешный ответ предметного ресурса (200 / 201):**
  ```json
  {
    "data": { ... }
  }
  ```
- **Служебный ответ проверки работоспособности (200):**
  ```json
  {
    "status": "ok"
  }
  ```
- **Единый конверт ошибок:**
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR | BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | PAYLOAD_TOO_LARGE | INTERNAL_ERROR",
      "message": "Человекочитаемое описание ошибки",
      "fields": {
        "fieldName": "Описание ошибки для конкретного поля"
      }
    }
  }
  ```

---

## 3. Спецификация маршрутов

### 3.1. Проверка работоспособности сервиса (`GET /api/health`)

Публичный эндпоинт для контроля доступности процесса Express.

- **Метод:** `GET`
- **Путь:** `/api/health`
- **Авторизация:** не требуется
- **Ответ (`200 OK`):**
  ```json
  {
    "status": "ok"
  }
  ```

---

### 3.2. Создание учебного задания (`POST /api/tasks` и алиас `POST /api/assignments`)

Создаёт новую запись в таблице `assignments` базы данных Supabase от имени аутентифицированного пользователя.

- **Метод:** `POST`
- **Путь:** `/api/tasks` *(поддерживается алиас `/api/assignments`)*
- **Заголовки запроса:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <access_token>` *(обязательно)*

#### Структура тела запроса (Request Body)

```json
{
  "courseId": "c1",
  "title": "Лабораторная работа 9",
  "description": "Связать React, Node API и Supabase под RLS",
  "status": "todo",
  "dueDate": "2026-11-30",
  "difficulty": "medium"
}
```

#### Правила валидации полей

| Поле | Тип | Обязательность | Правила / Ограничения |
| :--- | :--- | :--- | :--- |
| `title` | `string` | Обязательно | Длина после `trim()` от 3 до 100 символов включительно. |
| `courseId` | `string` | Обязательно | Непустой идентификатор курса (допускаются алиасы `course_id`, `tagId`). |
| `description` | `string` | Необязательно | Описание задания (по умолчанию пустая строка `""`). |
| `status` | `string` | Обязательно | Одно из значений: `'todo'`, `'in_progress'`, `'done'`. |
| `dueDate` | `string` | Обязательно | Календарная дата формата `YYYY-MM-DD` (допускается алиас `due_date`). |
| `difficulty` | `string` | Необязательно | `'easy'`, `'medium'`, `'hard'` (также принимаются алиасы `low` -> `easy`, `high` -> `hard`; по умолчанию `'medium'`). |
| `owner_id` / `id` / `created_at` | `любой` | **Запрещено** | При передаче сервер возвращает **400 VALIDATION_ERROR**. |

#### Пример успешного ответа (`201 Created`)

```json
{
  "data": {
    "id": "7f13b631-50e9-4e78-9586-7a7605e55e81",
    "owner_id": "a9018e6c-7f55-4e76-8809-548549925230",
    "course_id": "c1",
    "title": "Лабораторная работа 9",
    "description": "Связать React, Node API и Supabase под RLS",
    "status": "todo",
    "due_date": "2026-11-30",
    "difficulty": "medium",
    "created_at": "2026-11-23T12:00:00.000Z",
    "courses": {
      "id": "c1",
      "name": "Практический курс веб-разработки"
    }
  }
}
```

#### Коды ошибок:
- **`400 Bad Request` (`VALIDATION_ERROR`):** Нарушение длины заголовка, невалидная дата, передача поля `owner_id` / `id`, нарушение внешнего ключа или CHECK-ограничения базы.
- **`401 Unauthorized` (`UNAUTHORIZED`):** Отсутствует заголовок `Authorization`, передан не Bearer-токен или сессия недействительна.
- **`409 Conflict` (`CONFLICT`):** Нарушение ограничения уникальности (`unique_violation` в PostgreSQL, код 23505).
- **`413 Payload Too Large` (`PAYLOAD_TOO_LARGE`):** Тело запроса превышает 100kb.
- **`500 Internal Server Error` (`INTERNAL_ERROR`):** Непредвиденный сбой сервера.

---

### 3.3. Получение сводки показателей (`GET /api/summary`)

Загружает строки текущего пользователя из Supabase (с постраничной пагинацией порциями по 500 записей), вычисляет агрегированные показатели на сервере и возвращает результат.

- **Метод:** `GET`
- **Путь:** `/api/summary`
- **Заголовки запроса:**
  - `Authorization: Bearer <access_token>` *(обязательно)*
- **Параметры Query (необязательные):**
  - `from` (`string`): Начальная дата периода (`YYYY-MM-DD`, включительно).
  - `to` (`string`): Конечная дата периода (`YYYY-MM-DD`, включительно).
  - Если параметры опущены, сервер использует широкий диапазон по умолчанию (`1970-01-01` .. `2099-12-31`).

#### Пример запроса
```http
GET /api/summary?from=2026-01-01&to=2026-12-31 HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1Ni...
```

#### Пример успешного ответа (`200 OK`)

```json
{
  "data": {
    "active": 4,
    "completed": 2,
    "overdue": 1
  }
}
```

#### Логика расчёта показателей:
- **`active`**: количество задач пользователя со статусом, отличным от выполненного (`status !== 'done'`).
- **`completed`**: количество задач пользователя со статусом «выполнено» (`status === 'done'`).
- **`overdue`**: количество незавершённых задач (`status !== 'done'`), у которых срок сдачи строго меньше сегодняшней календарной даты сервера (`dueDate !== null && dueDate < today`).

#### Коды ошибок:
- **`400 Bad Request` (`VALIDATION_ERROR`):** Некорректный формат дат `from`/`to`, дата `from` позже `to`, либо превышен лимит периода (10 лет).
- **`401 Unauthorized` (`UNAUTHORIZED`):** Отсутствует или недействителен токен авторизации.
- **`500 Internal Server Error` (`INTERNAL_ERROR`):** Ошибка взаимодействия с базой данных.

---

### 3.4. Удаление временного маршрута ЛР 8

Маршрут `POST /api/summary/:kind` из Лабораторной работы 8 **удалён**. Попытка обращения к нему возвращает:
- **Код ответа:** `404 Not Found`
- **Тело:**
  ```json
  {
    "error": {
      "code": "NOT_FOUND",
      "message": "Маршрут не найден"
    }
  }
  ```

---

## 4. Маппинг ошибок PostgreSQL / PostgREST в HTTP-коды

Функция `mapSupabaseError` переводит технические коды PostgREST в безопасные HTTP-ответы:

| Код ошибки PostgreSQL | Смысл ошибки | HTTP-код | Код ошибки API (`error.code`) |
| :--- | :--- | :--- | :--- |
| `23505` | Нарушение уникальности (`unique_violation`) | `409 Conflict` | `CONFLICT` |
| `23503` | Нарушение внешнего ключа (`foreign_key_violation`) | `400 Bad Request` | `VALIDATION_ERROR` |
| `23514` | Нарушение CHECK-ограничения (`check_violation`) | `400 Bad Request` | `VALIDATION_ERROR` |
| `42501` | Нарушение политики RLS / прав доступа (`insufficient_privilege`) | `403 Forbidden` | `FORBIDDEN` |
| `PGRST116` | Запись не найдена при вызове `.single()` | `404 Not Found` | `NOT_FOUND` |
| Прочие | Непредвиденные сбои БД и сети | `500 Internal Server Error` | `INTERNAL_ERROR` |
