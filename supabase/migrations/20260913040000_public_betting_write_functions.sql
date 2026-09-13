-- Keep existing participant/bet RLS policies unchanged for normal table access.
-- The public page writes through narrowly scoped functions instead.
drop policy if exists "public insert betting participants" on public.betting_participants;
drop policy if exists "public update betting participants" on public.betting_participants;
drop policy if exists "public insert bets" on public.bets;
revoke insert on public.betting_participants, public.bets from anon;

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
    event_id, display_name, pin, identity_token, bettor_account_id, is_event_player
  )
  values (
    p_event_id, p_display_name, p_pin, p_identity_token, p_bettor_account_id, p_is_event_player
  )
  returning id into participant_id;
  return participant_id;
end;
$$;

create or replace function public.update_public_betting_participant(
  p_participant_id uuid,
  p_pin text,
  p_identity_token uuid,
  p_bettor_account_id uuid,
  p_is_event_player boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.betting_participants participant
    join public.league_events event on event.id = participant.event_id
    where participant.id = p_participant_id
      and event.status = 'betting_open'
  ) then
    raise exception 'Veikkaukset eivät ole auki';
  end if;

  update public.betting_participants
  set pin = p_pin,
      identity_token = p_identity_token,
      bettor_account_id = p_bettor_account_id,
      is_event_player = p_is_event_player
  where id = p_participant_id
    and pin = p_pin
    and identity_token = p_identity_token
    and bettor_account_id = p_bettor_account_id;

  if not found then
    raise exception 'Osallistujaa ei löytynyt';
  end if;
end;
$$;

create or replace function public.submit_public_bets(
  p_event_id uuid,
  p_participant_id uuid,
  p_identity_token uuid,
  p_bets jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.league_events
    where id = p_event_id and status = 'betting_open'
  ) then
    raise exception 'Veikkaukset sulkeutuivat ennen lähetystä. Ota yhteyttä adminiin.';
  end if;

  if not exists (
    select 1 from public.betting_participants
    where id = p_participant_id and event_id = p_event_id and identity_token = p_identity_token
  ) then
    raise exception 'Osallistujaa ei löytynyt';
  end if;

  if exists (select 1 from public.bets where participant_id = p_participant_id) then
    raise exception 'Veikkaukset on jo lähetetty';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_bets) as submitted(question_id uuid, answer jsonb)
    where not exists (
      select 1 from public.betting_questions question
      where question.id = submitted.question_id and question.event_id = p_event_id
    )
  ) then
    raise exception 'Veikkauspaketti ei vastaa tapahtumaa';
  end if;

  update public.betting_participants
  set submitted_at = now()
  where id = p_participant_id;

  insert into public.bets (participant_id, question_id, answer, points_awarded)
  select p_participant_id, submitted.question_id, submitted.answer, null
  from jsonb_to_recordset(p_bets) as submitted(question_id uuid, answer jsonb);
end;
$$;

grant execute on function public.create_public_betting_participant(uuid, text, text, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.update_public_betting_participant(uuid, text, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.submit_public_bets(uuid, uuid, uuid, jsonb) to anon, authenticated;
