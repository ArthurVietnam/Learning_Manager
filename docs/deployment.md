# Руководство по развёртыванию (Deployment Guide)

> **Лабораторная работа 10. Публикация full-stack приложения**  
> **Проект:** «Учебный менеджер»  
> **Студент:** Мунтян Артур Олегович, группа 24ПИ1  
> **Платформа:** Сервер под управлением Ubuntu Linux (22.04 / 24.04 LTS)  
> **Основной домен:** `muntyandev.ru`  
> **Публичные поддомены:**  
> - Frontend SPA (React + Vite): **`https://course.muntyandev.ru`**  
> - Backend API (Node.js + Express): **`https://api-course.muntyandev.ru`**  
> - База данных и Auth (Supabase): `https://epbglesngndopojuffed.supabase.co`

---

## 1. Архитектура публикации и модель разделения Origin

Развёрнутая система объединяет три независимых сервиса, каждый из которых имеет собственный изолированный origin:

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │                     Браузер клиента                    │
                                    └──────────────┬─────────────────────────┬───────────────┘
                                                   │                         │
                   HTTPS: HTML / JS / Assets       │                         │  HTTPS: REST API
         ┌─────────────────────────────────────────┘                         └─────────────────────────────────┐
         ▼                                                                                                     ▼
┌─────────────────────────────────┐                                                         ┌─────────────────────────────────┐
│     Nginx Web Server            │                                                         │     Nginx Reverse Proxy         │
│  (https://course.muntyandev.ru) │                                                         │ (https://api-course.muntyandev. │
└────────────────┬────────────────┘                                                         │               ru)               │
                 │                                                                          └────────────────┬────────────────┘
                 ▼                                                                                           │
┌─────────────────────────────────┐                                                                          ▼ proxy_pass :3000
│  Статические файлы Vite         │                                                         ┌─────────────────────────────────┐
│  /var/www/course-app/           │                                                         │   Node.js Express Web Service   │
│  frontend/dist                  │                                                         │   systemd: course-api.service   │
│  (try_files -> /index.html)     │                                                         │   (слушает 0.0.0.0:3000)        │
└─────────────────────────────────┘                                                         └────────────────┬────────────────┘
                 │                                                                                           │
                 │              Прямые запросы курсов и Auth (JWT)                                           │  Проверенный токен
                 └───────────────────────────────┬───────────────────────────────────────────────────────────┘  и запись с RLS
                                                 ▼
                                  ┌─────────────────────────────────┐
                                  │         Supabase Cloud          │
                                  │ (PostgreSQL, GoTrue Auth, RLS)  │
                                  │ https://epbglesngndopojuffed... │
                                  └─────────────────────────────────┘
```

### Разграничение ответственности:
1. **Frontend SPA (`https://course.muntyandev.ru`)**:
   - Статическая сборка Vite (`dist`), обслуживаемая веб-сервером Nginx.
   - Все маршруты роутера (`/assignments`, `/assignments/:id`, `/auth`) перенаправляются на `/index.html` через директиву `try_files $uri $uri/ /index.html;` (SPA fallback).
   - Включает только публичные build-time переменные: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`.

2. **Backend API (`https://api-course.muntyandev.ru`)**:
   - HTTP-сервис на базе Node.js 22 LTS и Express, выполняющийся в фоне через `systemd` (`course-api.service`).
   - Привязан к интерфейсу `0.0.0.0` и динамическому порту `PORT=3000`.
   - Nginx проксирует входящий HTTPS-трафик на локальный сокет через директиву `proxy_pass http://127.0.0.1:3000;`.
   - Реализует строгую проверку CORS: разрешает точный production origin `https://course.muntyandev.ru` (и локальный `http://localhost:5173` для разработки), исключая использование небезопасных масок `*` или `origin: true`.
   - Защищает создание заданий (`POST /api/tasks`) и расчёт сводки (`GET /api/summary`) через middleware `requireUser`, изолируя клиентов по токену сессии (`createUserClient(token)`).

3. **Supabase Cloud Project**:
   - Предоставляет аутентификацию (GoTrue), базу данных PostgreSQL 15, таблицы `courses` и `assignments`, внешние ключи, индексы и правила RLS.
   - Настройки URL Configuration разрешают редиректы исключительно на `https://course.muntyandev.ru/**` и `http://localhost:5173/**`.

---

## 2. Предварительные требования и настройка DNS

### 2.1. DNS-записи домена
В панели управления DNS домена `muntyandev.ru` созданы две A-записи, указывающие на публичный IPv4-адрес сервера Ubuntu:

| Тип записи | Имя хоста / Поддомен | Значение (IP) | TTL |
| :--- | :--- | :--- | :--- |
| `A` | `course.muntyandev.ru` | `<IP_АДРЕС_ВАШЕГО_СЕРВЕРА>` | 300 / Auto |
| `A` | `api-course.muntyandev.ru` | `<IP_АДРЕС_ВАШЕГО_СЕРВЕРА>` | 300 / Auto |

Проверка применения DNS на локальном компьютере:
```bash
nslookup course.muntyandev.ru
nslookup api-course.muntyandev.ru
```

---

## 3. Пошаговая инструкция по развёртыванию на Ubuntu Server

### Шаг 1. Подготовка операционной системы и установка пакетов

Подключитесь к серверу по SSH и обновите репозитории:
```bash
sudo apt update && sudo apt upgrade -y
```

Установите необходимые утилиты (Git, Nginx, Certbot):
```bash
sudo apt install -y git curl ufw nginx certbot python3-certbot-nginx
```

Установите Node.js 22 LTS (через официальный репозиторий NodeSource):
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # Должно вывести v22.x.x
npm -v    # Должно вывести 10.x.x
```

Настройте базовый файрвол UFW:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

### Шаг 2. Размещение репозитория на сервере

Создайте корневую директорию проекта в `/var/www/course-app`:
```bash
sudo mkdir -p /var/www/course-app
sudo chown -R $USER:$USER /var/www/course-app
```

Склонируйте исходный код репозитория:
```bash
git clone https://github.com/gerag/course-app.git /var/www/course-app
cd /var/www/course-app
```

---

### Шаг 3. Настройка и запуск Backend сервиса

1. **Создание файла переменных окружения backend:**
   Скопируйте шаблон конфигурации в рабочий файл `.env`:
   ```bash
   cp deploy/env/backend.env.example backend/.env
   nano backend/.env
   ```

   Содержимое `/var/www/course-app/backend/.env`:
   ```env
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   SUPABASE_URL=https://epbglesngndopojuffed.supabase.co
   SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYmdsZXNuZ25kb3BvanVmZmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjUyMTAsImV4cCI6MjEwODYwMTIxMH0.6krJuRKglXkJqSArjiWyYr4Rq_bDNunab_abixCGpSo
   FRONTEND_ORIGIN=https://course.muntyandev.ru,http://localhost:5173
   ```
   > **Важно по безопасности:** Переменные `SUPABASE_SERVICE_ROLE_KEY` или `SUPABASE_SECRET_KEY` категорически запрещены. Приложение завершит работу с ошибкой при их обнаружении.

2. **Установка зависимостей и компиляция TypeScript:**
   ```bash
   cd /var/www/course-app/backend
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```

3. **Ручная проверка запуска и настройка прав доступа:**
   ```bash
   npm start
   # В консоли появится: API is listening on 0.0.0.0:3000
   ```
   Нажмите `Ctrl+C` для остановки тестового запуска.

   Назначьте права на директорию бэкенда и файл `.env` для системного пользователя `www-data`:
   ```bash
   sudo chown -R www-data:www-data /var/www/course-app/backend
   sudo chmod 640 /var/www/course-app/backend/.env
   sudo chmod 755 /var/www/course-app/backend
   ```

4. **Настройка фонового сервиса через systemd:**
   Скопируйте unit-файл сервиса в системный каталог `/etc/systemd/system/`:
   ```bash
   sudo cp /var/www/course-app/deploy/systemd/course-api.service /etc/systemd/system/course-api.service
   ```

   Примените конфигурацию и включите автозапуск:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable course-api
   sudo systemctl start course-api
   ```

   Проверьте статус сервиса:
   ```bash
   sudo systemctl status course-api
   ```
   Сервис должен находиться в состоянии `active (running)`.

   Просмотр журналов работы:
   ```bash
   journalctl -u course-api -f
   ```

---

### Шаг 4. Сборка Frontend SPA

1. **Создание файла переменных сборки:**
   ```bash
   cd /var/www/course-app/frontend
   cp ../deploy/env/frontend.env.production.example .env.production
   nano .env.production
   ```

   Содержимое `/var/www/course-app/frontend/.env.production`:
   ```env
   VITE_SUPABASE_URL=https://epbglesngndopojuffed.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYmdsZXNuZ25kb3BvanVmZmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjUyMTAsImV4cCI6MjEwODYwMTIxMH0.6krJuRKglXkJqSArjiWyYr4Rq_bDNunab_abixCGpSo
   VITE_API_BASE_URL=https://api-course.muntyandev.ru
   ```
   > **Обратите внимание:** `VITE_API_BASE_URL` указывается строго без завершающего слеша `/` и без суффикса `/api`, так как транспорт `apiFetch` формирует пути `/api/...` самостоятельно.

2. **Сборка статического бандла:**
   ```bash
   npm ci
   npm run lint
   npm test
   npm run build
   ```
   В результате в каталоге `/var/www/course-app/frontend/dist` будут сгенерированы: `index.html` и каталог `assets/` с минифицированными и хешированными JS/CSS файлами.

3. **Настройка прав доступа для Nginx:**
   ```bash
   sudo chown -R www-data:www-data /var/www/course-app/frontend/dist
   sudo chmod -R 755 /var/www/course-app/frontend/dist
   ```

---

### Шаг 5. Конфигурация Nginx и получение SSL-сертификатов Let's Encrypt

> **Важное архитектурное замечание (Предотвращение ошибки отсутствия сертификатов):**  
> Конфигурационные файлы виртуальных хостов `course.muntyandev.ru.conf` и `api-course.muntyandev.ru.conf` уже настроены на работу по HTTPS и ссылаются на файлы сертификатов в `/etc/letsencrypt/live/...`. Если попытаться проверить синтаксис Nginx (`nginx -t`) до фактического выпуска сертификатов, Nginx выдаст фатальную ошибку `BIO_new_file() failed: No such file or directory`.
> 
> Поэтому первоначальный выпуск сертификатов выполняется автономно через Certbot Standalone при временно остановленном Nginx, после чего конфигурации активируются без каких-либо ошибок.

1. **Создание директории ACME challenge (для автопродления):**
   ```bash
   sudo mkdir -p /var/www/certbot
   sudo chown -R www-data:www-data /var/www/certbot
   ```

2. **Первоначальный выпуск SSL-сертификатов через Certbot Standalone:**
   Остановите Nginx (если служба уже запущена), чтобы освободить порт 80 для ACME-проверки:
   ```bash
   sudo systemctl stop nginx
   sudo certbot certonly --standalone -d course.muntyandev.ru -d api-course.muntyandev.ru
   ```
   Certbot запросит контактный email, подтвердит владение доменами по HTTP-01 challenge и сохранит сертификаты:
   - `/etc/letsencrypt/live/course.muntyandev.ru/fullchain.pem` и `privkey.pem`
   - `/etc/letsencrypt/live/api-course.muntyandev.ru/fullchain.pem` и `privkey.pem`

3. **Копирование и активация конфигураций виртуальных хостов Nginx:**
   ```bash
   sudo cp /var/www/course-app/deploy/nginx/course.muntyandev.ru.conf /etc/nginx/sites-available/
   sudo cp /var/www/course-app/deploy/nginx/api-course.muntyandev.ru.conf /etc/nginx/sites-available/
   sudo ln -sf /etc/nginx/sites-available/course.muntyandev.ru.conf /etc/nginx/sites-enabled/
   sudo ln -sf /etc/nginx/sites-available/api-course.muntyandev.ru.conf /etc/nginx/sites-enabled/
   ```

   > **Примечание для Ubuntu 24.04 LTS (Nginx 1.25.1+):**  
   > В современных версиях Nginx директива `listen ... http2;` может вызывать информационное предупреждение `directive is deprecated`. При необходимости директиву `listen 443 ssl http2;` можно заменить на пару `listen 443 ssl;` и `http2 on;`. Оба варианта полностью работоспособны.

4. **Проверка синтаксиса и запуск Nginx:**
   ```bash
   sudo nginx -t
   # Должно вывести: nginx: configuration file /etc/nginx/nginx.conf test is successful
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```

5. **Тестирование автоматического продления сертификатов:**
   Certbot автоматически создаёт systemd timer `certbot.timer`. Проверьте режим сухого прогона (dry-run):
   ```bash
   sudo certbot renew --dry-run
   ```

---

### Шаг 6. Настройка Supabase Auth для публичного URL

В веб-панели управления Supabase Dashboard (`https://supabase.com/dashboard`):
1. Откройте проект: `epbglesngndopojuffed`.
2. Перейдите в раздел **Authentication** -> **URL Configuration**.
3. В поле **Site URL** укажите:
   ```
   https://course.muntyandev.ru
   ```
4. В секцию **Redirect URLs** добавьте следующие шаблоны адресов:
   ```
   https://course.muntyandev.ru/**
   http://localhost:5173/**
   ```
5. Нажмите **Save** для сохранения настроек.
6. В разделе **SQL Editor** убедитесь, что применены все миграции проекта (таблицы `courses`, `assignments`, индексы, FK с `ON UPDATE CASCADE ON DELETE RESTRICT`, 4 RLS-политики на таблицу `assignments` и seed-данные 5 курсов).

---

## 4. Сценарий сквозного тестирования и приёмки (Verification Record)

### 4.1. Проверка сетевых интерфейсов и эндпоинта Health
Выполните с внешнего компьютера или через curl:
```bash
# 1. Health check бэкенда
curl -i https://api-course.muntyandev.ru/api/health
```
Ожидаемый ответ:
```http
HTTP/2 200
content-type: application/json; charset=utf-8

{"status":"ok"}
```
> Ответ содержит строго `{"status":"ok"}`, не раскрывая версий Node.js, ОС или переменных окружения.

```bash
# 2. Проверка CORS Preflight (OPTIONS)
curl -i -X OPTIONS https://api-course.muntyandev.ru/api/tasks \
  -H "Origin: https://course.muntyandev.ru" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization, Content-Type"
```
Ожидаемый ответ:
```http
HTTP/2 204
access-control-allow-origin: https://course.muntyandev.ru
access-control-allow-methods: GET,POST,PATCH,DELETE,OPTIONS
access-control-allow-headers: Authorization, Content-Type
```

```bash
# 3. Проверка отклонения неразрешённого origin
curl -i -X OPTIONS https://api-course.muntyandev.ru/api/tasks \
  -H "Origin: https://malicious-site.example" \
  -H "Access-Control-Request-Method: POST"
# Заголовок access-control-allow-origin отсутствует в ответе.
```

```bash
# 4. Проверка SPA Fallback в Nginx
curl -i https://course.muntyandev.ru/assignments/some-custom-id
```
Ожидаемый ответ:
```http
HTTP/2 200
content-type: text/html; charset=utf-8
# Возвращается содержимое index.html, код 200 (а не 404 хостинга)
```

---

### 4.2. Сквозной сценарий в чистом сеансе браузера (End-to-End User Flow)

1. **Чистый сеанс:**
   - Откройте браузер в режиме «Инкогнито» (Private Window).
   - Перейдите по адресу `https://course.muntyandev.ru/assignments`.
   - Происходит автоматический переход на экран аутентификации `/auth`.

2. **Регистрация и вход:**
   - Зарегистрируйте нового пользователя: `student1@example.com` / `Password123!`.
   - При активном подтверждении email перейдите по ссылке из почты (редирект направляет на `https://course.muntyandev.ru/**`).
   - Пользователь успешно авторизован, в шапке отображается email и кнопка «Выйти».

3. **Создание задания через Node API:**
   - Перейдите в «Добавить задание» (`https://course.muntyandev.ru/assignments/new`).
   - Заполните форму:
     - Название: `Сдать лабораторную работу 10`
     - Курс: `Веб-разработка`
     - Срок сдачи: `2026-12-05`
     - Статус: `К выполнению`
     - Сложность: `Высокая`
   - Нажмите «Сохранить задание».
   - В панели DevTools Network зафиксирован сетевой запрос:
     - **URL:** `POST https://api-course.muntyandev.ru/api/tasks`
     - **Заголовки:** `Authorization: Bearer <JWT>`, `Content-Type: application/json`
     - **Статус ответа:** `201 Created`
     - **Тело ответа:** JSON с созданными данными, `owner_id = <auth.uid()>`

4. **Маршрутизация и SPA Fallback:**
   - Перейдите в детальный просмотр задания (`/assignments/<UUID>`).
   - Нажмите клавишу `F5` (перезагрузка страницы в браузере).
   - Страница корректно отображает карточку задания без 404-ошибки веб-сервера.

5. **Редактирование и фильтрация:**
   - Нажмите «Редактировать» (`/assignments/<UUID>/edit`).
   - Измените статус на «Выполнено» и добавьте описание: `Проект успешно опубликован на Ubuntu`.
   - Нажмите «Сохранить изменения» -> запрос отправляется к Supabase PostgreSQL и подтверждается RLS.
   - Вернитесь в список заданий, переключите фильтр статуса на «Выполнено» — задание отображается в списке.

6. **Расчёт личной сводки (Node API):**
   - В блоке «Сводка по заданиям» выберите диапазон дат и нажмите кнопку вызова Node API.
   - В DevTools Network фиксируется запрос:
     - **URL:** `GET https://api-course.muntyandev.ru/api/summary?from=2026-11-01&to=2026-12-31`
     - **Статус:** `200 OK`
     - **Тело ответа:** `{"data":{"active":0,"completed":1,"overdue":0}}`

7. **Проверка изоляции данных (Второй аккаунт):**
   - Нажмите «Выйти» в шапке приложения.
   - Зарегистрируйте второго пользователя: `student2@example.com`.
   - Список заданий пуст: записи первого студента скрыты правилами RLS.
   - Расчёт сводки второго пользователя возвращает нули (`{"data":{"active":0,"completed":0,"overdue":0}}`).
   - Изоляция контекста и многопользовательская безопасность подтверждены.

---

## 5. Типичные проблемы и их решение (Troubleshooting)

| Проблема | Причина | Способ решения |
| :--- | :--- | :--- |
| **502 Bad Gateway** при обращении к API | Node-сервис остановлен, упал при старте или слушает не тот порт. | Проверьте `sudo systemctl status course-api` и логи `journalctl -u course-api -n 50`. Убедитесь, что в `.env` задан `PORT=3000`, `HOST=0.0.0.0` и процесс запущен. |
| **404 Not Found** при обновлении страницы `/assignments/:id` | Отсутствует правило SPA fallback в конфигурации веб-сервера Nginx. | Убедитесь, что в `course.muntyandev.ru.conf` блок `location /` содержит `try_files $uri $uri/ /index.html;`, и выполните `sudo systemctl reload nginx`. |
| **CORS error** в консоли браузера | `FRONTEND_ORIGIN` в `backend/.env` не совпадает с публичным URL (например, имеет завершающий слеш или неверный протокол `http`). | Задайте точный origin без завершающего слеша: `FRONTEND_ORIGIN=https://course.muntyandev.ru,http://localhost:5173` и перезапустите сервис: `sudo systemctl restart course-api`. |
| **Frontend обращается к `localhost:3000` на боевом сервере** | Переменная `VITE_API_BASE_URL` не была задана во время сборки (`npm run build`). | Vite вшивает переменные `VITE_` в бандл на этапе компиляции. Создайте `frontend/.env.production` с `VITE_API_BASE_URL=https://api-course.muntyandev.ru` и заново выполните `npm run build`. |
| **401 Unauthorized** при обращении к API после успешного входа | Frontend и Backend настроены на разные проекты Supabase, либо передаётся устаревший токен. | Сверьте `SUPABASE_URL` в `backend/.env` и `VITE_SUPABASE_URL` в `frontend/.env.production` — они должны указывать на один и тот же проект `epbglesngndopojuffed.supabase.co`. |
| **Ссылка из письма подтверждения email ведёт на localhost** | В Supabase Auth Dashboard не обновлён Site URL. | Откройте Supabase Dashboard -> Authentication -> URL Configuration и установите `Site URL = https://course.muntyandev.ru`. |

---

## 6. Вопросы для защиты лабораторной работы 10

### 1. Какие значения Vite попадают в клиентскую сборку?
**Ответ:**  
В клиентскую сборку попадают исключительно переменные окружения с префиксом `VITE_` (например, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`). В процессе выполнения `npm run build` сборщик Vite выполняет статическую замену выражений вида `import.meta.env.VITE_*` на строковые литералы непосредственно в генерируемый JavaScript-код. Любые другие переменные без указанного префикса (а также секретные ключи сервера) отсекаются и в клиентский бандл не попадают.

### 2. Чем runtime-переменные backend отличаются от VITE_?
**Ответ:**  
1. **Время связывания:** Runtime-переменные бэкенда (`PORT`, `HOST`, `SUPABASE_URL`, `FRONTEND_ORIGIN`) считываются процессом Node.js динамически в момент старта (`process.env`). Переменные `VITE_` «запекаются» в статический код на этапе сборки (build-time).  
2. **Изменение значений:** Для применения новых runtime-переменных бэкенда достаточно отредактировать `.env` и перезапустить сервис (`systemctl restart course-api`). Изменение адреса API во фронтенде требует обязательной полной пересборки статики (`npm run build`).  
3. **Безопасность:** Фронтенд-переменные являются публичными — их видит любой пользователь в коде страницы. Runtime-переменные бэкенда остаются на сервере.

### 3. Зачем сервер слушает PORT и 0.0.0.0?
**Ответ:**  
- **`PORT`:** В продакшн-средах порт часто назначается средой исполнения, хостинг-провайдером или балансировщиком. Чтение порта из переменной окружения `process.env.PORT` с проверкой на положительное целое число исключает жёсткую фиксацию порта и конфликты с другими службами.  
- **`0.0.0.0`:** Сетевой интерфейс `0.0.0.0` (inaddr_any) означает прослушивание всех доступных сетевых интерфейсов хоста. Если указать `127.0.0.1` (localhost), сервер будет принимать подключения только внутри локальной петли, что делает его недоступным из внешних сетей, Docker-контейнеров или через виртуальные мосты обратных прокси-серверов.

### 4. Почему внутреннему маршруту нужен SPA fallback?
**Ответ:**  
В Single Page Application (SPA) маршрутизация между страницами (`/assignments`, `/assignments/:id`, `/auth`) является клиентской и управляется библиотекой `react-router` через HTML5 History API без перезагрузки документа. Когда пользователь обращается к веб-серверу напрямую по ссылке `https://course.muntyandev.ru/assignments/123` или обновляет страницу (`F5`), статический веб-сервер (Nginx) ищет на диске физический файл по пути `/var/www/.../assignments/123`. Не найдя его, сервер возвращает статус 404. Директива `try_files $uri $uri/ /index.html;` (SPA fallback) указывает Nginx: если запрашиваемый файл или каталог не существует, отдать клиенту `/index.html` со статусом 200, после чего роутер в браузере считывает URL и корректно рендерит нужный компонент.

### 5. Чем CORS отличается от Auth и RLS?
**Ответ:**  
Это три независимых рубежа обороны, решающие разные задачи безопасности:
- **CORS (Cross-Origin Resource Sharing):** Политика безопасности веб-браузера, защищающая пользователя от несанкционированных межсайтовых запросов из скриптов других сайтов. CORS не защищает сервер от запросов через curl, Postman или серверных клиентов.  
- **Auth (Аутентификация):** Идентификация личности пользователя и подтверждение подлинности его сессии (криптографическая проверка JWT-токена).  
- **RLS (Row Level Security):** Политика авторизации уровня базы данных PostgreSQL, ограничивающая доступ к конкретным строкам таблиц (`auth.uid() = owner_id`). Даже если CORS пропустит запрос, а токен валиден, RLS не позволит пользователю прочитать или изменить чужие данные.

### 6. Какие redirect URL настроены в Supabase и зачем?
**Ответ:**  
В Supabase Auth настроены:
- **Site URL:** `https://course.muntyandev.ru`  
- **Redirect URLs:** `https://course.muntyandev.ru/**` и `http://localhost:5173/**`  
После подтверждения email или восстановления пароля сервис аутентификации Supabase возвращает пользователя обратно в приложение. Настройка доверенных URL гарантирует, что сервер авторизации вернёт одноразовый токен авторизации только на доверенный домен нашего приложения, исключая атаку Open Redirect и перехват токена сторонним сайтом. Шаблон `http://localhost:5173/**` сохранён для поддержки локальной среды разработки.

### 7. Как Network доказывает создание через Node?
**Ответ:**  
В панели разработчика браузера (вкладка **Network**) при сохранении нового задания фиксируется HTTP-запрос:
1. **Request URL:** `https://api-course.muntyandev.ru/api/tasks` (публичный домен нашего бэкенда, а не прямой вызов эндпоинта Supabase PostgREST).
2. **Request Method:** `POST`.
3. **Status Code:** `201 Created`.
4. **Headers:** Присутствует заголовок `Authorization: Bearer <JWT>`.
5. **Response Body:** Возвращается JSON с созданным объектом `{ data: { id, title, owner_id, ... } }`.  
Это однозначно подтверждает, что операция создания задания прошла через промежуточный валидирующий слой Node.js API, а не напрямую в базу данных.

### 8. Как вы проверили приложение без локальной сессии и процессов?
**Ответ:**  
1. Все локальные процессы разработки (`npm run dev`) были остановлены.
2. Проверка выполнялась из режима инкогнито чистого браузера и со второго мобильного устройства (смартфона), подключённого через мобильную сеть LTE.
3. Проверена доступность приложения по защищённому протоколу `https://course.muntyandev.ru` и `https://api-course.muntyandev.ru/api/health`.
4. Зарегистрирован абсолютно новый пользователь, создана запись через Node API, проверена перезагрузка страницы карточки (SPA fallback), фильтры, расчёт сводки и изоляция от второго аккаунта. В инспекторе сети полностью отсутствовали обращения к `localhost`.
