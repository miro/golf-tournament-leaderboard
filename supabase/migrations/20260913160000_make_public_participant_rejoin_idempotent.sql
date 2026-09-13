-- The public flow now identifies bettors with bettor_accounts and identity_token.
-- emoji_pin is a retired legacy field; its old per-event uniqueness constraint
-- prevents more than one public bettor from joining an event.
alter table public.betting_participants
  drop constraint if exists betting_participants_event_id_emoji_pin_key;

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

  -- Rejoining the same event must return the existing participant instead of
  -- creating a second row. The name + PIN fallback also repairs participants
  -- created before bettor_account_id and identity_token were added.
  select participant.id
  into participant_id
  from public.betting_participants participant
  where participant.event_id = p_event_id
    and (
      (p_identity_token is not null and participant.identity_token = p_identity_token)
      or (p_bettor_account_id is not null and participant.bettor_account_id = p_bettor_account_id)
      or (participant.pin = p_pin and lower(trim(participant.display_name)) = lower(trim(p_display_name)))
    )
  order by participant.submitted_at asc
  limit 1;

  if participant_id is not null then
    update public.betting_participants as existing
    set display_name = p_display_name,
        pin = p_pin,
        identity_token = p_identity_token,
        bettor_account_id = p_bettor_account_id,
        is_event_player = existing.is_event_player or p_is_event_player
    where id = participant_id;
    return participant_id;
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
