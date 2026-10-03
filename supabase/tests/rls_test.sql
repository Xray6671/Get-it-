-- Access-rule tests. Run after supabase_stub.sql and schema.sql (see README).
-- Every check raises an exception on failure, so psql stops at the first one.
\set ON_ERROR_STOP on

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'),  -- owner A
  ('00000000-0000-0000-0000-00000000000b'),  -- owner B
  ('00000000-0000-0000-0000-00000000000c');  -- NBW staff
insert into public.staff (user_id) values ('00000000-0000-0000-0000-00000000000c');

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as
$$ begin if not ok then raise exception 'FAILED: %', what; end if; raise notice 'ok: %', what; end $$;

-- ---------- owner A sets up ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.businesses (name) values ('A Pools');
insert into public.employees (business_id, full_name) values (public.my_business_id(), 'Ana');
select pg_temp.expect((select count(*) from public.courses) = 2, 'owner sees both courses');
select pg_temp.expect((select count(*) from public.course_questions where course_id = 'heat') = 4, 'owner sees heat questions');

do $$ begin
  perform 1 from private.course_answers;
  raise exception 'FAILED: answer key readable';
exception when insufficient_privilege then raise notice 'ok: answer key not readable';
end $$;

do $$ begin
  insert into public.businesses (name) values ('Second business');
  raise exception 'FAILED: second business allowed';
exception when unique_violation then raise notice 'ok: one business per owner';
end $$;

-- wrong answers record nothing
select pg_temp.expect(
  (public.submit_check((select id from public.employees where full_name = 'Ana'), 'heat', array[0,0,0,0], 'Ana Signed') ->> 'wrong')::int = 3,
  'wrong answers counted on server');
select pg_temp.expect((select count(*) from public.attestations) = 0, 'failed check records nothing');

do $$ begin
  perform public.submit_check((select id from public.employees where full_name = 'Ana'), 'heat', array[1,0], 'Ana Signed');
  raise exception 'FAILED: short answer list accepted';
exception when invalid_parameter_value then raise notice 'ok: short answer list rejected';
end $$;

do $$ begin
  perform public.submit_check((select id from public.employees where full_name = 'Ana'), 'heat', array[1,0,1,1], '   ');
  raise exception 'FAILED: unsigned check accepted';
exception when invalid_parameter_value then raise notice 'ok: checks must be signed';
end $$;

-- right answers record one attestation, dated with a due date 12 months out
select pg_temp.expect(
  (public.submit_check((select id from public.employees where full_name = 'Ana'), 'heat', array[1,0,1,1], 'Ana Signed') ->> 'passed')::boolean,
  'correct answers pass');
select pg_temp.expect((select count(*) from public.attestations) = 1, 'pass records one attestation');
select pg_temp.expect((select completed_on from public.attestations) = public.nv_today(), 'dated with Nevada date');
select pg_temp.expect((select signed_name from public.attestations) = 'Ana Signed', 'signature stored with the record');

do $$ begin
  insert into public.attestations (employee_id, course_id, completed_on, recorded_by)
  select id, 'heat', '2026-01-01', auth.uid() from public.employees;
  raise exception 'FAILED: direct attestation insert allowed';
exception when insufficient_privilege then raise notice 'ok: attestations only via submit_check';
end $$;

do $$ begin
  delete from public.attestations;
  raise exception 'FAILED: attestation delete allowed';
exception when insufficient_privilege then raise notice 'ok: attestations cannot be deleted';
end $$;

do $$ begin
  delete from public.employees;
  raise exception 'FAILED: employee delete allowed';
exception when insufficient_privilege then raise notice 'ok: employees can only be archived';
end $$;

-- files: path must sit in the business folder
insert into storage.objects (bucket_id, name) values ('client-files', public.my_business_id() || '/training/x/roster.pdf');
insert into public.training_files (business_id, course_id, storage_path, file_name, size_bytes)
values (public.my_business_id(), 'heat', public.my_business_id() || '/training/x/roster.pdf', 'roster.pdf', 100);

do $$ begin
  insert into public.training_files (business_id, course_id, storage_path, file_name, size_bytes)
  values (public.my_business_id(), 'heat', 'someone-else/roster.pdf', 'roster.pdf', 100);
  raise exception 'FAILED: file row outside own folder allowed';
exception when insufficient_privilege then raise notice 'ok: file row must use own folder';
end $$;

-- ---------- owner B tries to reach A's data ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into public.businesses (name) values ('B Landscaping');
select pg_temp.expect((select count(*) from public.businesses) = 1, 'B sees only own business');
select pg_temp.expect((select count(*) from public.employees) = 0, 'B cannot see A employees');
select pg_temp.expect((select count(*) from public.attestations) = 0, 'B cannot see A attestations');
select pg_temp.expect((select count(*) from public.training_files) = 0, 'B cannot see A file rows');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'B cannot see A stored files');

do $$ declare n int; begin
  update public.employees set active = false;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: B archived A employee'; end if;
  update public.businesses set name = 'hacked' where name = 'A Pools';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: B renamed A business'; end if;
  raise notice 'ok: B cannot change A rows';
end $$;

do $$ begin
  insert into public.employees (business_id, full_name)
  select id, 'Mallory' from public.businesses where false
  union all select '00000000-0000-0000-0000-000000000000'::uuid, 'Mallory';
  raise exception 'FAILED: B added employee to another business';
exception when insufficient_privilege or foreign_key_violation then raise notice 'ok: B cannot add employees elsewhere';
end $$;

reset role;
do $$ declare ana uuid; a_biz uuid; begin
  select id, business_id into ana, a_biz from public.employees where full_name = 'Ana';
  perform set_config('ana.id', ana::text, false);
  perform set_config('a.biz', a_biz::text, false);
end $$;
set role authenticated;

do $$ begin
  perform public.submit_check(current_setting('ana.id')::uuid, 'heat', array[1,0,1,1], 'Ana Signed');
  raise exception 'FAILED: B recorded a check for A employee';
exception when insufficient_privilege then raise notice 'ok: B cannot record checks for A employees';
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('client-files', current_setting('a.biz') || '/training/x/evil.pdf');
  raise exception 'FAILED: B uploaded into A folder';
exception when insufficient_privilege then raise notice 'ok: B cannot upload into A folder';
end $$;

do $$ begin
  insert into public.training_files (business_id, course_id, storage_path, file_name, size_bytes)
  values (current_setting('a.biz')::uuid, 'heat', current_setting('a.biz') || '/training/x/evil.pdf', 'evil.pdf', 1);
  raise exception 'FAILED: B added file row to A';
exception when insufficient_privilege then raise notice 'ok: B cannot add file rows to A';
end $$;

-- B's own employee with A's... employee id on B's file row is rejected
do $$ begin
  insert into public.training_files (business_id, employee_id, course_id, storage_path, file_name, size_bytes)
  values (public.my_business_id(), current_setting('ana.id')::uuid, 'heat', public.my_business_id() || '/training/x/f.pdf', 'f.pdf', 1);
  raise exception 'FAILED: B linked file to A employee';
exception when insufficient_privilege then raise notice 'ok: B cannot link files to A employees';
end $$;

-- ---------- documents: owner A ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect(not public.is_staff(), 'owner is not staff');

do $$ begin
  insert into public.documents (business_id, type_id, status) values (public.my_business_id(), 'nscb_license', 'current');
  raise exception 'FAILED: owner inserted a document directly';
exception when insufficient_privilege then raise notice 'ok: owners cannot create documents directly';
end $$;

insert into storage.objects (bucket_id, name) values ('client-files', public.my_business_id() || '/docs/u1/license.pdf');
select public.submit_document(null, 'nscb_license', ' C-15 ', '2027-09-27',
  public.my_business_id() || '/docs/u1/license.pdf', 'license.pdf', 2000);
select pg_temp.expect((select status from public.documents) = 'under_review', 'owner upload goes under review');
select pg_temp.expect((select label from public.documents) = 'C-15', 'label trimmed');
select pg_temp.expect((select count(*) from public.document_files) = 1, 'document file recorded');

do $$ begin
  perform public.submit_document(null, 'nscb_license', null, null, public.my_business_id() || '/training/x.pdf', 'x.pdf', 1);
  raise exception 'FAILED: document stored outside docs folder';
exception when insufficient_privilege then raise notice 'ok: document files must be in docs folder';
end $$;

do $$ declare n int; begin
  update public.documents set status = 'current';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: owner approved own document'; end if;
  raise notice 'ok: owners cannot mark documents current';
end $$;

do $$ declare n int; begin
  delete from storage.objects where name like '%/docs/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: owner deleted a document file'; end if;
  raise notice 'ok: owners cannot delete document files';
end $$;

do $$ begin
  insert into public.updates (business_id, body) values (public.my_business_id(), 'fake update');
  raise exception 'FAILED: owner posted an update';
exception when insufficient_privilege then raise notice 'ok: owners cannot post updates';
end $$;

do $$ begin
  perform 1 from public.staff;
  raise exception 'FAILED: staff list readable';
exception when insufficient_privilege then raise notice 'ok: staff list not readable';
end $$;

-- ---------- documents: owner B ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect((select count(*) from public.documents) = 0, 'B cannot see A documents');
select pg_temp.expect((select count(*) from public.document_files) = 0, 'B cannot see A document files');

reset role;
select set_config('a.doc', (select id::text from public.documents limit 1), false);
set role authenticated;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('client-files', public.my_business_id() || '/docs/u2/x.pdf');
  perform public.submit_document(current_setting('a.doc')::uuid, null, null, null, public.my_business_id() || '/docs/u2/x.pdf', 'x.pdf', 1);
  raise exception 'FAILED: B attached a file to A document';
exception when insufficient_privilege then raise notice 'ok: B cannot attach files to A documents';
end $$;

-- ---------- NBW staff ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect(public.is_staff(), 'staff recognized');
select pg_temp.expect((select count(*) from public.businesses) = 2, 'staff sees every business');
select pg_temp.expect((select count(*) from public.employees) >= 1, 'staff sees employees');
select pg_temp.expect((select count(*) from public.attestations) >= 1, 'staff sees training records');
select pg_temp.expect((select count(*) from storage.objects where name like '%/docs/%') >= 1, 'staff can open client files');

update public.documents set status = 'current', expires_on = '2027-09-27', note = null where id = current_setting('a.doc')::uuid;
select pg_temp.expect((select status from public.documents where id = current_setting('a.doc')::uuid) = 'current', 'staff marks document current');
select pg_temp.expect((select reviewed_by from public.documents where id = current_setting('a.doc')::uuid) = '00000000-0000-0000-0000-00000000000c'
  and (select reviewed_at from public.documents where id = current_setting('a.doc')::uuid) is not null, 'review stamped with staff and time');
select pg_temp.expect((select count(*) from public.orphan_files()) = 0, 'no orphaned files yet');

insert into public.documents (business_id, type_id, status, note)
select id, 'heat_plan', 'requested', 'Requested by NBW.' from public.businesses where name = 'B Landscaping';
insert into public.updates (business_id, body) select id, 'Got your license.' from public.businesses where name = 'A Pools';

do $$ begin
  insert into public.updates (business_id, author_id, body)
  select id, '00000000-0000-0000-0000-00000000000a', 'spoofed' from public.businesses limit 1;
  raise exception 'FAILED: staff posted as someone else';
exception when insufficient_privilege then raise notice 'ok: updates carry the real author';
end $$;

do $$ begin
  insert into public.employees (business_id, full_name) select id, 'Staff added' from public.businesses limit 1;
  raise exception 'FAILED: staff edited a client crew';
exception when insufficient_privilege then raise notice 'ok: staff cannot change client crews';
end $$;

-- ---------- owners see staff work ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect((select count(*) from public.updates) = 1, 'A sees its update');
select pg_temp.expect((select status from public.documents) = 'current', 'A sees reviewed document');
select pg_temp.expect((select count(*) from public.orphan_files()) = 0, 'owners cannot list files');
insert into storage.objects (bucket_id, name) values ('client-files', public.my_business_id() || '/docs/u9/renewal.pdf');
select public.submit_document(current_setting('a.doc')::uuid, null, null, '2028-09-27', public.my_business_id() || '/docs/u9/renewal.pdf', 'renewal.pdf', 3000);
select pg_temp.expect((select reviewed_by from public.documents where id = current_setting('a.doc')::uuid) is null, 'new upload clears the old review stamp');
-- an upload whose record never got created
insert into storage.objects (bucket_id, name) values ('client-files', public.my_business_id() || '/docs/u10/stray.pdf');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect((select count(*) from public.updates) = 0, 'B cannot see A updates');
select pg_temp.expect((select count(*) from public.documents where status = 'requested') = 1, 'B sees request from NBW');

-- ---------- orders ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect((select count(*) from public.packages) = 6, 'owners see the packages');

select set_config('a.order', public.order_package('heat_plan', '  Two crews, one site  ')::text, false);
select pg_temp.expect((select price_cents from public.orders where id = current_setting('a.order')::uuid) = 102000, 'order uses the client price from the server');
select pg_temp.expect((select deposit_cents from public.orders where id = current_setting('a.order')::uuid) = 51000, 'done-for-you deposit is half');
select pg_temp.expect((select notes from public.orders where id = current_setting('a.order')::uuid) = 'Two crews, one site', 'order notes trimmed');
select set_config('a.kit', public.order_package('diy_kit', null)::text, false);
select pg_temp.expect((select deposit_cents from public.orders where id = current_setting('a.kit')::uuid) = 16900, 'kits are paid in full');

do $$ begin
  insert into public.orders (business_id, package_id, price_cents, deposit_cents, created_by)
  values (public.my_business_id(), 'full_program', 1, 1, auth.uid());
  raise exception 'FAILED: owner inserted an order with their own price';
exception when insufficient_privilege then raise notice 'ok: owners cannot set their own price';
end $$;

do $$ declare n int; begin
  update public.orders set status = 'confirmed', price_cents = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: owner changed an order'; end if;
  raise notice 'ok: owners cannot confirm or reprice orders';
end $$;

do $$ begin
  perform public.order_package('no_such_package', null);
  raise exception 'FAILED: unknown package ordered';
exception when invalid_parameter_value then raise notice 'ok: unknown packages rejected';
end $$;

-- a crew over the Heat Plan's 25 gets a quote instead of a price
reset role;
insert into public.employees (business_id, full_name)
select b.id, 'Worker ' || g from public.businesses b, generate_series(1, 26) g where b.name = 'A Pools';
set role authenticated;
select set_config('a.quote', public.order_package('heat_plan', null)::text, false);
select pg_temp.expect((select price_cents from public.orders where id = current_setting('a.quote')::uuid) is null, 'big crews get a quote, not a price');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect((select count(*) from public.orders) = 0, 'B cannot see A orders');
do $$ begin
  perform public.cancel_order(current_setting('a.order')::uuid);
  raise exception 'FAILED: B cancelled A order';
exception when insufficient_privilege then raise notice 'ok: B cannot cancel A orders';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect((select count(*) from public.orders) = 3, 'staff see every order');
update public.orders set status = 'confirmed', price_cents = 95000, deposit_cents = 47500, staff_note = 'Founding rate'
 where id = current_setting('a.order')::uuid;
select pg_temp.expect((select handled_by from public.orders where id = current_setting('a.order')::uuid) = '00000000-0000-0000-0000-00000000000c', 'order stamped with the staff member');
select pg_temp.expect((select count(*) from public.orphan_files() where name like '%/stray.pdf') = 1, 'staff can list orphaned files');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect((select status from public.orders where id = current_setting('a.order')::uuid) = 'confirmed', 'owner sees the confirmation');
do $$ begin
  perform public.cancel_order(current_setting('a.order')::uuid);
  raise exception 'FAILED: owner cancelled a confirmed order';
exception when insufficient_privilege then raise notice 'ok: confirmed orders cannot be cancelled in the app';
end $$;
select public.cancel_order(id) from public.orders where package_id = 'diy_kit';
select pg_temp.expect((select status from public.orders where package_id = 'diy_kit') = 'cancelled', 'owner can cancel an unconfirmed order');

-- ---------- upload cap ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect(public.can_upload(), 'uploads allowed under the cap');
reset role;
insert into storage.objects (bucket_id, name)
select 'client-files', b.id || '/training/bulk/' || g || '.pdf' from public.businesses b, generate_series(1, 300) g where b.name = 'B Landscaping';
set role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('client-files', public.my_business_id() || '/training/bulk/one-more.pdf');
  raise exception 'FAILED: upload over the cap allowed';
exception when insufficient_privilege then raise notice 'ok: uploads stop at the cap';
end $$;

-- ---------- logged-out visitor ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  perform 1 from public.employees;
  raise exception 'FAILED: anon read employees';
exception when insufficient_privilege then raise notice 'ok: anon cannot read employees';
end $$;
do $$ begin
  perform public.submit_check(gen_random_uuid(), 'heat', array[1,0,1,1], 'Ana Signed');
  raise exception 'FAILED: anon ran submit_check';
exception when insufficient_privilege then raise notice 'ok: anon cannot run submit_check';
end $$;

reset role;
\echo ALL RLS TESTS PASSED
