-- Ludus: History sets.
-- Run once in the Supabase SQL editor. Lets a set be tagged History (the app works it out from the questions either way).
alter table public.sets drop constraint if exists sets_subject_check;
alter table public.sets add constraint sets_subject_check check (subject in ('latin', 'french', 'geography', 'history', 'none'));
