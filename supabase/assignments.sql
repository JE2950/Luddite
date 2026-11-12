-- Assignment mode (setup guide: run after setup.sql)
-- Teachers share a set (an assignment) or a folder (a revision folder) with a short code.
-- Pupils play on their own with no account: they type the code, their first name and surname initial.
-- Stored for each play: that name, the score and each answer. Nothing else about pupils is stored.

create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  title       text not null default '' check (char_length(title) <= 80),
  set_id      uuid references public.sets (id) on delete cascade,
  folder_id   uuid references public.folders (id) on delete cascade,
  mode        text not null default 'classic' check (mode in ('classic', 'fishing')),
  minutes     int not null default 5 check (minutes between 0 and 60),
  due_at      timestamptz,
  open        boolean not null default true,
  created_at  timestamptz not null default now(),
  check ((set_id is null) <> (folder_id is null))
);
create index if not exists assignments_owner_idx on public.assignments (owner);

create table if not exists public.attempts (
  id             uuid primary key,
  token          text not null,
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  set_id         uuid not null references public.sets (id) on delete cascade,
  pupil          text not null check (char_length(pupil) between 2 and 24),
  score          numeric not null default 0,
  answered       int not null default 0,
  correct        int not null default 0,
  best_streak    int not null default 0,
  log            jsonb not null default '[]'::jsonb,
  finished       boolean not null default false,
  started_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists attempts_assignment_idx on public.attempts (assignment_id, pupil);

alter table public.assignments enable row level security;
alter table public.attempts    enable row level security;

-- Teachers manage their own assignments and read the attempts on them. Pupils never touch the tables directly.
drop policy if exists "own assignments" on public.assignments;
create policy "own assignments" on public.assignments for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "read attempts on own assignments" on public.attempts;
create policy "read attempts on own assignments" on public.attempts for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and a.owner = auth.uid()));
drop policy if exists "delete attempts on own assignments" on public.attempts;
create policy "delete attempts on own assignments" on public.attempts for delete to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and a.owner = auth.uid()));
revoke all on public.assignments, public.attempts from anon;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, delete on public.attempts to authenticated;

-- ---------- Pupil functions (the only way in for pupils) ----------

-- The sets behind an open code
create or replace function public.pupil_open(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.assignments; result jsonb;
begin
  select * into a from public.assignments where code = upper(trim(p_code)) and open;
  if not found then return null; end if;
  select jsonb_build_object(
    'title', a.title, 'mode', a.mode, 'minutes', a.minutes, 'due_at', a.due_at, 'kind', case when a.set_id is null then 'folder' else 'set' end,
    'sets', coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'subject', s.subject, 'tags', s.tags, 'questions', s.questions) order by s.title), '[]'::jsonb))
  into result
  from public.sets s
  where (a.set_id is not null and s.id = a.set_id) or (a.folder_id is not null and s.folder_id = a.folder_id and s.owner = a.owner);
  return result;
end $$;

-- Save (or update) one play. The token stops anyone else overwriting it.
create or replace function public.pupil_save(p_code text, p_attempt jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare a public.assignments; v_pupil text; v_set uuid; v_id uuid; v_token text; v_log jsonb;
begin
  select * into a from public.assignments where code = upper(trim(p_code)) and open;
  if not found then return false; end if;
  v_pupil := trim(p_attempt->>'pupil');
  if v_pupil is null or v_pupil !~ '^[[:alpha:]][[:alpha:]''\- ]{0,19} [A-Z]$' then return false; end if;
  v_set := (p_attempt->>'set_id')::uuid;
  if not exists (select 1 from public.sets s where s.id = v_set
      and ((a.set_id is not null and s.id = a.set_id) or (a.folder_id is not null and s.folder_id = a.folder_id and s.owner = a.owner))) then
    return false;
  end if;
  v_id := (p_attempt->>'id')::uuid;
  v_token := p_attempt->>'token';
  if v_token is null or char_length(v_token) < 16 then return false; end if;
  v_log := coalesce(p_attempt->'log', '[]'::jsonb);
  if jsonb_typeof(v_log) <> 'array' or jsonb_array_length(v_log) > 2000 then return false; end if;
  -- A light brake on floods: at most 300 new plays per assignment per hour
  if not exists (select 1 from public.attempts where id = v_id)
     and (select count(*) from public.attempts where assignment_id = a.id and started_at > now() - interval '1 hour') >= 300 then
    return false;
  end if;
  insert into public.attempts as t (id, token, assignment_id, set_id, pupil, score, answered, correct, best_streak, log, finished)
  values (v_id, v_token, a.id, v_set, v_pupil, coalesce((p_attempt->>'score')::numeric, 0), coalesce((p_attempt->>'answered')::int, 0),
          coalesce((p_attempt->>'correct')::int, 0), coalesce((p_attempt->>'best_streak')::int, 0), v_log, coalesce((p_attempt->>'finished')::boolean, false))
  on conflict (id) do update set score = excluded.score, answered = excluded.answered, correct = excluded.correct,
      best_streak = excluded.best_streak, log = excluded.log, finished = excluded.finished, updated_at = now()
    where t.token = excluded.token and t.assignment_id = excluded.assignment_id;
  return true;
end $$;

-- A pupil's own past plays on this code, for the "your best" and "questions to practise" panels
create or replace function public.pupil_history(p_code text, p_pupil text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.assignments;
begin
  select * into a from public.assignments where code = upper(trim(p_code)) and open;
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('set_id', t.set_id, 'score', t.score, 'answered', t.answered, 'correct', t.correct,
      'best_streak', t.best_streak, 'log', t.log, 'started_at', t.started_at) order by t.started_at)
    from public.attempts t where t.assignment_id = a.id and lower(t.pupil) = lower(trim(p_pupil))), '[]'::jsonb);
end $$;

revoke all on function public.pupil_open(text), public.pupil_save(text, jsonb), public.pupil_history(text, text) from public;
grant execute on function public.pupil_open(text), public.pupil_save(text, jsonb), public.pupil_history(text, text) to anon, authenticated;
