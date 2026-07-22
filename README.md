# eTask

Корпоративная клиент-серверная система управления задачами ДРГУиЦ.

## Архитектура

- Frontend: React 19 + TypeScript, Material UI, React DnD, Recharts.
- Backend: Node.js + Express, REST API, JWT.
- Database: PostgreSQL 16 с транзакциями, индексами и контролем версий задач.
- Files: локальное серверное хранилище `storage/uploads`; метаданные хранятся в PostgreSQL.
- Deployment: один сервер в локальной сети, без обязательного доступа к Интернету.

```text
Браузеры сотрудников ──HTTP──> React :3000
                              │ REST + JWT
                              ▼
                         Express :4000
                          │          │
                          ▼          ▼
                    PostgreSQL   storage/uploads
```

## Быстрый запуск через Docker

1. Скопируйте `.env.example` в `.env` и обязательно замените `JWT_SECRET` и пароль PostgreSQL.
2. В `FRONTEND_ORIGIN` укажите IP сервера, например `http://192.168.1.10:3000`.
3. В `NEXT_PUBLIC_API_URL` укажите `http://192.168.1.10:4000/api`.
4. Запустите:

```bash
docker compose up -d --build
```

Сотрудники открывают `http://<IP-СЕРВЕРА>:3000`. Демонстрационная учетная запись после первого запуска: `k.zhumabayev` / `password`. Пароль необходимо сменить перед эксплуатацией.

## Локальная разработка

Требуется Node.js 22+ и PostgreSQL 16+.

```bash
npm install
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql
npm run dev
```

`npm run dev` одновременно запускает frontend и API. Сервер слушает `0.0.0.0`, поэтому доступен другим компьютерам локальной сети при разрешенных портах 3000 и 4000.

## Команды

- `npm run dev` — frontend и backend в режиме разработки.
- `npm run build` — сборка frontend.
- `npm run build:server` — проверка типов и сборка Express API.
- `npm run start` — запуск собранного frontend.
- `npm run start:server` — запуск собранного API.

## Безопасность

Авторизация и ролевые ограничения проверяются на сервере. Эксперт получает только свои задачи, руководитель — данные своего управления, заместитель и директор — весь департамент. JWT имеет ограниченный срок жизни. Загружаемые файлы получают безопасные серверные имена и ограничены размером 50 МБ.

Для промышленной эксплуатации разместите eTask за локальным reverse proxy (Nginx/Caddy), включите внутренний TLS, настройте резервное копирование PostgreSQL и каталога `storage/uploads`, а также смените все начальные секреты.
