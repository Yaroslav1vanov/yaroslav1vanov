-- ============================================================
-- EasyLife AI CRM — Supabase Schema
-- Запустить: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1. Профили пользователей
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  name        text not null default '',
  role        text not null default 'viewer'
                check (role in ('admin','teamlead','editor','scriptwriter','viewer')),
  perms       jsonb not null default '[]'::jsonb,
  staff_name  text default '',
  created_at  timestamptz default now()
);

-- 2. Клиенты (данные хранятся как JSONB — не меняем структуру существующего UI)
create table if not exists public.clients (
  id          bigint primary key,
  data        jsonb not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 3. Команда
create table if not exists public.staff (
  id    bigint generated always as identity primary key,
  type  text not null check (type in ('editor','teamlead','scriptwriter')),
  name  text not null,
  created_at timestamptz default now(),
  unique(type, name)
);

-- 4. Настройки (счётчик id и прочее)
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

-- Начальные данные
insert into public.settings(key, value) values ('nid', '{"val": 1}')
  on conflict(key) do nothing;

insert into public.staff(type, name) values
  ('editor','Аня'), ('editor','Алиса'), ('editor','Катя'),
  ('teamlead','Лена'), ('teamlead','Кристина')
  on conflict do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.clients  enable row level security;
alter table public.staff    enable row level security;
alter table public.settings enable row level security;

-- Profiles: свой профиль всегда доступен; admin видит всех
create policy "profiles_self" on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_admin_select" on public.profiles for select
  using (exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "profiles_insert" on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_admin_update" on public.profiles for update
  using (exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "profiles_admin_delete" on public.profiles for delete
  using (exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Clients: авторизованные читают, пишут по ролям
create policy "clients_select" on public.clients for select
  using (auth.role() = 'authenticated');

create policy "clients_insert" on public.clients for insert
  with check (
    exists(
      select 1 from public.profiles p where p.id = auth.uid()
      and (p.role = 'admin' or 'create_client' = any(
        array(select jsonb_array_elements_text(p.perms))
      ))
    )
  );

create policy "clients_update" on public.clients for update
  using (
    exists(
      select 1 from public.profiles p where p.id = auth.uid()
      and (p.role = 'admin' or p.perms ?| array['edit_client','update_videos','update_scripts','update_checklist','add_notes'])
    )
  );

create policy "clients_delete" on public.clients for delete
  using (
    exists(
      select 1 from public.profiles p where p.id = auth.uid()
      and (p.role = 'admin' or 'delete_client' = any(
        array(select jsonb_array_elements_text(p.perms))
      ))
    )
  );

-- Staff: все читают, admin/teamlead пишут
create policy "staff_select" on public.staff for select
  using (auth.role() = 'authenticated');

create policy "staff_write" on public.staff for all
  using (exists(
    select 1 from public.profiles p where p.id = auth.uid()
    and p.role in ('admin','teamlead')
  ));

-- Settings: все авторизованные
create policy "settings_all" on public.settings for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- Realtime (включить в Dashboard → Database → Replication)
-- Таблицы: clients, staff, settings
-- ============================================================

-- ============================================================
-- Trigger: updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger clients_updated_at before update on public.clients
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Trigger: создать профиль при регистрации
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id, name, role, perms)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    'viewer',
    '[]'
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();
