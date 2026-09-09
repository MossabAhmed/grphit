-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- لا يحتوي على أي بيانات تجريبية.
-- فعّل Email provider وEmail confirmation من Authentication > Providers قبل الاستخدام.
-- إذا كنت قد شغّلت المخطط القديم، يحذف هذا الجدول القديم الفارغ ويعيد إنشاءه بصلاحيات المستخدمين.
drop table if exists public.factory_state;

create table if not exists public.factory_state (
  id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.factory_state enable row level security;

drop policy if exists "public can read factory state" on public.factory_state;
drop policy if exists "public can insert factory state" on public.factory_state;
drop policy if exists "public can update factory state" on public.factory_state;
drop policy if exists "users can read own factory state" on public.factory_state;
drop policy if exists "users can insert own factory state" on public.factory_state;
drop policy if exists "users can update own factory state" on public.factory_state;

create policy "users can read own factory state"
  on public.factory_state for select to authenticated using (auth.uid() = id);
create policy "users can insert own factory state"
  on public.factory_state for insert to authenticated with check (auth.uid() = id);
create policy "users can update own factory state"
  on public.factory_state for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on public.factory_state to authenticated;
