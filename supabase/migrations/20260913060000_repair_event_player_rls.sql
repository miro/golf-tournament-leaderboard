-- Some existing databases have league_event_players from an older schema
-- without the current tenant policy. Restore the admin-only write policy.
grant select, insert, update, delete on public.league_event_players to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'league_event_players'
      and policyname = 'league admins write event players'
  ) then
    create policy "league admins write event players"
      on public.league_event_players for all
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
