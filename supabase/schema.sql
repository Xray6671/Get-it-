-- Nevada Business Watch: My Business File schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it recreates policies, functions and package prices, and
-- never drops a table or its data.
--
-- Model: NBW sets up each client (a business) and gives one or more people
-- access to it. Clients sign in with a one-time email code, see their
-- documents, upload new copies and order Safety & Heat packages. NBW staff,
-- listed in public.staff, see every client, review uploads, request missing
-- documents, post updates and confirm orders.
--
-- Make someone NBW staff (after they have an account under Authentication):
--   insert into public.staff (user_id) select id from auth.users where email = 'them@example.com';

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  business_name  text not null check (char_length(btrim(business_name)) between 1 and 120),
  contact_first  text check (contact_first is null or char_length(contact_first) <= 60),
  plan           text check (plan is null or char_length(plan) <= 60),
  price_text     text check (price_text is null or char_length(price_text) <= 60),
  -- Business Watch and Contractor Watch clients take 15% off Safety & Heat packages
  discount_pct   int  not null default 0 check (discount_pct between 0 and 50),
  created_at     timestamptz not null default now()
);

-- Who can open which client's file
create table if not exists public.client_users (
  user_id    uuid not null references auth.users (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- NBW team members. Only added from the SQL Editor, never from the browser.
create table if not exists public.staff (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  added_at  timestamptz not null default now()
);

-- One row per document a client keeps on file. What the client sees:
--   requested                 "We don't have a copy yet. Requested by NBW."
--   in_review                 "We're checking it"
--   otherwise, expires_on     expired / renew soon / current
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  name_en      text not null check (char_length(btrim(name_en)) between 1 and 160),
  name_es      text check (name_es is null or char_length(name_es) <= 160),
  category     text not null default 'other'
               check (category in ('license', 'insurance', 'wc', 'registration', 'safety', 'other')),
  expires_on   date,
  in_review    boolean not null default false,
  requested    boolean not null default false,
  reviewed_by  uuid references auth.users (id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists documents_client_idx on public.documents (client_id);

-- Each document's history: uploads, reviews, requests and expiry flags
create table if not exists public.document_events (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  kind          text not null check (kind in ('uploaded', 'reviewed', 'requested', 'flag')),
  file_name     text check (file_name is null or char_length(file_name) <= 200),
  storage_path  text unique,
  note          text check (note is null or char_length(note) <= 1000),
  actor         uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create index if not exists document_events_client_idx on public.document_events (client_id, created_at desc);

-- Messages from the NBW team to one client
create table if not exists public.updates (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  body_en     text not null check (char_length(btrim(body_en)) between 1 and 2000),
  body_es     text check (body_es is null or char_length(body_es) <= 2000),
  author_id   uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);
create index if not exists updates_client_idx on public.updates (client_id, created_at desc);

-- Safety & Heat packages, same prices as safety.html (in cents)
create table if not exists public.packages (
  id            text primary key,
  title         text not null,
  price_cents   int  not null check (price_cents > 0),
  billing       text not null check (billing in ('one_time', 'monthly')),
  done_for_you  boolean not null default true,
  active        boolean not null default true,
  sort          int  not null default 0
);

-- An order is a request until NBW confirms it and invoices the client.
-- No payment is taken in the app.
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  package_id     text not null references public.packages (id),
  status         text not null default 'requested'
                 check (status in ('requested', 'confirmed', 'in_progress', 'delivered', 'cancelled')),
  price_cents    int check (price_cents is null or price_cents >= 0),
  deposit_cents  int check (deposit_cents is null or deposit_cents >= 0),
  notes          text check (notes is null or char_length(notes) <= 1000),
  staff_note     text check (staff_note is null or char_length(staff_note) <= 1000),
  created_by     uuid not null references auth.users (id),
  handled_by     uuid references auth.users (id),
  handled_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists orders_client_idx on public.orders (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

create or replace function public.is_member(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.client_users where user_id = auth.uid() and client_id = p_client_id)
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

-- Stamp staff changes to an order with who and when
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

-- Storage checks compare the file's top folder as text, so a stray file
-- outside a client folder is simply not visible instead of breaking listings.
create or replace function public.is_member_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.client_users
                 where user_id = auth.uid() and client_id::text = split_part(p_name, '/', 1))
$$;

-- Uploads per client are capped so one account can't fill the bucket
create or replace function public.can_upload(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_member_path(p_name)
     and (select count(*) from storage.objects
          where bucket_id = 'client-files' and name like split_part(p_name, '/', 1) || '/%') < 500
$$;

-- ---------------------------------------------------------------------------
-- Client actions
-- ---------------------------------------------------------------------------

-- A client sends in one or more files for a document, or for a new one when
-- p_document_id is null. The document goes under review; only staff can
-- clear it. p_files: [{"name": "license.pdf", "path": "<client_id>/..."}]
create or replace function public.submit_upload(
  p_client_id   uuid,
  p_document_id uuid,
  p_new_name    text,
  p_files       jsonb,
  p_expires_on  date,
  p_note        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc  uuid := p_document_id;
  v_file jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_member(p_client_id) then
    raise exception 'Not your file' using errcode = '42501';
  end if;
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then
    raise exception 'Choose at least one file' using errcode = '22023';
  end if;
  for v_file in select * from jsonb_array_elements(p_files) loop
    if coalesce(v_file ->> 'path', '') not like p_client_id::text || '/%' then
      raise exception 'Files must be stored in your folder' using errcode = '42501';
    end if;
  end loop;

  if v_doc is null then
    insert into public.documents (client_id, name_en, name_es, category, expires_on, in_review)
    values (p_client_id, left(coalesce(nullif(btrim(p_new_name), ''), 'Document'), 160), null, 'other', p_expires_on, true)
    returning id into v_doc;
  else
    update public.documents
       set in_review = true, requested = false,
           expires_on = coalesce(p_expires_on, expires_on),
           reviewed_by = null, reviewed_at = null
     where id = v_doc and client_id = p_client_id;
    if not found then
      raise exception 'Document not found' using errcode = '42501';
    end if;
  end if;

  insert into public.document_events (client_id, document_id, kind, file_name, storage_path, note, actor)
  select p_client_id, v_doc, 'uploaded', left(f ->> 'name', 200), f ->> 'path', v_note, auth.uid()
  from jsonb_array_elements(p_files) f;

  return v_doc;
end;
$$;

-- A client orders a package. The price comes from public.packages and the
-- client's discount on the server, never from the browser. Done-for-you
-- work is 50% to start.
create or replace function public.order_package(p_client_id uuid, p_package_id text, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg   public.packages;
  v_pct   int;
  v_price int;
  v_id    uuid;
begin
  if not public.is_member(p_client_id) then
    raise exception 'Not your file' using errcode = '42501';
  end if;
  select * into v_pkg from public.packages where id = p_package_id and active;
  if v_pkg.id is null then
    raise exception 'That package is not available' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders where client_id = p_client_id and package_id = p_package_id
             and status in ('requested', 'confirmed', 'in_progress')) then
    raise exception 'You already have this order open' using errcode = '22023';
  end if;

  select discount_pct into v_pct from public.clients where id = p_client_id;
  -- whole dollars, like the prices on the site
  v_price := round(v_pkg.price_cents * (100 - v_pct) / 10000.0) * 100;

  insert into public.orders (client_id, package_id, price_cents, deposit_cents, notes, created_by)
  values (p_client_id, v_pkg.id, v_price,
          case when v_pkg.done_for_you and v_pkg.billing = 'one_time' then round(v_price / 200.0) * 100 else v_price end,
          left(nullif(btrim(coalesce(p_notes, '')), ''), 1000), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff actions
-- ---------------------------------------------------------------------------

-- Accept an upload (the document becomes current with this expiration date)
-- or send it back with a note (the client is asked for a new copy).
create or replace function public.review_document(p_document_id uuid, p_accept boolean, p_expires_on date, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  update public.documents
     set in_review = false,
         requested = not p_accept,
         expires_on = case when p_accept then coalesce(p_expires_on, expires_on) else expires_on end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_document_id
  returning client_id into v_client;
  if v_client is null then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  insert into public.document_events (client_id, document_id, kind, note, actor)
  values (v_client, p_document_id, case when p_accept then 'reviewed' else 'requested' end, v_note, auth.uid());
end;
$$;

-- Ask a client for a document NBW doesn't have yet
create or replace function public.request_document(p_client_id uuid, p_name_en text, p_name_es text, p_category text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  insert into public.documents (client_id, name_en, name_es, category, requested)
  values (p_client_id, btrim(p_name_en), nullif(btrim(coalesce(p_name_es, '')), ''), coalesce(p_category, 'other'), true)
  returning id into v_id;
  insert into public.document_events (client_id, document_id, kind, note, actor)
  values (p_client_id, v_id, 'requested', nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  return v_id;
end;
$$;

-- Give a person access to a client's file. They need an account first
-- (Authentication -> Users -> Add user or Invite in the Supabase dashboard).
create or replace function public.grant_access(p_client_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    return false;
  end if;
  insert into public.client_users (user_id, client_id) values (v_user, p_client_id)
  on conflict do nothing;
  return true;
end;
$$;

-- Stored files that no document points to (an upload whose record failed).
-- Delete them in Storage -> client-files.
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
    and not exists (select 1 from public.document_events e where e.storage_path = o.name)
  order by o.name
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- Function calls are wrapped in (select ...) so Postgres runs them once per
-- query instead of once per row.
-- ---------------------------------------------------------------------------

alter table public.clients          enable row level security;
alter table public.client_users     enable row level security;
alter table public.staff            enable row level security;
alter table public.documents        enable row level security;
alter table public.document_events  enable row level security;
alter table public.updates          enable row level security;
alter table public.packages         enable row level security;
alter table public.orders           enable row level security;

revoke all on public.clients, public.client_users, public.staff, public.documents, public.document_events,
              public.updates, public.packages, public.orders from anon, authenticated;

grant select, insert, update on public.clients         to authenticated;
grant select                 on public.client_users    to authenticated;
grant select                 on public.documents       to authenticated;
grant select                 on public.document_events to authenticated;
grant select, insert         on public.updates         to authenticated;
grant select                 on public.packages        to authenticated;
grant select, update         on public.orders          to authenticated;
-- public.staff: no grants. is_staff() reads it on the server.

do $$
declare f text;
begin
  foreach f in array array[
    'public.is_staff()', 'public.is_member(uuid)', 'public.is_member_path(text)', 'public.can_upload(text)',
    'public.submit_upload(uuid, uuid, text, jsonb, date, text)', 'public.order_package(uuid, text, text)',
    'public.review_document(uuid, boolean, date, text)', 'public.request_document(uuid, text, text, text, text)',
    'public.grant_access(uuid, text)', 'public.orphan_files()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

drop policy if exists "clients: read"         on public.clients;
drop policy if exists "clients: staff add"    on public.clients;
drop policy if exists "clients: staff edit"   on public.clients;
create policy "clients: read" on public.clients for select to authenticated
  using ((select public.is_staff()) or public.is_member(id));
create policy "clients: staff add" on public.clients for insert to authenticated
  with check ((select public.is_staff()));
create policy "clients: staff edit" on public.clients for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists "client users: read" on public.client_users;
create policy "client users: read" on public.client_users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "documents: read" on public.documents;
create policy "documents: read" on public.documents for select to authenticated
  using ((select public.is_staff()) or public.is_member(client_id));

drop policy if exists "document events: read" on public.document_events;
create policy "document events: read" on public.document_events for select to authenticated
  using ((select public.is_staff()) or public.is_member(client_id));

drop policy if exists "updates: read"       on public.updates;
drop policy if exists "updates: staff post" on public.updates;
create policy "updates: read" on public.updates for select to authenticated
  using ((select public.is_staff()) or public.is_member(client_id));
create policy "updates: staff post" on public.updates for insert to authenticated
  with check ((select public.is_staff()) and author_id = (select auth.uid()));

drop policy if exists "packages: read" on public.packages;
create policy "packages: read" on public.packages for select to authenticated using (true);

drop policy if exists "orders: read"         on public.orders;
drop policy if exists "orders: staff update" on public.orders;
create policy "orders: read" on public.orders for select to authenticated
  using ((select public.is_staff()) or public.is_member(client_id));
create policy "orders: staff update" on public.orders for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- File storage: private bucket, one folder per client ({client_id}/...)
-- Clients upload and read their own files; staff read everything. Nobody
-- deletes from the browser, so the history stays intact.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-files', 'client-files', false, 15728640,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "client files: read"   on storage.objects;
drop policy if exists "client files: upload" on storage.objects;
create policy "client files: read" on storage.objects for select to authenticated
  using (bucket_id = 'client-files'
         and ((select public.is_staff()) or public.is_member_path(name)));
create policy "client files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-files'
              and public.can_upload(name));

-- ---------------------------------------------------------------------------
-- Packages: same names and prices as safety.html. Edit and re-run to change.
-- ---------------------------------------------------------------------------

insert into public.packages (id, title, price_cents, billing, done_for_you, sort) values
  ('heat',   'Heat Plan',                       120000, 'one_time', true,  1),
  ('full',   'Full Safety Program + Heat Plan', 240000, 'one_time', true,  2),
  ('ready',  'Stay Ready',                       20000, 'monthly',  true,  3),
  ('review', 'Kit + Expert Review',              39900, 'one_time', false, 4),
  ('kit',    'DIY Compliance Kit',               19900, 'one_time', false, 5)
on conflict (id) do update set
  title = excluded.title, price_cents = excluded.price_cents, billing = excluded.billing,
  done_for_you = excluded.done_for_you, sort = excluded.sort;
