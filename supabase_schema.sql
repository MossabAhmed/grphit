-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- لا يحتوي على أي بيانات تجريبية.
create table if not exists public.factory_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.factory_state enable row level security;

drop policy if exists "public can read factory state" on public.factory_state;
drop policy if exists "public can insert factory state" on public.factory_state;
drop policy if exists "public can update factory state" on public.factory_state;

create policy "public can read factory state"
  on public.factory_state for select using (true);
create policy "public can insert factory state"
  on public.factory_state for insert with check (true);
create policy "public can update factory state"
  on public.factory_state for update using (true) with check (true);

grant select, insert, update on public.factory_state to anon, authenticated;
