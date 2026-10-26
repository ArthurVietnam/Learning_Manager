insert into public.courses (id, name)
values
  ('c1', 'Веб-разработка'),
  ('c2', 'Базы данных'),
  ('c3', 'Операционные системы'),
  ('c4', 'Алгоритмы и структуры данных'),
  ('c5', 'Компьютерные сети')
on conflict (id) do update
set name = excluded.name;
