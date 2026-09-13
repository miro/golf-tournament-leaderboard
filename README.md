# Golf Championship Leaderboard

## Local development with multiple leagues

Add the league hosts to `/etc/hosts`:

```text
127.0.0.1   gc.localhost
127.0.0.1   [other-league-slug].localhost
```

Then open `http://gc.localhost:5173` or `http://[other-league-slug].localhost:5173` in a browser. Plain `http://localhost:5173` uses the GC league fallback.

Apply the SQL migration in `supabase/migrations/20260912000000_league_tenant_policies.sql` before testing against the hosted database. It creates league admin memberships, exposes active league metadata, and scopes authenticated writes.
