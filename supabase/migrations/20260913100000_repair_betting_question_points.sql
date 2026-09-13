-- Legacy databases require points_possible on every betting question.
alter table public.betting_questions
  add column if not exists points_possible integer;

update public.betting_questions questions
set points_possible = question_types.max_points
from public.betting_question_types question_types
where questions.question_type_id = question_types.id
  and questions.points_possible is null;

notify pgrst, 'reload schema';
