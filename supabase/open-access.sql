-- Открытый доступ без входа: выполните в SQL Editor, если schema.sql уже был запущен ранее
drop policy if exists "auth read settings"   on public.settings;
drop policy if exists "auth update settings" on public.settings;
create policy "auth read settings"   on public.settings for select to anon, authenticated using (true);
create policy "auth update settings" on public.settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "auth all processes" on public.processes;
create policy "auth all processes" on public.processes for all to anon, authenticated using (true) with check (true);
