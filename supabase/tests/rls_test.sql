-- Access-rule tests. Run after supabase_stub.sql and schema.sql (see README).
-- Every check raises an exception on failure, so psql stops at the first one.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'marco@roof.example'),   -- owner of client A
  ('00000000-0000-0000-0000-00000000000d', 'office@roof.example'),  -- second person at client A
  ('00000000-0000-0000-0000-00000000000b', 'ana@pool.example'),     -- owner of client B
  ('00000000-0000-0000-0000-00000000000c', 'team@nbw.example');     -- NBW staff
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000000c');

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as
$$ begin if ok is not true then raise exception 'FAILED: %', what; end if; raise notice 'ok: %', what; end $$;
create function pg_temp.as_user(id text) returns void language sql as
$$ select set_config('request.jwt.claim.sub', id, false) $$;

-- ---------- logged-out visitor ----------
set role anon;
select pg_temp.as_user('');
do $$ begin
  perform 1 from public.clients;
  raise exception 'FAILED: anon read clients';
exception when insufficient_privilege then raise notice 'ok: anon cannot read clients';
end $$;
do $$ begin
  perform public.order_package(gen_random_uuid(), 'heat', null);
  raise exception 'FAILED: anon ordered';
exception when insufficient_privilege then raise notice 'ok: anon cannot order';
end $$;

-- ---------- staff set up two clients ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  insert into public.clients (business_name) values ('Self-made client');
  raise exception 'FAILED: owner created a client';
exception when insufficient_privilege then raise notice 'ok: only staff create clients';
end $$;
do $$ begin
  perform public.grant_access(gen_random_uuid(), 'marco@roof.example');
  raise exception 'FAILED: owner granted access';
exception when insufficient_privilege then raise notice 'ok: only staff grant access';
end $$;
do $$ begin
  perform 1 from public.staff;
  raise exception 'FAILED: staff list readable';
exception when insufficient_privilege then raise notice 'ok: staff list not readable';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(public.is_staff(), 'staff recognized');
insert into public.clients (business_name, contact_first, plan, price_text, discount_pct)
values ('Desert Ridge Roofing LLC', 'Marco', 'Contractor Watch', '$199 / month', 15),
       ('Blue Pool Service', 'Ana', null, null, 0);
reset role;
select set_config('t.a', (select id::text from public.clients where business_name like 'Desert%'), false);
select set_config('t.b', (select id::text from public.clients where business_name like 'Blue%'), false);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(public.grant_access(current_setting('t.a')::uuid, 'Marco@Roof.example '), 'access granted by email, any case');
select pg_temp.expect(public.grant_access(current_setting('t.a')::uuid, 'office@roof.example'), 'second person added to the same file');
select pg_temp.expect(public.grant_access(current_setting('t.b')::uuid, 'ana@pool.example'), 'access granted to client B');
select pg_temp.expect(not public.grant_access(current_setting('t.a')::uuid, 'nobody@example.com'), 'unknown email reported, nothing granted');
select set_config('t.req', public.request_document(current_setting('t.a')::uuid, 'Written heat illness prevention plan', 'Plan escrito contra el calor', 'safety', 'Requested by NBW')::text, false);
insert into public.updates (client_id, body_en, author_id) values (current_setting('t.a')::uuid, 'Welcome to your file.', '00000000-0000-0000-0000-00000000000c');
do $$ begin
  insert into public.updates (client_id, body_en, author_id) values (current_setting('t.a')::uuid, 'spoofed', '00000000-0000-0000-0000-00000000000a');
  raise exception 'FAILED: update posted as someone else';
exception when insufficient_privilege then raise notice 'ok: updates carry the real author';
end $$;

-- ---------- owner A ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.clients) = 1 and (select business_name from public.clients) like 'Desert%', 'owner sees only their client');
select pg_temp.expect((select count(*) from public.client_users) = 1, 'owner sees only their own access row');
select pg_temp.expect((select requested from public.documents where id = current_setting('t.req')::uuid), 'owner sees the request');
select pg_temp.expect((select count(*) from public.updates) = 1, 'owner sees their update');

insert into storage.objects (bucket_id, name) values ('client-files', current_setting('t.a') || '/' || current_setting('t.req') || '/1-heat-plan.pdf');
select public.submit_upload(current_setting('t.a')::uuid, current_setting('t.req')::uuid, null,
  jsonb_build_array(jsonb_build_object('name', 'heat plan.pdf', 'path', current_setting('t.a') || '/' || current_setting('t.req') || '/1-heat-plan.pdf')),
  '2027-05-01', '  Renewed Monday  ');
select pg_temp.expect((select in_review and not requested from public.documents where id = current_setting('t.req')::uuid), 'upload puts the document under review');
select pg_temp.expect((select note from public.document_events where kind = 'uploaded') = 'Renewed Monday', 'upload note recorded');

insert into storage.objects (bucket_id, name) values ('client-files', current_setting('t.a') || '/new/2-coi.pdf');
select set_config('t.new', public.submit_upload(current_setting('t.a')::uuid, null, 'Certificate of insurance',
  jsonb_build_array(jsonb_build_object('name', 'coi.pdf', 'path', current_setting('t.a') || '/new/2-coi.pdf')), null, null)::text, false);
select pg_temp.expect((select name_en from public.documents where id = current_setting('t.new')::uuid) = 'Certificate of insurance', 'new document created from an upload');

do $$ begin
  perform public.submit_upload(current_setting('t.a')::uuid, null, 'x',
    jsonb_build_array(jsonb_build_object('name', 'x.pdf', 'path', current_setting('t.b') || '/x.pdf')), null, null);
  raise exception 'FAILED: file path outside own folder accepted';
exception when insufficient_privilege then raise notice 'ok: upload records must point into own folder';
end $$;
do $$ begin
  perform public.submit_upload(current_setting('t.a')::uuid, null, 'x', '[]'::jsonb, null, null);
  raise exception 'FAILED: upload with no files accepted';
exception when invalid_parameter_value then raise notice 'ok: upload needs a file';
end $$;
do $$ begin
  update public.documents set in_review = false;
  raise exception 'FAILED: owner changed a document';
exception when insufficient_privilege then raise notice 'ok: owners cannot clear a review';
end $$;
do $$ begin
  perform public.review_document(current_setting('t.req')::uuid, true, null, null);
  raise exception 'FAILED: owner reviewed own upload';
exception when insufficient_privilege then raise notice 'ok: owners cannot approve their own uploads';
end $$;
do $$ begin
  insert into public.updates (client_id, body_en, author_id) values (current_setting('t.a')::uuid, 'fake', '00000000-0000-0000-0000-00000000000a');
  raise exception 'FAILED: owner posted an update';
exception when insufficient_privilege then raise notice 'ok: owners cannot post updates';
end $$;
do $$ declare n int; begin
  delete from storage.objects;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: owner deleted stored files'; end if;
  raise notice 'ok: nobody deletes stored files from the browser';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('client-files', current_setting('t.b') || '/evil.pdf');
  raise exception 'FAILED: owner uploaded into another client folder';
exception when insufficient_privilege then raise notice 'ok: uploads only into own folder';
end $$;

-- orders: price from the server, with the client's discount
select set_config('t.heat', public.order_package(current_setting('t.a')::uuid, 'heat', ' Two sites ')::text, false);
select pg_temp.expect((select price_cents = 102000 and deposit_cents = 51000 and notes = 'Two sites' from public.orders where id = current_setting('t.heat')::uuid), 'Heat Plan: $1,020 with $510 to start');
select set_config('t.kit', public.order_package(current_setting('t.a')::uuid, 'kit', null)::text, false);
select pg_temp.expect((select price_cents = 16900 and deposit_cents = 16900 from public.orders where id = current_setting('t.kit')::uuid), 'kit: $169, paid in full');
select set_config('t.ready', public.order_package(current_setting('t.a')::uuid, 'ready', null)::text, false);
select pg_temp.expect((select price_cents = 17000 from public.orders where id = current_setting('t.ready')::uuid), 'Stay Ready: $170 a month');
do $$ begin
  perform public.order_package(current_setting('t.a')::uuid, 'heat', null);
  raise exception 'FAILED: duplicate open order';
exception when invalid_parameter_value then raise notice 'ok: one open order per package';
end $$;
do $$ declare n int; begin
  update public.orders set status = 'confirmed', price_cents = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: owner changed an order'; end if;
  raise notice 'ok: owners cannot confirm or reprice orders';
end $$;

-- a second person at the same business sees the same file
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from public.documents) = 2 and (select count(*) from public.orders) = 3, 'second person sees the shared file');

-- ---------- owner B ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.clients) = 1 and (select business_name from public.clients) like 'Blue%', 'B sees only their client');
select pg_temp.expect((select count(*) from public.documents) + (select count(*) from public.document_events)
  + (select count(*) from public.updates) + (select count(*) from public.orders) = 0, 'B sees none of A''s documents, history, updates or orders');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'B cannot see A''s files');
do $$ begin
  perform public.submit_upload(current_setting('t.a')::uuid, current_setting('t.req')::uuid, null,
    jsonb_build_array(jsonb_build_object('name', 'x.pdf', 'path', current_setting('t.a') || '/x.pdf')), null, null);
  raise exception 'FAILED: B uploaded to A';
exception when insufficient_privilege then raise notice 'ok: B cannot upload to A''s file';
end $$;
do $$ begin
  perform public.order_package(current_setting('t.a')::uuid, 'full', null);
  raise exception 'FAILED: B ordered for A';
exception when insufficient_privilege then raise notice 'ok: B cannot order for A';
end $$;
select set_config('t.bheat', public.order_package(current_setting('t.b')::uuid, 'heat', null)::text, false);
select pg_temp.expect((select price_cents = 120000 and deposit_cents = 60000 from public.orders
  where id = current_setting('t.bheat')::uuid), 'client without a plan pays the listed price');

-- ---------- staff review ----------
reset role;
insert into storage.objects (bucket_id, name) values ('client-files', 'misc/stray.pdf');
insert into storage.objects (bucket_id, name) values ('client-files', current_setting('t.a') || '/lost/never-recorded.pdf');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from storage.objects) = 3, 'a stray file outside client folders does not break listings');
select pg_temp.expect((select count(*) from public.orphan_files()) = 0, 'owners cannot list orphaned files');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.clients) = 2 and (select count(*) from storage.objects) = 4, 'staff see every client and file');
select pg_temp.expect((select count(*) from public.orphan_files()) = 2, 'staff can list orphaned files');
select public.review_document(current_setting('t.req')::uuid, true, '2027-06-30', null);
select pg_temp.expect((select not in_review and not requested and expires_on = '2027-06-30'
  and reviewed_by = '00000000-0000-0000-0000-00000000000c' from public.documents where id = current_setting('t.req')::uuid), 'accepting makes the document current, stamped with the reviewer');
select public.review_document(current_setting('t.new')::uuid, false, null, 'This is last year''s certificate.');
select pg_temp.expect((select requested and not in_review from public.documents where id = current_setting('t.new')::uuid), 'sending back asks the client again');
select pg_temp.expect((select note from public.document_events where document_id = current_setting('t.new')::uuid and kind = 'requested') = 'This is last year''s certificate.', 'reason recorded in the history');
update public.orders set status = 'confirmed', price_cents = 95000, deposit_cents = 47500, staff_note = 'Founding rate'
 where id = current_setting('t.heat')::uuid;
select pg_temp.expect((select handled_by from public.orders where id = current_setting('t.heat')::uuid) = '00000000-0000-0000-0000-00000000000c', 'order stamped with the staff member');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select status from public.orders where id = current_setting('t.heat')::uuid) = 'confirmed', 'owner sees the confirmation');
select pg_temp.expect((select count(*) from public.document_events where kind = 'reviewed') = 1, 'owner sees the review in the history');

-- ---------- upload cap ----------
reset role;
insert into storage.objects (bucket_id, name)
select 'client-files', current_setting('t.b') || '/bulk/' || g || '.pdf' from generate_series(1, 500) g;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('client-files', current_setting('t.b') || '/one-more.pdf');
  raise exception 'FAILED: upload over the cap allowed';
exception when insufficient_privilege then raise notice 'ok: uploads stop at 500 files per client';
end $$;

reset role;
\echo ALL RLS TESTS PASSED
