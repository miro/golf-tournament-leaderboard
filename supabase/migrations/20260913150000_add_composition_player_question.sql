-- Add the prototype line-drawing scorecard as its own question type.
-- Existing installations use type_key, while fresh installations use key.
do $$
declare
  key_column text;
  has_scoring_method boolean;
begin
  select columns.column_name
    into key_column
  from information_schema.columns columns
  where columns.table_schema = 'public'
    and columns.table_name = 'betting_question_types'
    and columns.column_name in ('key', 'type_key')
  order by case columns.column_name when 'key' then 1 else 2 end
  limit 1;

  select exists (
    select 1
    from information_schema.columns columns
    where columns.table_schema = 'public'
      and columns.table_name = 'betting_question_types'
      and columns.column_name = 'scoring_method'
  ) into has_scoring_method;

  if key_column is null then
    raise exception 'betting_question_types has no key column';
  end if;

  if has_scoring_method then
    execute format(
      'insert into public.betting_question_types (%I, display_name, description, max_points, requires_target_player, scoring_method, active)
       select $1, $2, $3, $4, true, $5, true
       where not exists (select 1 from public.betting_question_types where %I = $1)',
      key_column, key_column
    ) using 'composition_player_line', 'Yksittäisen pelaajan tuloskortti', 'Arvioi yhden pelaajan tulos väylä kerrallaan.', 8, 'partial_credit';
  else
    execute format(
      'insert into public.betting_question_types (%I, display_name, description, max_points, requires_target_player, active)
       select $1, $2, $3, $4, true, true
       where not exists (select 1 from public.betting_question_types where %I = $1)',
      key_column, key_column
    ) using 'composition_player_line', 'Yksittäisen pelaajan tuloskortti', 'Arvioi yhden pelaajan tulos väylä kerrallaan.', 8;
  end if;
end
$$;

-- Give legacy composition questions a target player when their old creator did
-- not persist one. New questions receive this in the admin form.
with first_players as (
  select
    event_id,
    (array_agg(player_id order by display_order))[1] as player_id
  from public.league_event_players
  group by event_id
)
update public.betting_questions questions
set parameters = coalesce(questions.parameters, '{}'::jsonb)
  || jsonb_build_object('player_id', first_players.player_id)
from first_players
where questions.event_id = first_players.event_id
  and questions.question_type_key = 'composition_player_line'
  and (questions.parameters is null or not (questions.parameters ? 'player_id'));

notify pgrst, 'reload schema';
