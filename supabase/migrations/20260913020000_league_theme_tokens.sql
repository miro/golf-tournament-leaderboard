alter table public.leagues
  add column if not exists bg_dark text default '#17130F',
  add column if not exists bg_card text default '#221D17',
  add column if not exists bg_card_hover text default '#271F18',
  add column if not exists text_muted text default '#9A8870',
  add column if not exists border_muted text default 'rgba(255,255,255,0.08)',
  add column if not exists border_accent text default 'rgba(255,255,255,0.15)';

update public.leagues
set bg_dark = '#17130F',
    bg_card = '#221D17',
    bg_card_hover = '#271F18',
    text_muted = '#9A8870',
    border_muted = 'rgba(255,255,255,0.08)',
    border_accent = 'rgba(255,255,255,0.15)'
where slug = 'gc';

update public.leagues
set bg_dark = '#0A1015',
    bg_card = '#111820',
    bg_card_hover = '#162030',
    text_muted = '#6B8A8A',
    border_muted = 'rgba(255,255,255,0.08)',
    border_accent = 'rgba(13,148,136,0.30)'
where slug = 'testcompany';
