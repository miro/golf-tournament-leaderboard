-- Existing test databases may have an older betting_questions table. Add the
-- columns required by the event editor and public betting flow.
alter table public.betting_questions
  add column if not exists question_type_id uuid,
  add column if not exists display_order integer,
  add column if not exists parameters jsonb,
  add column if not exists correct_answer jsonb,
  add column if not exists question_text text;

with ranked as (
  select id,
         row_number() over (partition by event_id order by id) as position
  from public.betting_questions
)
update public.betting_questions questions
set display_order = ranked.position
from ranked
where questions.id = ranked.id
  and questions.display_order is null;

update public.betting_questions
set parameters = '{}'::jsonb
where parameters is null;

alter table public.betting_questions
  alter column display_order set default 1,
  alter column display_order set not null,
  alter column parameters set default '{}'::jsonb,
  alter column parameters set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.betting_questions'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%(question_type_id)%'
  ) then
    alter table public.betting_questions
      add constraint betting_questions_question_type_id_fkey
      foreign key (question_type_id)
      references public.betting_question_types(id);
  end if;
end
$$;

create index if not exists betting_questions_event_idx
  on public.betting_questions (event_id, display_order);

grant select on public.betting_questions to anon, authenticated;
grant insert, update, delete on public.betting_questions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'betting_questions'
      and policyname = 'public read questions'
  ) then
    create policy "public read questions"
      on public.betting_questions for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'betting_questions'
      and policyname = 'league admins write questions'
  ) then
    create policy "league admins write questions"
      on public.betting_questions for all
      to authenticated
      using (
        exists (
          select 1
          from public.league_events event
          where event.id = event_id
            and public.is_league_admin(event.league_id)
        )
      )
      with check (
        exists (
          select 1
          from public.league_events event
          where event.id = event_id
            and public.is_league_admin(event.league_id)
        )
      );
  end if;
end
$$;

notify pgrst, 'reload schema';
