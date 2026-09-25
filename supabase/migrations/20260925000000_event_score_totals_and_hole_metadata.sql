-- Event score totals are persisted on event_scores. Hole metadata lives on
-- event_hole_results, while strokes_played intentionally remains nullable.

-- The original event table called this column hole_number. Rename it so the
-- event schema matches the scorecard payload used by the application.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_hole_results'
      and column_name = 'hole_number'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_hole_results'
      and column_name = 'hole'
  ) then
    alter table public.event_hole_results rename column hole_number to hole;
  end if;
end $$;

alter table public.event_hole_results
  add column if not exists hole integer,
  add column if not exists par integer,
  add column if not exists stroke_index integer,
  add column if not exists strokes_played integer,
  add column if not exists hcp_strokes integer,
  add column if not exists points integer;

-- Raw strokes may be missing even when points are complete.
alter table public.event_hole_results
  alter column strokes_played drop not null;

-- Preserve the existing 1–18 invariant after the legacy column rename.
alter table public.event_hole_results
  drop constraint if exists event_hole_results_event_score_id_hole_number_key,
  drop constraint if exists event_hole_results_hole_number_check,
  drop constraint if exists event_hole_results_event_score_id_hole_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.event_hole_results'::regclass
      and conname = 'event_hole_results_hole_check'
  ) then
    alter table public.event_hole_results
      add constraint event_hole_results_hole_check
      check (hole between 1 and 18);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.event_hole_results'::regclass
      and conname = 'event_hole_results_event_score_id_hole_key'
  ) then
    alter table public.event_hole_results
      add constraint event_hole_results_event_score_id_hole_key
      unique (event_score_id, hole);
  end if;
end $$;

-- These are persisted values. Existing installations already have these
-- columns; add them for older event schemas without replacing their values.
alter table public.event_scores
  add column if not exists total_points integer,
  add column if not exists total_strokes integer,
  add column if not exists has_complete_strokes boolean not null default false,
  add column if not exists hcp numeric;

-- Backfill totals only where the legacy row does not already have a value.
-- total_strokes stays NULL if any hole is missing raw strokes.
update public.event_scores score
set total_points = totals.total_points
from (
  select event_score_id, sum(points)::integer as total_points
  from public.event_hole_results
  group by event_score_id
) totals
where score.id = totals.event_score_id
  and score.total_points is null;

update public.event_scores score
set total_strokes = totals.total_strokes
from (
  select event_score_id, sum(strokes_played)::integer as total_strokes
  from public.event_hole_results
  group by event_score_id
  having count(*) = 18
     and count(strokes_played) = 18
) totals
where score.id = totals.event_score_id
  and score.total_strokes is null;

-- Existing rows get the same derived flag as future writes.
update public.event_scores score
set has_complete_strokes = exists (
  select 1
  from public.event_hole_results hole
  where hole.event_score_id = score.id
  group by hole.event_score_id
  having count(*) = 18
     and count(hole.strokes_played) = 18
);

-- Keep total_points required if the live schema was missing that constraint,
-- but fail clearly rather than inventing values for legacy rows with no holes.
do $$
begin
  if exists (
    select 1 from public.event_scores where total_points is null
  ) then
    raise exception 'event_scores.total_points contains NULL values; backfill them before enforcing NOT NULL';
  end if;

  alter table public.event_scores
    alter column total_points set not null;
end $$;

create or replace function public.recompute_event_score_stroke_completeness(
  p_event_score_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.event_scores score
  set has_complete_strokes = (
    select count(*) = 18 and count(hole.strokes_played) = 18
    from public.event_hole_results hole
    where hole.event_score_id = p_event_score_id
  )
  where score.id = p_event_score_id;
$$;

create or replace function public.set_event_score_stroke_completeness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.has_complete_strokes := (
    select count(*) = 18 and count(hole.strokes_played) = 18
    from public.event_hole_results hole
    where hole.event_score_id = new.id
  );
  return new;
end;
$$;

create or replace function public.sync_event_score_stroke_completeness_from_hole()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and old.event_score_id is distinct from new.event_score_id) then
    perform public.recompute_event_score_stroke_completeness(old.event_score_id);
  end if;

  if tg_op <> 'DELETE' then
    perform public.recompute_event_score_stroke_completeness(new.event_score_id);
  end if;

  return null;
end;
$$;

-- These functions are trigger internals, not public RPC endpoints.
revoke all on function public.recompute_event_score_stroke_completeness(uuid) from public;
revoke all on function public.set_event_score_stroke_completeness() from public;
revoke all on function public.sync_event_score_stroke_completeness_from_hole() from public;

drop trigger if exists event_scores_stroke_completeness on public.event_scores;
create trigger event_scores_stroke_completeness
before insert or update on public.event_scores
for each row execute function public.set_event_score_stroke_completeness();

drop trigger if exists event_hole_results_stroke_completeness on public.event_hole_results;
create trigger event_hole_results_stroke_completeness
after insert or update or delete on public.event_hole_results
for each row execute function public.sync_event_score_stroke_completeness_from_hole();

comment on column public.event_scores.has_complete_strokes is
  'True only when all 18 event_hole_results rows have non-null strokes_played.';
comment on column public.event_scores.total_points is
  'Persisted total points for the event score; not derived at read time.';
comment on column public.event_scores.total_strokes is
  'Persisted total raw strokes for the event score; nullable when unavailable.';
