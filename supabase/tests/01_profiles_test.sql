-- Each test file runs in a transaction that is rolled back.
begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev');

select tests.assert((select count(*) from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')) = 2,
  'signup trigger creates a profile per user');

-- User A fills in onboarding.
select tests.login('11111111-1111-1111-1111-111111111111');
update public.profiles set sex = 'male', birth_date = '1996-01-15', height_cm = 180, weight_kg = 80,
  activity_level = 'moderate', goal = 'maintain', experience = 'beginner', onboarded_at = now()
  where id = auth.uid();
insert into public.nutrition_targets (user_id, kcal, protein_g, carbs_g, fat_g)
  values (auth.uid(), 2760, 160, 386, 64);

select tests.assert((select count(*) from public.profiles) = 1, 'A sees only their own profile');
select tests.assert((select kcal from public.current_nutrition_targets) = 2760, 'A reads current target');

-- A cannot touch B.
update public.profiles set goal = 'cut' where id = '22222222-2222-2222-2222-222222222222';
select tests.logout();
select tests.assert((select goal from public.profiles where id = '22222222-2222-2222-2222-222222222222') is null,
  'A cannot update B''s profile');

select tests.login('11111111-1111-1111-1111-111111111111');
do $$ begin
  insert into public.nutrition_targets (user_id, kcal, protein_g, carbs_g, fat_g)
    values ('22222222-2222-2222-2222-222222222222', 2000, 100, 200, 50);
  raise exception 'should have failed';
exception when insufficient_privilege then
  raise notice 'ok - A cannot insert targets for B';
end $$;

-- B sees nothing of A.
select tests.login('22222222-2222-2222-2222-222222222222');
select tests.assert((select count(*) from public.nutrition_targets) = 0, 'B cannot read A''s targets');
select tests.assert((select onboarded_at from public.profiles) is null, 'B is not onboarded yet');

-- Cannot mark onboarded with missing fields.
do $$ begin
  update public.profiles set onboarded_at = now() where id = auth.uid();
  raise exception 'should have failed';
exception when check_violation then
  raise notice 'ok - onboarding requires every field';
end $$;

-- Anonymous users see nothing.
select tests.logout();
set role anon;
select tests.assert((select count(*) from public.profiles) = 0, 'anon sees no profiles');
reset role;

-- Deleting the auth user wipes their data.
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select tests.assert(not exists (select 1 from public.nutrition_targets
  where user_id = '11111111-1111-1111-1111-111111111111'), 'account deletion cascades');

rollback;
