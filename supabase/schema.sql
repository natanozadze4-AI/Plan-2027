-- План внутреннего аудита: схема базы данных
-- Выполните в Supabase → SQL Editor → New query → Run

-- 1. Параметры модели (одна строка)
create table if not exists public.settings (
  id          smallint primary key default 1 check (id = 1),
  params      jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) default auth.uid()
);

insert into public.settings (id, params) values (1, '{
  "year": 2027,
  "weights": [0.25, 0.20, 0.15, 0.10, 0.20, 0.10],
  "high": 3.6,
  "med": 2.6,
  "freq": {"hi": 1, "mid": 2, "lo": 3},
  "fte": 6,
  "daysPerFte": 210,
  "productive": 0.75,
  "reserveAdhoc": 0.15,
  "reserveFollow": 0.10
}'::jsonb)
on conflict (id) do nothing;

-- 2. Аудиторский универсум: бизнес-процессы и их оценка
create table if not exists public.processes (
  id          bigint generated always as identity primary key,
  name        text not null,
  category    text not null default 'Прочее',
  last_audit  smallint check (last_audit between 1990 and 2100),
  f1          smallint not null default 3 check (f1 between 1 and 5),  -- финансовое влияние
  f2          smallint not null default 3 check (f2 between 1 and 5),  -- регуляторный риск
  f3          smallint not null default 3 check (f3 between 1 and 5),  -- сложность и изменения
  f4          smallint not null default 3 check (f4 between 1 and 5),  -- риск мошенничества
  f5          smallint not null default 3 check (f5 between 1 and 5),  -- контрольная среда
  mandatory   boolean  not null default false,
  days        smallint not null default 15 check (days between 0 and 999),
  quarter     text check (quarter in ('Q1','Q2','Q3','Q4')),          -- null = авто
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) default auth.uid()
);

-- 3. Автоматическое обновление updated_at / updated_by
create or replace function public.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_processes_touch on public.processes;
create trigger trg_processes_touch before update on public.processes
  for each row execute function public.touch_row();

drop trigger if exists trg_settings_touch on public.settings;
create trigger trg_settings_touch before update on public.settings
  for each row execute function public.touch_row();

-- 4. Row Level Security: открытый доступ без входа (anon + authenticated)
alter table public.settings  enable row level security;
alter table public.processes enable row level security;

drop policy if exists "auth read settings"   on public.settings;
drop policy if exists "auth update settings" on public.settings;
create policy "auth read settings"   on public.settings for select to anon, authenticated using (true);
create policy "auth update settings" on public.settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "auth all processes" on public.processes;
create policy "auth all processes" on public.processes for all to anon, authenticated using (true) with check (true);
