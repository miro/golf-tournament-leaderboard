-- Keep public participant creation compatible while older databases still
-- have the retired emoji_pin column marked NOT NULL.
create or replace function public.create_public_betting_participant(
  p_event_id uuid,
  p_display_name text,
  p_pin text,
  p_identity_token uuid,
  p_bettor_account_id uuid,
  p_is_event_player boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_id uuid;
begin
  if not exists (
    select 1 from public.league_events
    where id = p_event_id and status = 'betting_open'
  ) then
    raise exception 'Veikkaukset eivät ole auki';
  end if;

  insert into public.betting_participants (
    event_id, display_name, emoji_pin, pin, identity_token,
    bettor_account_id, is_event_player
  )
  values (
    p_event_id, p_display_name, '', p_pin, p_identity_token,
    p_bettor_account_id, p_is_event_player
  )
  returning id into participant_id;
  return participant_id;
end;
$$;

grant execute on function public.create_public_betting_participant(uuid, text, text, uuid, uuid, boolean) to anon, authenticated;
