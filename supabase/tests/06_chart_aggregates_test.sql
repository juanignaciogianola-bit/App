begin;
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-0000000000c1', 'c@test.dev'),
                                          ('dddddddd-0000-0000-0000-0000000000d1', 'd@test.dev');
select tests.login('cccccccc-0000-0000-0000-0000000000c1');

-- 23:30 in Montevideo (UTC-3) on Nov 9 is 02:30 UTC on Nov 10: it must count for Nov 9 locally.
select public.save_meal(null, '2026-11-10 02:30+00', 'dinner', 'Cena tarde', '[{"name":"Pizza","kcal":800,"protein_g":30,"carbs_g":90,"fat_g":30}]');
select public.save_meal(null, '2026-11-10 15:00+00', 'lunch', 'Almuerzo', '[{"name":"Ensalada","kcal":400,"protein_g":20,"carbs_g":30,"fat_g":20}]');

select tests.assert((select count(*) from public.nutrition_daily('2026-11-04', '2026-11-10', 'America/Montevideo')) = 7, '7 days returned, empty days included');
select tests.assert((select kcal from public.nutrition_daily('2026-11-04', '2026-11-10', 'America/Montevideo') where day = '2026-11-09') = 800, 'late dinner counts on the local day');
select tests.assert((select kcal from public.nutrition_daily('2026-11-04', '2026-11-10', 'America/Montevideo') where day = '2026-11-10') = 400, 'same-day lunch');
select tests.assert((select kcal from public.nutrition_daily('2026-11-04', '2026-11-10', 'UTC') where day = '2026-11-10') = 1200, 'in UTC both fall on Nov 10');

select public.finish_workout('A', null, now() - interval '1 day', now() - interval '23 hours',
  (select jsonb_agg(jsonb_build_object('exercise_id', id, 'exercise_position', 0, 'set_index', i, 'reps', 10, 'weight_kg', 50))
   from public.exercises, generate_series(0, 2) i where slug = 'bench_press'));
select tests.assert((select count(*) from public.training_weekly(8, 'UTC')) = 8, '8 weeks returned');
select tests.assert((select sum(sessions) = 1 and sum(sets) = 3 and sum(volume_kg) = 1500 from public.training_weekly(8, 'UTC')), 'week totals: 1 session, 3 sets, 1500 kg');

select tests.login('dddddddd-0000-0000-0000-0000000000d1');
select tests.assert((select sum(kcal) from public.nutrition_daily('2026-11-04', '2026-11-10', 'UTC')) = 0, 'other users see zeros');
select tests.assert((select sum(sets) from public.training_weekly(8, 'UTC')) = 0, 'other users see no training');
select tests.logout();
rollback;
