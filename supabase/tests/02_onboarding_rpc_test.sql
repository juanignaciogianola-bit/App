begin;
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'c@test.dev');

select tests.login('33333333-3333-3333-3333-333333333333');
select public.complete_onboarding('female', '2001-01-01', 165, 60, 'light', 'cut', 'intermediate', 1480, 120, 142, 48);
select tests.assert((select onboarded_at is not null and goal = 'cut' from public.profiles), 'RPC marks profile onboarded');
select tests.assert((select kcal from public.current_nutrition_targets) = 1480, 'RPC stores first target');

-- Invalid data rolls back both writes.
do $$ begin
  perform public.complete_onboarding('female', '2001-01-01', 999, 60, 'light', 'cut', 'intermediate', 1500, 120, 142, 48);
  raise exception 'should have failed';
exception when check_violation then
  raise notice 'ok - invalid height rejected';
end $$;
select tests.assert((select count(*) from public.nutrition_targets) = 1, 'failed RPC leaves no partial target');

select tests.logout();
set role anon;
do $$ begin
  perform public.complete_onboarding('male', '1990-01-01', 180, 80, 'light', 'cut', 'beginner', 2000, 160, 200, 64);
  raise exception 'should have failed';
exception when insufficient_privilege then
  raise notice 'ok - anon cannot call complete_onboarding';
end $$;
reset role;
rollback;
