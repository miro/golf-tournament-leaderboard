-- Multi-tenant policy layer. Existing rows and Auth users are retained for GC.
create table if not exists public.league_admins (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

alter table public.league_admins enable row level security;
grant select on public.league_admins to authenticated;

-- Older GC rows in the two optional-tenant tables are assigned to GC before
-- membership policies become active.
update public.invitational_results ir
set league_id = l.id
from public.leagues l
where ir.league_id is null and l.slug = 'gc';
update public.invitational_schedule isch
set league_id = l.id
from public.leagues l
where isch.league_id is null and l.slug = 'gc';

insert into public.league_admins (league_id, user_id)
select l.id, u.id
from public.leagues l
cross join auth.users u
where l.slug = 'gc'
on conflict do nothing;

create or replace function public.is_league_admin(target_league uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.league_admins
    where league_id = target_league and user_id = auth.uid()
  );
$$;

grant execute on function public.is_league_admin(uuid) to authenticated;

drop policy if exists "public read leagues" on public.leagues;
create policy "public read leagues" on public.leagues for select to anon, authenticated using (active);

drop policy if exists "admins read own memberships" on public.league_admins;
create policy "admins read own memberships" on public.league_admins
  for select to authenticated using (user_id = auth.uid());

-- Public result reads stay available; all writes require membership in the row's league.
do $$ declare t text; begin
  foreach t in array array['players','seasons','courses','rounds','admins','invitational_results','invitational_schedule'] loop
    execute format('drop policy if exists %I on public.%I', 'admin write ' || replace(t, '_', ' '), t);
  end loop;
end $$;

drop policy if exists "admin write players" on public.players;
create policy "league admins write players" on public.players for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));
drop policy if exists "admin write rounds" on public.rounds;
create policy "league admins write rounds" on public.rounds for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));
drop policy if exists "admin only" on public.admins;
create policy "league admins read admins" on public.admins for select to authenticated
  using (public.is_league_admin(league_id));
create policy "league admins write admins" on public.admins for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));
drop policy if exists "admin write invitational results" on public.invitational_results;
create policy "league admins write invitational results" on public.invitational_results for all to authenticated
  using (league_id is not null and public.is_league_admin(league_id))
  with check (league_id is not null and public.is_league_admin(league_id));
drop policy if exists "admin write schedule" on public.invitational_schedule;
create policy "league admins write schedule" on public.invitational_schedule for all to authenticated
  using (league_id is not null and public.is_league_admin(league_id))
  with check (league_id is not null and public.is_league_admin(league_id));

drop policy if exists "admin write hole_results" on public.hole_results;
create policy "league admins write hole_results" on public.hole_results for all to authenticated
  using (exists (select 1 from public.rounds r where r.id = round_id and public.is_league_admin(r.league_id)))
  with check (exists (select 1 from public.rounds r where r.id = round_id and public.is_league_admin(r.league_id)));
drop policy if exists "admin write round_cards" on public.round_cards;
create policy "league admins write round_cards" on public.round_cards for all to authenticated
  using (round_id is not null and exists (select 1 from public.rounds r where r.id = round_id and public.is_league_admin(r.league_id)))
  with check (round_id is not null and exists (select 1 from public.rounds r where r.id = round_id and public.is_league_admin(r.league_id)));

drop policy if exists "public write season_courses" on public.season_courses;
create policy "league admins write season_courses" on public.season_courses for all to authenticated
  using (exists (select 1 from public.seasons s where s.id = season_id and public.is_league_admin(s.league_id)))
  with check (exists (select 1 from public.seasons s where s.id = season_id and public.is_league_admin(s.league_id)));

-- Slugs and invitational years are tenant-local identifiers.
alter table public.players drop constraint if exists players_slug_key;
alter table public.courses drop constraint if exists courses_slug_key;
alter table public.invitational_results drop constraint if exists invitational_results_year_key;
create unique index if not exists players_league_slug_key on public.players (league_id, slug);
create unique index if not exists courses_league_slug_key on public.courses (league_id, slug);
create unique index if not exists invitational_results_league_year_key on public.invitational_results (league_id, year);
