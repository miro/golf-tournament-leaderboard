-- Older databases also require the legacy question_type_key field. Keep it in
-- sync with the newer question_type_id used by the current application.
alter table public.betting_questions
  add column if not exists question_type_key text;

do $$
declare
  source_column text;
begin
  select columns.column_name
  into source_column
  from information_schema.columns columns
  where columns.table_schema = 'public'
    and columns.table_name = 'betting_question_types'
    and columns.column_name in ('key', 'question_type_key', 'type_key', 'slug')
  order by case columns.column_name
    when 'key' then 1
    when 'question_type_key' then 2
    when 'type_key' then 3
    when 'slug' then 4
  end
  limit 1;

  if source_column is not null then
    execute format(
      'update public.betting_questions questions
       set question_type_key = question_types.%I
       from public.betting_question_types question_types
       where questions.question_type_id = question_types.id
         and questions.question_type_key is null',
      source_column
    );
  end if;
end
$$;

notify pgrst, 'reload schema';
