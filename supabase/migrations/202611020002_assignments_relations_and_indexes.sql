-- Migration: 202611020002_assignments_relations_and_indexes.sql
-- Description: Explicit foreign key with cascade update and restrict delete, plus query indexes (Lab 7)

-- 1. Foreign key constraint: assignments.course_id -> courses(id) with ON UPDATE CASCADE ON DELETE RESTRICT
alter table public.assignments
  drop constraint if exists assignments_course_id_fkey;

alter table public.assignments
  add constraint assignments_course_id_fkey
  foreign key (course_id) references public.courses(id)
  on update cascade on delete restrict;

-- 2. Performance indexes supporting frequent filtering by owner + status and course lookups
create index if not exists assignments_owner_status_idx
  on public.assignments(owner_id, status);

create index if not exists assignments_course_id_idx
  on public.assignments(course_id);
