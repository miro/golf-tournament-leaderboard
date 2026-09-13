-- Legacy databases may require a question_text for every betting question.
alter table public.betting_questions
  add column if not exists question_text text;

update public.betting_questions questions
set question_text = question_types.display_name
from public.betting_question_types question_types
where questions.question_type_id = question_types.id
  and questions.question_text is null;

notify pgrst, 'reload schema';
