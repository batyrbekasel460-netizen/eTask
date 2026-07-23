# eTask

Корпоративная клиент‑серверная система управления задачами ДРГУиЦ, рассчитанная на одновременную работу сотрудников в закрытой локальной сети.

## Архитектура

- React 19 + TypeScript, Material UI, React DnD и Recharts на клиенте.
- Node.js 22 + Express 5 и REST API на сервере.
- PostgreSQL 16: транзакции, индексы и оптимистическая блокировка задач по `version`.
- Файлы до 50 МБ хранятся в серверном томе; в PostgreSQL находятся только метаданные.
- JWT передаётся только в `HttpOnly`, `SameSite=Strict` cookie, связан с серверной сессией и не доступен JavaScript-коду.
- Nginx публикует frontend и `/api` на одном адресе, поэтому рабочим станциям не нужен отдельный адрес API.

```text
Браузеры сотрудников ──HTTP/HTTPS──> Nginx :80
                                      ├── /     → React :3000
                                      └── /api → Express :4000
                                                     ├── PostgreSQL
                                                     └── storage/uploads
```

## Запуск на одном сервере

Требуются Docker Engine и Docker Compose. Доступ в Интернет нужен только один раз для загрузки образов и пакетов; после сборки eTask работает автономно.

1. Скопируйте `.env.example` в `.env`.
2. Установите уникальные `POSTGRES_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD` (не менее 12 символов) и `JWT_SECRET` (не менее 32 символов).
3. Добавьте адрес сервера в `FRONTEND_ORIGIN`, если frontend и API будут публиковаться на разных источниках. При стандартном запуске через Nginx используется один источник.
4. Запустите `docker compose up -d --build`.
5. Откройте `http://<IP-СЕРВЕРА>/` и войдите как `admin` с паролем `BOOTSTRAP_ADMIN_PASSWORD`.

Начальный пользователь создаётся только при первой инициализации пустого тома PostgreSQL. Пароль не хранится в репозитории. Для внутреннего HTTPS установите `COOKIE_SECURE=true` и завершайте TLS на Nginx либо корпоративном reverse proxy.

## Обновление существующей базы

Перед обновлением сделайте резервную копию. Миграции выполняются последовательно:

```bash
psql "$DATABASE_URL" -f database/migrations/001_notifications_and_subtasks.sql
psql "$DATABASE_URL" -f database/migrations/002_server_sessions.sql
psql "$DATABASE_URL" -f database/migrations/003_system_administrator.sql
```

## Локальная разработка

Нужны Node.js не ниже 22.13 и PostgreSQL 16.

```bash
npm ci
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql
BOOTSTRAP_ADMIN_PASSWORD='уникальный-пароль' POSTGRES_USER=etask POSTGRES_DB=etask database/03-bootstrap.sh
npm run dev:server
# В отдельном терминале:
npm run dev:frontend
```

Для разработки задайте `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

## Проверка качества

- `npm run lint` — ESLint для клиентского и серверного кода.
- `npm run build:server` — строгая проверка TypeScript и сборка API.
- `npm run verify` — lint, строгая типизация API и production-сборка frontend.
- `npm audit --omit=dev` — аудит production-зависимостей.

## Эксплуатация

Подробная инструкция администратора находится в `docs/PRODUCTION.md`, а проверенная матрица полномочий — в `docs/ACCESS_MATRIX.md`.
