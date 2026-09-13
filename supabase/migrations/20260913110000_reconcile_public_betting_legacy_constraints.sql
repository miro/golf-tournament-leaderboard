-- Reconcile the public betting participant table with the current identity flow.
-- Older databases made the retired emoji_pin field required, which blocks the
-- public participant function because the current flow does not collect it.
alter table public.betting_participants
  alter column emoji_pin drop not null;

-- These fields are optional for legacy rows and are supplied by the current
-- public flow when available.
alter table public.betting_participants
  alter column pin drop not null,
  alter column identity_token drop not null,
  alter column bettor_account_id drop not null;

notify pgrst, 'reload schema';
