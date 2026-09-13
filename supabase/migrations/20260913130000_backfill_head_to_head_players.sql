-- Older event creation did not store the two players for head-to-head
-- questions. Use the first two players in event order for those legacy rows.
with player_pairs as (
  select
    event_id,
    (array_agg(player_id order by display_order))[1] as player_a_id,
    (array_agg(player_id order by display_order))[2] as player_b_id
  from public.league_event_players
  group by event_id
)
update public.betting_questions questions
set parameters = coalesce(questions.parameters, '{}'::jsonb) || jsonb_build_object(
  'player_a_id', player_pairs.player_a_id,
  'player_b_id', player_pairs.player_b_id
)
from player_pairs
where questions.event_id = player_pairs.event_id
  and questions.question_type_key = 'yes_no_head_to_head'
  and (questions.parameters is null
    or not (questions.parameters ? 'player_a_id')
    or not (questions.parameters ? 'player_b_id'));

notify pgrst, 'reload schema';
