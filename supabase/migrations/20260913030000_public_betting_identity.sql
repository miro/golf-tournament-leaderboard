-- Public betting identity and event-player support.
create table if not exists public.bettor_accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  pin text not null,
  identity_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique(pin, display_name)
);

alter table public.league_events
  add column if not exists participant_code text
  check (
    participant_code is null or
    (length(trim(participant_code)) >= 2 and length(trim(participant_code)) <= 20)
  );

-- These identity fields are needed by the public flow. The older event migration
-- only had emoji_pin on this table, so keep the additions idempotent for existing DBs.
alter table public.betting_participants
  add column if not exists pin text,
  add column if not exists identity_token uuid default gen_random_uuid(),
  add column if not exists bettor_account_id uuid references public.bettor_accounts(id),
  add column if not exists is_event_player boolean not null default false;

alter table public.betting_questions
  add column if not exists question_text text;

alter table public.bets
  alter column points_awarded drop not null;

alter table public.bettor_accounts enable row level security;

grant select, insert on public.bettor_accounts to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bettor_accounts' and policyname = 'public insert bettor accounts') then
    create policy "public insert bettor accounts"
      on public.bettor_accounts for insert
      to anon, authenticated
      with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bettor_accounts' and policyname = 'public read bettor accounts') then
    create policy "public read bettor accounts"
      on public.bettor_accounts for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

-- The existing participant policies remain in place. These two insert policies
-- give the public betting page the minimum write access it needs.
grant insert on public.betting_participants, public.bets to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'betting_participants' and policyname = 'public insert betting participants') then
    create policy "public insert betting participants"
      on public.betting_participants for insert
      to anon, authenticated
      with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bets' and policyname = 'public insert bets') then
    create policy "public insert bets"
      on public.bets for insert
      to anon, authenticated
      with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'betting_participants' and policyname = 'public update betting participants') then
    create policy "public update betting participants"
      on public.betting_participants for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;
