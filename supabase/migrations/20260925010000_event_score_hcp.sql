-- HCP is needed for deterministic event-question tiebreaks.
alter table public.event_scores
  add column if not exists hcp numeric;

comment on column public.event_scores.hcp is
  'Player HCP recorded with the event score; used as a resolver tiebreaker.';
