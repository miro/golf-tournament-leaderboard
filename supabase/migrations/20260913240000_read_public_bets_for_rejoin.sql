-- The submit function is security definer. Use the same controlled boundary
-- when a bettor rejoins so RLS/read-cache differences cannot hide submitted bets.
create or replace function public.get_public_betting_bets(
  p_event_id uuid,
  p_participant_id uuid,
  p_identity_token uuid
)
returns setof public.bets
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.betting_participants participant
    where participant.id = p_participant_id
      and participant.event_id = p_event_id
      and participant.identity_token = p_identity_token
  ) then
    raise exception 'Osallistujaa ei löytynyt';
  end if;

  return query
  select bet.*
  from public.bets bet
  where bet.participant_id = p_participant_id;
end;
$$;

grant execute on function public.get_public_betting_bets(uuid, uuid, uuid) to anon, authenticated;
