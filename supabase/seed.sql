-- 2026 season
insert into seasons (year, name, type, status, deadline)
values (2026, 'Liekkipoika Kesäkisa 2026', 'kesäkisa', 'active', '2026-08-31');

-- 4 courses
insert into courses (name, slug, location_city, par_total, color_hex) values
  ('Kajaani', 'kajaani', 'Kajaani', 72, '#2D6A4F'),
  ('Paltamo', 'paltamo', 'Paltamo', 72, '#1B4FC4'),
  ('Nuas',    'nuas',    'Nuas',    72, '#C4791B'),
  ('Tenetti', 'tenetti', 'Tenetti', 72, '#8B1BC4');

-- Link courses to season (run after both inserts above)
insert into season_courses (season_id, course_id, display_order)
select
  (select id from seasons where year = 2026),
  id,
  case name
    when 'Kajaani' then 1
    when 'Paltamo' then 2
    when 'Nuas'    then 3
    when 'Tenetti' then 4
  end
from courses;
