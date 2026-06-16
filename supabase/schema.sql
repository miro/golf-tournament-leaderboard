-- Players
create table players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  slug text not null unique,
  personal_link_token uuid not null default gen_random_uuid(),
  hcp_current numeric(4,1),
  hcp_history jsonb not null default '[]',
  titles jsonb not null default '[]',
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seasons
create table seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  name text not null,
  type text not null check (type in ('kesäkisa', 'tahko_major')),
  status text not null default 'active' check (status in ('upcoming', 'active', 'completed')),
  deadline date not null,
  winner_player_id uuid references players(id),
  announced_at timestamptz,
  created_at timestamptz not null default now()
);

-- Courses
create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  location_city text not null,
  par_total int not null default 72,
  cover_photo_url text,
  color_hex text,
  website_url text,
  latitude numeric(9,6),
  longitude numeric(9,6)
);

-- Season <> Course join
create table season_courses (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  display_order int not null default 1,
  unique(season_id, course_id)
);

-- Admins
create table admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Rounds
create table rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  course_id uuid not null references courses(id),
  player_id uuid not null references players(id),
  submitted_by uuid references admins(id),
  played_date date not null,
  submitted_at timestamptz not null default now(),
  hcp_at_time numeric(4,1),
  total_strokes int,
  total_points int not null,
  to_par int,
  screenshot_url text,
  summary_text text,
  status text not null default 'published' check (status in ('draft', 'published', 'corrected')),
  correction_note text,
  is_backfill boolean not null default false,
  unique(season_id, course_id, player_id)
);

-- Hole results
create table hole_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  par int not null,
  stroke_index int not null,
  strokes_played int,
  handicap_strokes int,
  points int not null,
  unique(round_id, hole_number)
);

-- Round cards
create table round_cards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  card_type text not null check (card_type in ('round', 'standings', 'course_leader', 'deadline', 'final')),
  share_text text,
  generated_at timestamptz not null default now()
);

-- Indexes for common queries
create index on rounds(season_id, player_id);
create index on rounds(season_id, course_id);
create index on rounds(played_date desc);
create index on hole_results(round_id);
