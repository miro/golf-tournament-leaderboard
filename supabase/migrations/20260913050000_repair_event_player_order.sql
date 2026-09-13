-- Older test databases may already have league_event_players without the
-- display_order column. CREATE TABLE IF NOT EXISTS does not alter that table.
alter table public.league_event_players
  add column if not exists display_order integer;

with ranked as (
  select event_id, player_id,
         row_number() over (partition by event_id order by player_id) as position
  from public.league_event_players
)
update public.league_event_players players
set display_order = ranked.position
from ranked
where players.event_id = ranked.event_id
  and players.player_id = ranked.player_id;

alter table public.league_event_players
  alter column display_order set default 1,
  alter column display_order set not null;

create index if not exists league_event_players_event_idx
  on public.league_event_players (event_id, display_order);

notify pgrst, 'reload schema';
