-- Test helpers shared by every *_test.sql (works on the stub and on real Supabase).
-- Test helpers -------------------------------------------------------------
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;
create or replace function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;
create or replace function tests.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ASSERTION FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
