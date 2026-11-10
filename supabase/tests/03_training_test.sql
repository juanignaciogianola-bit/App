begin;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.dev');

select tests.assert((select count(*) from public.muscle_groups) = 18, '18 muscle groups seeded');
select tests.assert((select count(*) from public.exercises where owner_id is null) >= 70, 'global catalog seeded');
select tests.assert(not exists (
  select 1 from public.exercises e where not exists (
    select 1 from public.exercise_muscles m where m.exercise_id = e.id and m.role = 'primary')),
  'every catalog exercise has a primary muscle');

-- A builds a routine with a custom exercise ------------------------------------
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.exercises (id, name, equipment, owner_id)
  values ('eeeeeeee-0000-0000-0000-00000000000a', 'Mi press raro', 'machine', auth.uid());
insert into public.exercise_muscles values ('eeeeeeee-0000-0000-0000-00000000000a', 'chest', 'primary');

insert into public.routines (id, name) values ('11111111-aaaa-0000-0000-000000000001', 'Push');
insert into public.routine_exercises (routine_id, exercise_id, position)
  select '11111111-aaaa-0000-0000-000000000001', id, 0 from public.exercises where slug = 'bench_press';
insert into public.routine_exercises (routine_id, exercise_id, position)
  values ('11111111-aaaa-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000a', 1);
select tests.assert((select count(*) from public.routine_exercises) = 2, 'A adds catalog + custom exercise to routine');

do $$ begin
  update public.exercises set name = 'hack' where slug = 'bench_press';
  if found then raise exception 'A edited a global exercise'; end if;
  raise notice 'ok - global catalog is read-only';
end $$;

-- A logs a workout: 3 sets bench, 2 sets custom ---------------------------------
select public.finish_workout('Push', '11111111-aaaa-0000-0000-000000000001',
  '2026-11-09 18:00+00', '2026-11-09 19:00+00',
  (select jsonb_agg(s) from (
     select id as exercise_id, 0 as exercise_position, i as set_index, 8 as reps, 100 as weight_kg
       from public.exercises, generate_series(0, 2) i where slug = 'bench_press'
     union all
     select 'eeeeeeee-0000-0000-0000-00000000000a', 1, i, 10, 50 from generate_series(0, 1) i
  ) s));

select tests.assert((select count(*) from public.workout_sets) = 5, 'finish_workout stores all sets');

-- Bench: chest primary (3) + front_delts/triceps secondary (1.5); custom: chest primary (2)
select tests.assert((select sets from public.muscle_volume('2026-11-09', '2026-11-16') where muscle_id = 'chest') = 5,
  'chest volume = 3 bench + 2 custom');
select tests.assert((select sets from public.muscle_volume('2026-11-09', '2026-11-16') where muscle_id = 'triceps') = 1.5,
  'secondary muscles count half');
select tests.assert(not exists (select 1 from public.muscle_volume('2026-11-16', '2026-11-23')),
  'volume window excludes other weeks');

-- 100 kg × 8 → Epley 126.7
select tests.assert((select best_e1rm_kg from public.exercise_progress((select id from public.exercises where slug = 'bench_press'))) = 126.7,
  'exercise_progress computes Epley e1RM');

do $$ begin
  perform public.finish_workout('x', null, now(), now(), '[]'::jsonb);
  raise exception 'should have failed';
exception when invalid_parameter_value then raise notice 'ok - empty workouts are rejected';
end $$;

-- B is isolated from A ------------------------------------------------------------
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');
select tests.assert((select count(*) from public.routines) = 0, 'B cannot see A''s routines');
select tests.assert((select count(*) from public.workout_sets) = 0, 'B cannot see A''s sets');
select tests.assert(not exists (select 1 from public.exercises where owner_id is not null), 'B cannot see A''s custom exercise');
select tests.assert(not exists (select 1 from public.muscle_volume('2026-11-09', '2026-11-16')), 'B has no volume');

do $$ begin
  insert into public.routine_exercises (routine_id, exercise_id)
    select '11111111-aaaa-0000-0000-000000000001', id from public.exercises where slug = 'bench_press';
  raise exception 'should have failed';
exception when insufficient_privilege then raise notice 'ok - B cannot add to A''s routine';
end $$;

insert into public.routines (id, name) values ('22222222-bbbb-0000-0000-000000000002', 'B day');
do $$ begin
  insert into public.routine_exercises (routine_id, exercise_id)
    values ('22222222-bbbb-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-00000000000a');
  raise exception 'should have failed';
exception when insufficient_privilege then raise notice 'ok - B cannot use A''s custom exercise';
end $$;

do $$ begin
  perform public.finish_workout('steal', '11111111-aaaa-0000-0000-000000000001', now() - interval '1 hour', now(),
    (select jsonb_agg(jsonb_build_object('exercise_id', id, 'exercise_position', 0, 'set_index', 0, 'reps', 5, 'weight_kg', 10))
       from public.exercises where slug = 'bench_press'));
  raise exception 'should have failed';
exception when insufficient_privilege then raise notice 'ok - B cannot log a workout against A''s routine';
end $$;

-- Deleting a routine keeps its workouts (history) -----------------------------
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
delete from public.routines where id = '11111111-aaaa-0000-0000-000000000001';
select tests.assert((select count(*) from public.workouts where routine_id is null) = 1, 'history survives routine deletion');

rollback;
