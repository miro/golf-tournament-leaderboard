-- Event betting administration tables.
create table if not exists public.league_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  event_date date not null,
  course_id uuid references public.courses(id),
  status text not null default 'draft' check (status in ('draft','betting_open','betting_closed','scoring','results_ready','presented')),
  betting_url_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.league_event_players (
  event_id uuid not null references public.league_events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  display_order integer not null default 1,
  primary key (event_id, player_id)
);

create table if not exists public.betting_question_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null default '',
  max_points integer not null default 0,
  requires_target_player boolean not null default false,
  active boolean not null default true
);

create table if not exists public.betting_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.league_events(id) on delete cascade,
  question_type_id uuid not null references public.betting_question_types(id),
  display_order integer not null default 1,
  parameters jsonb not null default '{}'::jsonb,
  correct_answer jsonb,
  unique (event_id, display_order)
);

create table if not exists public.betting_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.league_events(id) on delete cascade,
  display_name text not null,
  emoji_pin text,
  submitted_at timestamptz not null default now(),
  total_points_awarded integer not null default 0
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.betting_participants(id) on delete cascade,
  question_id uuid not null references public.betting_questions(id) on delete cascade,
  answer jsonb not null default '{}'::jsonb,
  points_awarded integer not null default 0,
  points_breakdown jsonb not null default '{}'::jsonb,
  unique (participant_id, question_id)
);

create table if not exists public.event_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.league_events(id) on delete cascade,
  player_id uuid not null references public.players(id),
  played_date date not null,
  total_points integer not null,
  total_strokes integer,
  submitted_at timestamptz not null default now(),
  is_corrected boolean not null default false,
  unique (event_id, player_id)
);

create table if not exists public.event_hole_results (
  id uuid primary key default gen_random_uuid(),
  event_score_id uuid not null references public.event_scores(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  points integer not null,
  unique (event_score_id, hole_number)
);

create index if not exists league_events_league_date_idx on public.league_events (league_id, event_date desc);
create index if not exists league_event_players_event_idx on public.league_event_players (event_id, display_order);
create index if not exists betting_questions_event_idx on public.betting_questions (event_id, display_order);
create index if not exists betting_participants_event_idx on public.betting_participants (event_id, submitted_at);
create index if not exists event_scores_event_idx on public.event_scores (event_id);

insert into public.betting_question_types (key, display_name, description, max_points, requires_target_player)
values
  ('slider_player_points', 'Pisteet: kohdepelaaja', 'Arvaa kohdepelaajan pistebogey-tulos.', 5, true),
  ('composition_player_line', 'Yksittäisen pelaajan tuloskortti', 'Arvioi yhden pelaajan tulos väylä kerrallaan.', 8, true),
  ('player_pick_best_total', 'Kuka tekee parhaan tuloksen?', 'Valitse pelaaja, jolla on eniten pisteitä.', 3, false),
  ('player_pick_best_front', 'Paras etuysi', 'Valitse etuysin paras pelaaja.', 3, false),
  ('player_pick_best_back', 'Paras takaysi', 'Valitse takaysin paras pelaaja.', 3, false),
  ('player_pick_best_scratch', 'Paras scratch-tulos', 'Valitse pienimmän lyöntimäärän pelaaja.', 3, false),
  ('yes_no_birdie', 'Tuleeko kierroksella birdie?', 'Onko vähintään yksi vähintään kolmen pisteen reikä?', 2, false),
  ('yes_no_zero', 'Tuleeko nollapisteen reikä?', 'Onko jollain pelaajalla nollapisteen reikä?', 2, false),
  ('yes_no_four_birdies', 'Tuleeko neljä birdie-reikää?', 'Saako joku pelaaja vähintään neljä birdie-reikää?', 2, false),
  ('yes_no_head_to_head', 'Kumpi voittaa kaksintaistelun?', 'Valitse kahdesta pelaajasta enemmän pisteitä tekevä.', 2, false),
  ('podium_top3', 'Podium: top 3', 'Järjestä kolme parasta pelaajaa.', 8, false),
  ('beat_the_leader', 'Voittaako joku kohdepelaajan?', 'Valitse pelaaja, joka ohittaa kohdepelaajan.', 3, true)
on conflict (key) do update set display_name = excluded.display_name, description = excluded.description,
  max_points = excluded.max_points, requires_target_player = excluded.requires_target_player;

alter table public.league_events enable row level security;
alter table public.league_event_players enable row level security;
alter table public.betting_question_types enable row level security;
alter table public.betting_questions enable row level security;
alter table public.betting_participants enable row level security;
alter table public.bets enable row level security;
alter table public.event_scores enable row level security;
alter table public.event_hole_results enable row level security;

grant select on public.league_events, public.league_event_players, public.betting_question_types, public.betting_questions, public.betting_participants, public.bets, public.event_scores, public.event_hole_results to anon, authenticated;
grant insert, update, delete on public.league_events, public.league_event_players, public.betting_questions, public.betting_participants, public.bets, public.event_scores, public.event_hole_results to authenticated;

create policy "public read event data" on public.league_events for select to anon, authenticated using (true);
create policy "public read event players" on public.league_event_players for select to anon, authenticated using (true);
create policy "public read question types" on public.betting_question_types for select to anon, authenticated using (active);
create policy "public read questions" on public.betting_questions for select to anon, authenticated using (true);
create policy "public read participants" on public.betting_participants for select to anon, authenticated using (true);
create policy "public read bets" on public.bets for select to anon, authenticated using (true);
create policy "public read scores" on public.event_scores for select to anon, authenticated using (true);
create policy "public read holes" on public.event_hole_results for select to anon, authenticated using (true);

create policy "league admins write events" on public.league_events for all to authenticated
  using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));
create policy "league admins write event players" on public.league_event_players for all to authenticated
  using (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)))
  with check (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)));
create policy "league admins write questions" on public.betting_questions for all to authenticated
  using (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)))
  with check (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)));
create policy "league admins write participants" on public.betting_participants for all to authenticated
  using (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)))
  with check (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)));
create policy "league admins write bets" on public.bets for all to authenticated
  using (exists (select 1 from public.betting_participants p join public.league_events e on e.id = p.event_id where p.id = participant_id and public.is_league_admin(e.league_id)))
  with check (exists (select 1 from public.betting_participants p join public.league_events e on e.id = p.event_id where p.id = participant_id and public.is_league_admin(e.league_id)));
create policy "league admins write scores" on public.event_scores for all to authenticated
  using (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)))
  with check (exists (select 1 from public.league_events e where e.id = event_id and public.is_league_admin(e.league_id)));
create policy "league admins write holes" on public.event_hole_results for all to authenticated
  using (exists (select 1 from public.event_scores s join public.league_events e on e.id = s.event_id where s.id = event_score_id and public.is_league_admin(e.league_id)))
  with check (exists (select 1 from public.event_scores s join public.league_events e on e.id = s.event_id where s.id = event_score_id and public.is_league_admin(e.league_id)));
