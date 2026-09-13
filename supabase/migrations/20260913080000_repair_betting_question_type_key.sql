-- Older databases also require the legacy question_type_key field. Keep it in
-- sync with the newer question_type_id used by the current application.
alter table public.betting_questions
  add column if not exists question_type_key text;

update public.betting_questions questions
set question_type_key = question_types.key
from public.betting_question_types question_types
where questions.question_type_id = question_types.id
  and questions.question_type_key is null;

notify pgrst, 'reload schema';
