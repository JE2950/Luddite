-- Database setup (setup guide, step 4)
-- 1. Create your own teacher account first (Authentication → Users → Add user).
-- 2. Put that account's email on the line marked <<< near the bottom.
-- 3. Paste this whole file into Supabase → SQL Editor → New query, then click Run.
--    Supabase may warn about "destructive operations": that's expected (the drop lines only replace
--    earlier copies of these rules), so click Run anyway.
-- Stores teachers' folders and question sets only. No pupil data is ever stored.

-- Folders: private to the teacher who made them
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now()
);

-- Sets: every teacher can see and play every set; only the owner can change or delete it
create table if not exists public.sets (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_email  text not null default (auth.jwt() ->> 'email'),
  folder_id    uuid references public.folders (id) on delete set null,
  title        text not null default '',
  questions    jsonb not null default '[]'::jsonb,
  tags         text[] not null default '{}',
  subject      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Subject: 'latin', 'french', 'none' (chosen as none), or empty (worked out from the questions)
alter table public.sets add column if not exists subject text;
alter table public.sets drop constraint if exists sets_subject_check;
alter table public.sets add constraint sets_subject_check check (subject in ('latin', 'french', 'geography', 'none'));

create index if not exists sets_owner_idx  on public.sets (owner);
create index if not exists sets_folder_idx on public.sets (folder_id);
create index if not exists sets_tags_idx on public.sets using gin (tags);

-- Keep updated_at current
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sets_touch on public.sets;
create trigger sets_touch before update on public.sets
  for each row execute function public.touch_updated_at();

-- Row Level Security: signed-in teachers only, nothing for anonymous visitors
alter table public.folders enable row level security;
alter table public.sets    enable row level security;

drop policy if exists "own folders" on public.folders;
create policy "own folders" on public.folders
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "teachers read all sets" on public.sets;
create policy "teachers read all sets" on public.sets
  for select to authenticated
  using (true);

drop policy if exists "teachers add own sets" on public.sets;
create policy "teachers add own sets" on public.sets
  for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "teachers change own sets" on public.sets;
create policy "teachers change own sets" on public.sets
  for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "teachers delete own sets" on public.sets;
create policy "teachers delete own sets" on public.sets
  for delete to authenticated
  using (owner = auth.uid());

-- Table access (new tables are not exposed automatically in this project)
revoke all on public.folders, public.sets from anon;
grant select, insert, update, delete on public.folders, public.sets to authenticated;

-- Admins: who can add teachers and set passwords from inside the site (the Teachers page)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins for select to authenticated using (user_id = auth.uid());
revoke all on public.admins from anon;
grant select on public.admins to authenticated;

insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('YOUR-EMAIL-HERE')   -- <<< your email
on conflict do nothing;
