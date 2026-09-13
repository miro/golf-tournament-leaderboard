-- The legacy question type table does not consistently use the same key
-- column, and older event creation did not persist all target selections.
do $$
declare
  key_column text;
begin
  select columns.column_name
    into key_column
  from information_schema.columns columns
  where columns.table_schema = 'public'
    and columns.table_name = 'betting_question_types'
    and columns.column_name in ('key', 'type_key')
  order by case columns.column_name when 'key' then 1 else 2 end
  limit 1;

  if key_column is not null then
    execute format(
      'update public.betting_question_types
       set requires_target_player = true
       where %I = ''beat_the_leader''',
      key_column
    );
  end if;
end
$$;

with player_pairs as (
  select
    event_id,
    (array_agg(player_id order by display_order))[1] as first_player_id,
    (array_agg(player_id order by display_order))[2] as second_player_id
  from public.league_event_players
  group by event_id
)
update public.betting_questions questions
set parameters = case questions.question_type_key
  when 'slider_player_points' then coalesce(questions.parameters, '{}'::jsonb)
    || jsonb_build_object('player_id', player_pairs.first_player_id)
  when 'beat_the_leader' then coalesce(questions.parameters, '{}'::jsonb)
    || jsonb_build_object('target_player_id', player_pairs.first_player_id)
  when 'yes_no_head_to_head' then coalesce(questions.parameters, '{}'::jsonb)
    || jsonb_build_object('player_a_id', player_pairs.first_player_id, 'player_b_id', player_pairs.second_player_id)
  else questions.parameters
end
from player_pairs
where questions.event_id = player_pairs.event_id
  and questions.question_type_key in ('slider_player_points', 'beat_the_leader', 'yes_no_head_to_head')
  and (
    questions.parameters is null
    or (questions.question_type_key = 'slider_player_points' and not (questions.parameters ? 'player_id'))
    or (questions.question_type_key = 'beat_the_leader' and not (questions.parameters ? 'target_player_id'))
    or (questions.question_type_key = 'yes_no_head_to_head' and (not (questions.parameters ? 'player_a_id') or not (questions.parameters ? 'player_b_id')))
  );

notify pgrst, 'reload schema';
