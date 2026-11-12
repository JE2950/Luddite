-- Ludus: Geography sets and pictures in questions.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to run again.

-- 1. Sets can be tagged Geography
alter table public.sets drop constraint if exists sets_subject_check;
alter table public.sets add constraint sets_subject_check check (subject in ('latin', 'french', 'geography', 'none'));

-- 2. A public bucket for question and answer pictures (pictures are shrunk to 640px before upload; 2 MB cap)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('set-images', 'set-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 3. Signed-in teachers add pictures to their own folder, and can remove their own. Anyone can view (public bucket).
drop policy if exists "Teachers add set pictures" on storage.objects;
create policy "Teachers add set pictures" on storage.objects for insert to authenticated
  with check (bucket_id = 'set-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Teachers remove own set pictures" on storage.objects;
create policy "Teachers remove own set pictures" on storage.objects for delete to authenticated
  using (bucket_id = 'set-images' and owner = auth.uid());
