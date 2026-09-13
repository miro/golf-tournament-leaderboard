-- Courses are shared catalog data. Tenant ownership remains on seasons,
-- rounds, and events that reference a course.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'league_id'
  ) then
    alter table public.courses drop constraint if exists courses_league_id_fkey;
    drop index if exists public.courses_league_slug_key;
    alter table public.courses drop column league_id;
  end if;
end $$;

alter table public.courses drop constraint if exists courses_slug_key;
create unique index if not exists courses_slug_global_key on public.courses (slug);
