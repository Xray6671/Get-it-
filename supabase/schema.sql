-- Nevada Business Watch: Compliance Hub schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it drops and recreates only the hub's policies and functions,
-- never the tables or their data.
--
-- Model: one business per owner login. Owners add employees, record knowledge
-- checks (graded on the server) and store training files. Records can't be
-- edited or deleted from the browser, only added, so the history stays intact.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.businesses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  created_at  timestamptz not null default now()
);

create table if not exists public.employees (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  full_name    text not null check (char_length(btrim(full_name)) between 1 and 80),
  job_title    text check (job_title is null or char_length(job_title) <= 80),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists employees_business_idx on public.employees (business_id);

create table if not exists public.courses (
  id             text primary key,
  title          text not null,
  required_for   text not null,
  source_label   text not null,
  source_url     text not null check (source_url like 'https://%'),
  renew_months   int  not null check (renew_months between 1 and 60),
  jha_note       text,
  sort           int  not null default 0
);

create table if not exists public.course_questions (
  course_id  text not null references public.courses (id) on delete cascade,
  position   int  not null,
  prompt     text not null,
  options    jsonb not null check (jsonb_typeof(options) = 'array'),
  primary key (course_id, position)
);

-- Answer key lives outside the API-exposed schema, so browsers can't read it.
create schema if not exists private;
create table if not exists private.course_answers (
  course_id  text not null,
  position   int  not null,
  answer     int  not null,
  primary key (course_id, position),
  foreign key (course_id, position) references public.course_questions (course_id, position) on delete cascade
);

create table if not exists public.attestations (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees (id) on delete cascade,
  course_id     text not null references public.courses (id),
  completed_on  date not null,
  recorded_by   uuid not null references auth.users (id),
  created_at    timestamptz not null default now()
);
create index if not exists attestations_employee_idx on public.attestations (employee_id);

create table if not exists public.training_files (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  employee_id   uuid references public.employees (id) on delete cascade,  -- null = whole crew / roster
  course_id     text not null references public.courses (id),
  storage_path  text not null unique,
  file_name     text not null check (char_length(file_name) between 1 and 200),
  size_bytes    bigint not null check (size_bytes > 0),
  uploaded_by   uuid not null default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now()
);
create index if not exists training_files_business_idx on public.training_files (business_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The signed-in owner's business, or null. Security definer so policies can
-- call it without recursing through the businesses policy.
create or replace function public.my_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.businesses where owner_id = auth.uid()
$$;

-- Nevada's calendar date, so a check taken at 9pm in Las Vegas isn't dated tomorrow.
create or replace function public.nv_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

-- Grades a knowledge check on the server and records it only if every answer
-- is right. Returns how many were wrong, so the browser never sees the key.
create or replace function public.submit_check(p_employee_id uuid, p_course_id text, p_answers int[])
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business  uuid := public.my_business_id();
  v_total     int;
  v_wrong     int;
  v_months    int;
  v_today     date := public.nv_today();
begin
  if v_business is null then
    raise exception 'No business on this account' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.employees
    where id = p_employee_id and business_id = v_business and active
  ) then
    raise exception 'Employee not found' using errcode = '42501';
  end if;

  select renew_months into v_months from public.courses where id = p_course_id;
  if v_months is null then
    raise exception 'Course not found' using errcode = '22023';
  end if;

  select count(*) into v_total from private.course_answers where course_id = p_course_id;
  if p_answers is null or coalesce(array_length(p_answers, 1), 0) <> v_total then
    raise exception 'Answer every question' using errcode = '22023';
  end if;

  -- position is 1-based, matching the array index
  select count(*) into v_wrong
  from private.course_answers a
  where a.course_id = p_course_id
    and a.answer is distinct from p_answers[a.position];

  if v_wrong > 0 then
    return json_build_object('passed', false, 'wrong', v_wrong);
  end if;

  insert into public.attestations (employee_id, course_id, completed_on, recorded_by)
  values (p_employee_id, p_course_id, v_today, auth.uid());

  return json_build_object(
    'passed', true,
    'wrong', 0,
    'completed_on', v_today,
    'due_on', (v_today + make_interval(months => v_months))::date
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.businesses       enable row level security;
alter table public.employees        enable row level security;
alter table public.courses          enable row level security;
alter table public.course_questions enable row level security;
alter table public.attestations     enable row level security;
alter table public.training_files   enable row level security;

-- Logged-out visitors get nothing.
revoke all on public.businesses, public.employees, public.courses, public.course_questions,
              public.attestations, public.training_files from anon;
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on function public.submit_check(uuid, text, int[]) from public, anon;
grant execute on function public.submit_check(uuid, text, int[]) to authenticated;
revoke all on function public.my_business_id() from public, anon;
grant execute on function public.my_business_id() to authenticated;

-- Only the operations each table needs; RLS narrows them further.
revoke all on public.businesses, public.employees, public.courses, public.course_questions,
              public.attestations, public.training_files from authenticated;
grant select, insert, update on public.businesses     to authenticated;
grant select, insert, update on public.employees      to authenticated;
grant select                 on public.courses        to authenticated;
grant select                 on public.course_questions to authenticated;
grant select                 on public.attestations   to authenticated;
grant select, insert, delete on public.training_files to authenticated;

drop policy if exists "own business: read"   on public.businesses;
drop policy if exists "own business: create" on public.businesses;
drop policy if exists "own business: rename" on public.businesses;
create policy "own business: read"   on public.businesses for select to authenticated using (owner_id = auth.uid());
create policy "own business: create" on public.businesses for insert to authenticated with check (owner_id = auth.uid());
create policy "own business: rename" on public.businesses for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own employees: read"   on public.employees;
drop policy if exists "own employees: add"    on public.employees;
drop policy if exists "own employees: edit"   on public.employees;
create policy "own employees: read" on public.employees for select to authenticated
  using (business_id = public.my_business_id());
create policy "own employees: add"  on public.employees for insert to authenticated
  with check (business_id = public.my_business_id());
create policy "own employees: edit" on public.employees for update to authenticated
  using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());

drop policy if exists "courses: read"   on public.courses;
drop policy if exists "questions: read" on public.course_questions;
create policy "courses: read"   on public.courses          for select to authenticated using (true);
create policy "questions: read" on public.course_questions for select to authenticated using (true);

-- No insert policy: records are only written by submit_check.
drop policy if exists "own attestations: read" on public.attestations;
create policy "own attestations: read" on public.attestations for select to authenticated
  using (exists (select 1 from public.employees e
                 where e.id = employee_id and e.business_id = public.my_business_id()));

drop policy if exists "own files: read"   on public.training_files;
drop policy if exists "own files: add"    on public.training_files;
drop policy if exists "own files: remove" on public.training_files;
create policy "own files: read" on public.training_files for select to authenticated
  using (business_id = public.my_business_id());
create policy "own files: add" on public.training_files for insert to authenticated
  with check (
    business_id = public.my_business_id()
    and uploaded_by = auth.uid()
    and storage_path like business_id::text || '/%'
    and (employee_id is null or exists (select 1 from public.employees e
                                        where e.id = employee_id and e.business_id = public.my_business_id()))
  );
create policy "own files: remove" on public.training_files for delete to authenticated
  using (business_id = public.my_business_id());

-- ---------------------------------------------------------------------------
-- File storage: private bucket, one folder per business
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-files', 'training-files', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "training files: read own folder"   on storage.objects;
drop policy if exists "training files: upload own folder" on storage.objects;
drop policy if exists "training files: delete own folder" on storage.objects;
create policy "training files: read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'training-files' and (storage.foldername(name))[1] = public.my_business_id()::text);
create policy "training files: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'training-files' and (storage.foldername(name))[1] = public.my_business_id()::text);
create policy "training files: delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'training-files' and (storage.foldername(name))[1] = public.my_business_id()::text);

-- ---------------------------------------------------------------------------
-- Course content. Edit here and re-run to change questions; the browser never
-- sees the answers. Answer numbers are 0-based option indexes.
-- ---------------------------------------------------------------------------

insert into public.courses (id, title, required_for, source_label, source_url, renew_months, jha_note, sort) values
  ('heat', 'Heat Illness Prevention', 'Employees in jobs covered by the heat rule',
   'Regulation R131-24', 'https://www.leg.state.nv.us/Register/2024Register/R131-24AP.pdf', 12,
   'A written job hazard analysis is required when most workers in a job are in the heat more than 30 minutes of any 60, not counting breaks. Judge conditions as if workers had no water, rest or shade.',
   1),
  ('hazcom', 'Hazard Communication', 'Employees who work with hazardous chemicals',
   '29 CFR 1910.1200', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200', 12,
   null, 2)
on conflict (id) do update set
  title = excluded.title, required_for = excluded.required_for, source_label = excluded.source_label,
  source_url = excluded.source_url, renew_months = excluded.renew_months, jha_note = excluded.jha_note,
  sort = excluded.sort;

insert into public.course_questions (course_id, position, prompt, options) values
  ('heat', 1, 'When does a job need heat provisions and a written job hazard analysis?',
   '["Only when it is over 105°F", "When most workers in the job are in the heat more than 30 minutes of any 60, not counting breaks", "Whenever any worker is outdoors for more than 10 minutes"]'),
  ('heat', 2, 'When you write the job hazard analysis, how should you judge conditions?',
   '["As if workers had no water, rest or shade", "Based on the coolest part of the shift", "Based on how workers say they feel"]'),
  ('heat', 3, 'What is the designated person''s job?',
   '["Sign the training roster each year", "Monitor conditions and call emergency services if a worker gets sick", "Decide which workers can skip breaks"]'),
  ('heat', 4, 'A worker shows signs of severe heat illness (confusion, collapse). What do you do?',
   '["Have them rest in the shade until the shift ends", "Call 911 right away and start cooling them", "Give them water and send them home to recover"]'),
  ('hazcom', 1, 'When must Safety Data Sheets be available to employees?',
   '["Only on request, within 30 days", "During every shift, for the chemicals in their work area", "Only during the yearly training"]'),
  ('hazcom', 2, 'Which of these must appear on a shipped chemical container''s label?',
   '["Product identifier, signal word, hazard statements and pictograms", "Only the brand name", "The purchase date and price"]')
on conflict (course_id, position) do update set prompt = excluded.prompt, options = excluded.options;

insert into private.course_answers (course_id, position, answer) values
  ('heat', 1, 1), ('heat', 2, 0), ('heat', 3, 1), ('heat', 4, 1),
  ('hazcom', 1, 1), ('hazcom', 2, 0)
on conflict (course_id, position) do update set answer = excluded.answer;
