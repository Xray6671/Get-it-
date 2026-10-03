-- Nevada Business Watch: Compliance Hub schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it drops and recreates only the hub's policies and functions,
-- never the tables or their data.
--
-- Model: one business per owner login. Owners add employees, record knowledge
-- checks (graded on the server), store training files and upload business
-- documents (licenses, insurance, written plans). NBW staff, listed in
-- public.staff, can see every client's file, review documents, request new
-- ones and post updates. Training records can't be edited or deleted from the
-- browser, only added, so the history stays intact.
--
-- To make someone NBW staff, have them create an account in the hub, then run:
--   insert into public.staff (user_id) select id from auth.users where email = 'them@example.com';

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

alter table public.businesses add column if not exists contact_name text
  check (contact_name is null or char_length(contact_name) <= 60);

-- NBW team members. Only added from the SQL Editor, never from the browser.
create table if not exists public.staff (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  added_at  timestamptz not null default now()
);

create table if not exists public.document_types (
  id     text primary key,
  title  text not null,
  icon   text not null default 'doc',
  sort   int  not null default 0
);

-- One row per document a business keeps on file. Status:
--   requested     NBW asked for it and has no copy yet
--   under_review  the owner uploaded a copy; NBW is checking it
--   current       NBW checked it; expires_on drives "renew soon" / "expired"
--   rejected      NBW couldn't accept the copy; note says why
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  type_id      text not null references public.document_types (id),
  label        text check (label is null or char_length(label) <= 80),
  status       text not null default 'requested'
               check (status in ('requested', 'under_review', 'current', 'rejected')),
  expires_on   date,
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists documents_business_idx on public.documents (business_id);

create table if not exists public.document_files (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents (id) on delete cascade,
  business_id   uuid not null references public.businesses (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null check (char_length(file_name) between 1 and 200),
  size_bytes    bigint not null check (size_bytes > 0),
  uploaded_by   uuid not null references auth.users (id),
  created_at    timestamptz not null default now()
);
create index if not exists document_files_document_idx on public.document_files (document_id);

-- Messages from the NBW team to one client
create table if not exists public.updates (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  author_id    uuid not null default auth.uid() references auth.users (id),
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index if not exists updates_business_idx on public.updates (business_id, created_at desc);

-- Training material shown before each knowledge check, and the employee's
-- typed signature on each record
alter table public.courses add column if not exists lesson jsonb not null default '[]'::jsonb;
alter table public.courses add column if not exists lesson_url text check (lesson_url is null or lesson_url like 'https://%');
alter table public.attestations add column if not exists signed_name text
  check (signed_name is null or char_length(btrim(signed_name)) between 1 and 80);

-- Who at NBW last approved, rejected or changed a document or order, and when.
-- Set by triggers, never by the browser.
alter table public.documents add column if not exists reviewed_by uuid references auth.users (id);
alter table public.documents add column if not exists reviewed_at timestamptz;

-- Services clients can order from NBW. Prices are in cents; client_price_cents
-- is what a Business File customer pays. max_employees: a bigger crew gets a
-- quote instead of the listed price.
create table if not exists public.packages (
  id                  text primary key,
  title               text not null,
  summary             text not null,
  price_cents         int  not null check (price_cents > 0),
  client_price_cents  int  not null check (client_price_cents > 0),
  billing             text not null check (billing in ('one_time', 'monthly', 'per_session')),
  done_for_you        boolean not null default true,
  max_employees       int,
  active              boolean not null default true,
  sort                int  not null default 0
);

-- An order is a request until NBW confirms it and invoices the client.
-- No payment is taken in the app. price_cents null = quote after a free check.
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  package_id     text not null references public.packages (id),
  status         text not null default 'requested'
                 check (status in ('requested', 'confirmed', 'in_progress', 'delivered', 'cancelled')),
  price_cents    int check (price_cents is null or price_cents >= 0),
  deposit_cents  int check (deposit_cents is null or deposit_cents >= 0),
  notes          text check (notes is null or char_length(notes) <= 1000),
  staff_note     text check (staff_note is null or char_length(staff_note) <= 1000),
  created_by     uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists orders_business_idx on public.orders (business_id, created_at desc);
alter table public.orders add column if not exists handled_by uuid references auth.users (id);
alter table public.orders add column if not exists handled_at timestamptz;

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
-- is right and the employee signed it by typing their name. Returns how many
-- answers were wrong, so the browser never sees the key.
drop function if exists public.submit_check(uuid, text, int[]);
create or replace function public.submit_check(p_employee_id uuid, p_course_id text, p_answers int[], p_signed_name text)
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
  v_signed    text := btrim(coalesce(p_signed_name, ''));
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

  if char_length(v_signed) not between 1 and 80 then
    raise exception 'The employee must type their name to sign' using errcode = '22023';
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

  insert into public.attestations (employee_id, course_id, completed_on, recorded_by, signed_name)
  values (p_employee_id, p_course_id, v_today, auth.uid(), v_signed);

  return json_build_object(
    'passed', true,
    'wrong', 0,
    'completed_on', v_today,
    'due_on', (v_today + make_interval(months => v_months))::date
  );
end;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Stamp staff changes with who and when. A change made by an owner (a new
-- upload through submit_document) clears the stamp, since nobody has
-- reviewed the new copy yet.
create or replace function public.stamp_document_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.expires_on is distinct from old.expires_on
     or new.note is distinct from old.note then
    if public.is_staff() then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists documents_review_stamp on public.documents;
create trigger documents_review_stamp before update on public.documents
  for each row execute function public.stamp_document_review();

create or replace function public.stamp_order_handling()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_staff() then
    new.handled_by := auth.uid();
    new.handled_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists orders_handled_stamp on public.orders;
create trigger orders_handled_stamp before update on public.orders
  for each row execute function public.stamp_order_handling();

-- Uploads per business are capped so one account can't fill the bucket.
create or replace function public.can_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_business_id() is not null
     and (select count(*) from storage.objects
          where bucket_id = 'client-files'
            and name like public.my_business_id()::text || '/%') < 300
$$;

-- Staff: stored files that no document or training record points to (an
-- upload whose record failed). Delete them from the Storage dashboard.
create or replace function public.orphan_files()
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where public.is_staff()
    and o.bucket_id = 'client-files'
    and not exists (select 1 from public.document_files f where f.storage_path = o.name)
    and not exists (select 1 from public.training_files t where t.storage_path = o.name)
  order by o.name
$$;

-- An owner orders a package. The price comes from public.packages on the
-- server, never from the browser. Done-for-you work is 50% to start.
create or replace function public.order_package(p_package_id text, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := public.my_business_id();
  v_pkg      public.packages;
  v_crew     int;
  v_price    int;
  v_id       uuid;
begin
  if v_business is null then
    raise exception 'No business on this account' using errcode = '42501';
  end if;
  select * into v_pkg from public.packages where id = p_package_id and active;
  if v_pkg.id is null then
    raise exception 'That package is not available' using errcode = '22023';
  end if;

  select count(*) into v_crew from public.employees where business_id = v_business and active;
  v_price := case when v_pkg.max_employees is not null and v_crew > v_pkg.max_employees
                  then null else v_pkg.client_price_cents end;

  insert into public.orders (business_id, package_id, price_cents, deposit_cents, notes, created_by)
  values (v_business, v_pkg.id, v_price,
          case when v_price is null then null
               when v_pkg.done_for_you and v_pkg.billing = 'one_time' then round(v_price / 2.0)
               else v_price end,
          nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- An owner can withdraw an order until NBW confirms it.
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set status = 'cancelled'
   where id = p_order_id and business_id = public.my_business_id() and status = 'requested';
  if not found then
    raise exception 'Only orders NBW hasn''t confirmed yet can be cancelled here' using errcode = '42501';
  end if;
end;
$$;

-- An owner sends in a document file. Adds it to an existing document (one NBW
-- requested, or a renewal) or starts a new one, and always puts the document
-- under review: only NBW staff can mark a document current.
create or replace function public.submit_document(
  p_document_id  uuid,
  p_type_id      text,
  p_label        text,
  p_expires_on   date,
  p_storage_path text,
  p_file_name    text,
  p_size_bytes   bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid := public.my_business_id();
  v_doc      uuid := p_document_id;
begin
  if v_business is null then
    raise exception 'No business on this account' using errcode = '42501';
  end if;
  if p_storage_path is null or p_storage_path not like v_business::text || '/docs/%' then
    raise exception 'File must be stored in your docs folder' using errcode = '42501';
  end if;

  if v_doc is not null then
    update public.documents
       set status = 'under_review',
           expires_on = coalesce(p_expires_on, expires_on)
     where id = v_doc and business_id = v_business;
    if not found then
      raise exception 'Document not found' using errcode = '42501';
    end if;
  else
    if not exists (select 1 from public.document_types where id = p_type_id) then
      raise exception 'Choose a document type' using errcode = '22023';
    end if;
    insert into public.documents (business_id, type_id, label, status, expires_on)
    values (v_business, p_type_id, nullif(btrim(p_label), ''), 'under_review', p_expires_on)
    returning id into v_doc;
  end if;

  insert into public.document_files (document_id, business_id, storage_path, file_name, size_bytes, uploaded_by)
  values (v_doc, v_business, p_storage_path, p_file_name, p_size_bytes, auth.uid());

  return v_doc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- Function calls are wrapped in (select ...) so Postgres runs them once per
-- query instead of once per row.
-- ---------------------------------------------------------------------------

alter table public.businesses       enable row level security;
alter table public.employees        enable row level security;
alter table public.courses          enable row level security;
alter table public.course_questions enable row level security;
alter table public.attestations     enable row level security;
alter table public.training_files   enable row level security;
alter table public.staff            enable row level security;
alter table public.document_types   enable row level security;
alter table public.documents        enable row level security;
alter table public.document_files   enable row level security;
alter table public.updates          enable row level security;
alter table public.packages         enable row level security;
alter table public.orders           enable row level security;

-- Logged-out visitors get nothing.
revoke all on public.businesses, public.employees, public.courses, public.course_questions,
              public.attestations, public.training_files, public.staff, public.document_types,
              public.documents, public.document_files, public.updates, public.packages, public.orders from anon;
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on function public.submit_check(uuid, text, int[], text) from public, anon;
grant execute on function public.submit_check(uuid, text, int[], text) to authenticated;
revoke all on function public.my_business_id() from public, anon;
grant execute on function public.my_business_id() to authenticated;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
revoke all on function public.submit_document(uuid, text, text, date, text, text, bigint) from public, anon;
grant execute on function public.submit_document(uuid, text, text, date, text, text, bigint) to authenticated;
revoke all on function public.order_package(text, text) from public, anon;
grant execute on function public.order_package(text, text) to authenticated;
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;
revoke all on function public.can_upload() from public, anon;
grant execute on function public.can_upload() to authenticated;
revoke all on function public.orphan_files() from public, anon;
grant execute on function public.orphan_files() to authenticated;

-- Only the operations each table needs; RLS narrows them further.
revoke all on public.businesses, public.employees, public.courses, public.course_questions,
              public.attestations, public.training_files, public.staff, public.document_types,
              public.documents, public.document_files, public.updates, public.packages, public.orders from authenticated;
grant select, insert, update on public.businesses     to authenticated;
grant select, insert, update on public.employees      to authenticated;
grant select                 on public.courses        to authenticated;
grant select                 on public.course_questions to authenticated;
grant select                 on public.attestations   to authenticated;
grant select, insert, delete on public.training_files to authenticated;
grant select                 on public.document_types to authenticated;
grant select, insert, update on public.documents      to authenticated;
grant select                 on public.document_files to authenticated;
grant select, insert         on public.updates        to authenticated;
grant select                 on public.packages       to authenticated;
grant select, update         on public.orders         to authenticated;
-- public.staff: no grants. is_staff() reads it on the server.

drop policy if exists "own business: read"   on public.businesses;
drop policy if exists "own business: create" on public.businesses;
drop policy if exists "own business: rename" on public.businesses;
create policy "own business: read"   on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_staff()));
create policy "own business: create" on public.businesses for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own business: rename" on public.businesses for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "own employees: read"   on public.employees;
drop policy if exists "own employees: add"    on public.employees;
drop policy if exists "own employees: edit"   on public.employees;
create policy "own employees: read" on public.employees for select to authenticated
  using (business_id = (select public.my_business_id()) or (select public.is_staff()));
create policy "own employees: add"  on public.employees for insert to authenticated
  with check (business_id = (select public.my_business_id()));
create policy "own employees: edit" on public.employees for update to authenticated
  using (business_id = (select public.my_business_id())) with check (business_id = (select public.my_business_id()));

drop policy if exists "courses: read"   on public.courses;
drop policy if exists "questions: read" on public.course_questions;
create policy "courses: read"   on public.courses          for select to authenticated using (true);
create policy "questions: read" on public.course_questions for select to authenticated using (true);

-- No insert policy: records are only written by submit_check.
drop policy if exists "own attestations: read" on public.attestations;
create policy "own attestations: read" on public.attestations for select to authenticated
  using ((select public.is_staff()) or exists (select 1 from public.employees e
                 where e.id = employee_id and e.business_id = (select public.my_business_id())));

drop policy if exists "own files: read"   on public.training_files;
drop policy if exists "own files: add"    on public.training_files;
drop policy if exists "own files: remove" on public.training_files;
create policy "own files: read" on public.training_files for select to authenticated
  using (business_id = (select public.my_business_id()) or (select public.is_staff()));
create policy "own files: add" on public.training_files for insert to authenticated
  with check (
    business_id = (select public.my_business_id())
    and uploaded_by = (select auth.uid())
    and storage_path like business_id::text || '/training/%'
    and (employee_id is null or exists (select 1 from public.employees e
                                        where e.id = employee_id and e.business_id = (select public.my_business_id())))
  );
create policy "own files: remove" on public.training_files for delete to authenticated
  using (business_id = (select public.my_business_id()));

drop policy if exists "document types: read" on public.document_types;
create policy "document types: read" on public.document_types for select to authenticated using (true);

-- Owners read their own documents; only staff create (requests) or change them.
-- Owners send files through submit_document().
drop policy if exists "documents: read"           on public.documents;
drop policy if exists "documents: staff request"  on public.documents;
drop policy if exists "documents: staff review"   on public.documents;
create policy "documents: read" on public.documents for select to authenticated
  using (business_id = (select public.my_business_id()) or (select public.is_staff()));
create policy "documents: staff request" on public.documents for insert to authenticated
  with check ((select public.is_staff()));
create policy "documents: staff review" on public.documents for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists "document files: read" on public.document_files;
create policy "document files: read" on public.document_files for select to authenticated
  using (business_id = (select public.my_business_id()) or (select public.is_staff()));

drop policy if exists "updates: read"       on public.updates;
drop policy if exists "updates: staff post" on public.updates;
create policy "updates: read" on public.updates for select to authenticated
  using (business_id = (select public.my_business_id()) or (select public.is_staff()));
create policy "updates: staff post" on public.updates for insert to authenticated
  with check ((select public.is_staff()) and author_id = (select auth.uid()));

drop policy if exists "packages: read" on public.packages;
create policy "packages: read" on public.packages for select to authenticated using (true);

-- Owners place and cancel orders through order_package() and cancel_order();
-- only staff change an order directly.
drop policy if exists "orders: read"         on public.orders;
drop policy if exists "orders: staff update" on public.orders;
create policy "orders: read" on public.orders for select to authenticated
  using (business_id = (select public.my_business_id()) or (select public.is_staff()));
create policy "orders: staff update" on public.orders for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- File storage: private bucket, one folder per business
--   {business_id}/training/...  training rosters and certificates
--   {business_id}/docs/...      business documents (owners can't delete these)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-files', 'client-files', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "client files: read"   on storage.objects;
drop policy if exists "client files: upload" on storage.objects;
drop policy if exists "client files: delete training" on storage.objects;
create policy "client files: read" on storage.objects for select to authenticated
  using (bucket_id = 'client-files'
         and ((storage.foldername(name))[1] = (select public.my_business_id())::text or (select public.is_staff())));
create policy "client files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-files'
              and (storage.foldername(name))[1] = (select public.my_business_id())::text
              and (storage.foldername(name))[2] in ('training', 'docs')
              and (select public.can_upload()));
create policy "client files: delete training" on storage.objects for delete to authenticated
  using (bucket_id = 'client-files'
         and (storage.foldername(name))[1] = (select public.my_business_id())::text
         and (storage.foldername(name))[2] = 'training');

-- ---------------------------------------------------------------------------
-- Course content. Edit here and re-run to change questions; the browser never
-- sees the answers. Answer numbers are 0-based option indexes.
-- ---------------------------------------------------------------------------

insert into public.courses (id, title, required_for, source_label, source_url, renew_months, jha_note, sort, lesson, lesson_url) values
  ('heat', 'Heat Illness Prevention', 'Employees in jobs covered by the heat rule',
   'Regulation R131-24', 'https://www.leg.state.nv.us/Register/2024Register/R131-24AP.pdf', 12,
   'A written job hazard analysis is required when most workers in a job are in the heat more than 30 minutes of any 60, not counting breaks. Judge conditions as if workers had no water, rest or shade.',
   1,
   '["Drink water often, before you feel thirsty. Your employer must give you drinkable water.", "Take rest breaks in shade or a cool area, and take one right away if you feel signs of heat illness.", "Early signs: heavy sweating, cramps, headache, dizziness, nausea or weakness. Stop, cool down, drink water and tell your supervisor.", "Severe signs: confusion, slurred speech, fainting, collapse or a seizure. Call 911 right away and start cooling the person.", "New and returning workers need shorter first days to get used to the heat.", "Your workplace has a designated person who watches conditions and calls emergency services if someone gets sick. Know who it is.", "When most workers in a job are in the heat more than 30 minutes of any 60, not counting breaks, the employer needs a written job hazard analysis, judged as if workers had no water, rest or shade."]'::jsonb,
   'https://nevadabusinesswatch.com/lessons.html#s7l1'),
  ('hazcom', 'Hazard Communication', 'Employees who work with hazardous chemicals',
   '29 CFR 1910.1200', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200', 12,
   null, 2,
   '["You have a right to know about the hazardous chemicals you work with.", "Safety Data Sheets (SDS) explain each chemical''s hazards and how to protect yourself. They must be available to you during every shift.", "Shipped chemical containers are labeled with the product identifier, a signal word, hazard statements and pictograms.", "Read the label before you use a chemical. Do not use anything from an unlabeled container: ask your supervisor.", "Wear the protective equipment the SDS calls for, and know where to find first aid steps for each chemical."]'::jsonb,
   null)
on conflict (id) do update set
  title = excluded.title, required_for = excluded.required_for, source_label = excluded.source_label,
  source_url = excluded.source_url, renew_months = excluded.renew_months, jha_note = excluded.jha_note,
  sort = excluded.sort, lesson = excluded.lesson, lesson_url = excluded.lesson_url;

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

insert into public.document_types (id, title, icon, sort) values
  ('nscb_license',      'NSCB contractor license',              'id',      1),
  ('state_license',     'Nevada State Business License',        'id',      2),
  ('local_license',     'City or county business license',      'id',      3),
  ('general_liability', 'General liability certificate',        'shield',  4),
  ('workers_comp',      'Workers'' comp policy',                'hardhat', 5),
  ('heat_plan',         'Written heat illness prevention plan', 'sun',     6),
  ('safety_program',    'Written workplace safety program',     'doc',     7),
  ('other',             'Other document',                       'doc',     99)
on conflict (id) do update set title = excluded.title, icon = excluded.icon, sort = excluded.sort;

-- Same packages and prices as safety.html. Business File customers pay the
-- client price: 15% off, rounded to whole dollars. Edit and re-run to change.
insert into public.packages (id, title, summary, price_cents, client_price_cents, billing, done_for_you, max_employees, sort) values
  ('heat_plan', 'Heat Plan',
   'For 11 to 25 employees. We do your hazard analysis, write your heat plan, set up your designated person and train one crew.',
   120000, 102000, 'one_time', true, 25, 1),
  ('full_program', 'Full Safety Program + Heat Plan',
   'Everything in the Heat Plan, plus a complete written safety program, injury reporting steps, safety committee setup (26+ employees) and two trainings.',
   240000, 204000, 'one_time', true, null, 2),
  ('stay_ready', 'Stay Ready',
   'A spring review before summer, yearly refresher training, new-hire materials and updates when Nevada rules change.',
   20000, 17000, 'monthly', true, null, 3),
  ('extra_training', 'Extra training session',
   'One more crew training session, in English or Spanish.',
   30000, 25500, 'per_session', true, null, 4),
  ('kit_review', 'Kit + Expert Review',
   'Our fill-in safety program and heat plan kit, plus we review your finished draft and walk you through fixes.',
   39900, 33900, 'one_time', false, null, 5),
  ('diy_kit', 'DIY Compliance Kit',
   'Fill-in safety program and heat plan, hazard worksheet, forms, English and Spanish handouts and step-by-step instructions.',
   19900, 16900, 'one_time', false, null, 6)
on conflict (id) do update set
  title = excluded.title, summary = excluded.summary, price_cents = excluded.price_cents,
  client_price_cents = excluded.client_price_cents, billing = excluded.billing,
  done_for_you = excluded.done_for_you, max_employees = excluded.max_employees, sort = excluded.sort;
