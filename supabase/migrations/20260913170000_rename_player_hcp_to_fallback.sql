-- A player-level handicap is only a fallback value. Seasonal scoring uses the
-- handicap snapshot stored on each round (rounds.hcp_at_time).
do $$
declare
  has_current boolean;
  has_fallback boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'hcp_current'
  ) into has_current;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'hcp_fallback'
  ) into has_fallback;

  if has_current and not has_fallback then
    alter table public.players rename column hcp_current to hcp_fallback;
  elsif not has_current and not has_fallback then
    alter table public.players add column hcp_fallback numeric(4,1);
  elsif has_current and has_fallback then
    update public.players
    set hcp_fallback = coalesce(hcp_fallback, hcp_current);
    alter table public.players drop column hcp_current;
  end if;
end
$$;
