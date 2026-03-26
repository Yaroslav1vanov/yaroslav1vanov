# EasyLife AI CRM — Next.js + Supabase

Полноценное веб-приложение с авторизацией, ролями, realtime синхронизацией.

## Структура проекта

```
easylife-crm/
├── app/
│   ├── layout.jsx              ← Root layout
│   ├── globals.css             ← Базовые стили
│   ├── page.jsx                ← Redirect (/ → /dashboard или /login)
│   ├── login/
│   │   └── page.jsx            ← Страница входа
│   ├── dashboard/
│   │   └── page.jsx            ← Главная CRM (Server Component)
│   └── api/
│       ├── clients/
│       │   ├── route.js        ← GET (список), POST (создать)
│       │   └── [id]/route.js   ← PATCH (обновить), DELETE (удалить)
│       ├── staff/route.js      ← Управление командой
│       └── users/route.js      ← Управление пользователями (admin)
├── components/
│   ├── LoginForm.jsx           ← Форма входа (Client Component)
│   └── CRMApp.jsx              ← Весь CRM UI (Client Component)
├── lib/
│   ├── supabase/
│   │   ├── client.js           ← Browser Supabase client
│   │   └── server.js           ← Server Supabase client + service role
│   ├── permissions.js          ← Роли, права, фильтрация клиентов
│   └── constants.js            ← Чеклист, makeClient(), helpers
├── supabase/
│   └── schema.sql              ← SQL схема (запустить один раз)
├── middleware.js               ← Auth guard для всех роутов
├── .env.example                ← Пример переменных окружения
├── next.config.mjs
└── package.json
```

---

## Шаг 1 — Supabase проект

1. Зайди на **supabase.com** → Sign up / Login
2. **New project** → название `easylife-crm` → любой пароль → ближайший регион → **Create project**
3. Подожди ~2 минуты пока проект создаётся

---

## Шаг 2 — Создать схему БД

1. Левое меню → **SQL Editor** → **New query**
2. Скопируй содержимое файла `supabase/schema.sql` и вставь целиком
3. Нажми **Run** (или Ctrl+Enter)
4. Должно появиться "Success. No rows returned"

---

## Шаг 3 — Включить Realtime

1. Левое меню → **Database** → **Replication**
2. Включи переключатели для таблиц: **clients**, **staff**, **settings**
3. Сохрани

---

## Шаг 4 — Получить API ключи

1. Левое меню → **Settings** → **API**
2. Скопируй:
   - **Project URL** → `https://xxxxxxxx.supabase.co`
   - **anon public** key → длинная строка `eyJ...`
   - **service_role** key → другая длинная строка `eyJ...` (⚠️ держи в секрете)

---

## Шаг 5 — Настроить .env

Создай файл `.env.local` в корне проекта:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```

---

## Шаг 6 — Создать первого администратора

1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**
2. Введи email и пароль (это будут твои данные для входа)
3. Нажми **Create user**
4. Скопируй **UUID** из колонки `id` созданного пользователя
5. Левое меню → **SQL Editor** → New query → вставь и запусти:

```sql
UPDATE public.profiles
SET
  name = 'Администратор',
  role = 'admin',
  perms = '["create_client","edit_client","delete_client","update_videos","update_scripts","update_checklist","add_notes","manage_staff","manage_users"]'::jsonb
WHERE id = 'СЮДА-ВСТАВЬ-UUID';
```

---

## Шаг 7 — Запустить локально

```bash
npm install
npm run dev
```

Открой http://localhost:3000 — войди своим email и паролем.

---

## Шаг 8 — Деплой на Vercel (5 минут)

1. Зайди на **vercel.com** → Sign up через GitHub
2. **Add New Project** → **Import Git Repository**
   - Если проекта нет на GitHub: нажми **"Deploy without Git"** или сначала залей на GitHub
3. Выбери папку `easylife-crm`
4. В разделе **Environment Variables** добавь все три переменные из `.env.local`
5. Нажми **Deploy**
6. Через ~1 минуту получишь ссылку `https://easylife-crm.vercel.app`

### Альтернатива — деплой через Vercel CLI:
```bash
npm install -g vercel
vercel --prod
# Vercel спросит про env vars — введи их при первом деплое
```

---

## Как добавлять сотрудников

После входа как администратор:
1. Нажми кнопку **🔐** в шапке
2. Заполни форму: имя, email, пароль, роль
3. Нажми **Сохранить**
4. Сотрудник заходит на сайт со своим email/паролем

---

## Роли и права

| Роль | Что может |
|------|-----------|
| **admin** | Всё, включая управление пользователями |
| **teamlead** | Создавать/редактировать клиентов, управлять командой |
| **editor** | Обновлять ролики, чеклист, заметки |
| **scriptwriter** | Обновлять сценарии, чеклист, заметки |
| **viewer** | Только смотреть |

Права настраиваются гибко через чекбоксы в панели пользователей.

**Фильтрация по роли:**
- admin и teamlead видят **всех** клиентов
- editor и scriptwriter видят **только своих** клиентов (где их имя в поле "Монтажёр" или "Team Lead")

---

## Как обновить приложение не потеряв данные

Данные хранятся в **Supabase** (облако) — они никак не связаны с кодом.

1. Пишешь мне что нужно изменить → получаешь обновлённый файл
2. Заменяешь файл в папке
3. Если деплой через Vercel + GitHub: `git push` → автообновление
4. Если деплой через Vercel CLI: `vercel --prod`
5. **Данные остаются нетронутыми**

---

## Troubleshooting

**"Invalid login credentials"** — проверь email/пароль. Убедись что шаг 6 выполнен.

**Белый экран после входа** — открой DevTools (F12) → Console. Скорее всего неверные env vars.

**Realtime не работает** — убедись что включен Replication для таблиц `clients` и `staff`.

**"permission denied"** — убедись что RLS политики созданы (шаг 2, schema.sql).
