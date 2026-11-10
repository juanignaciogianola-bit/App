begin;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-0000000000f2', 'b@test.dev');

select tests.login('aaaaaaaa-0000-0000-0000-0000000000f1');
insert into public.physique_sessions (id, weight_kg, front_path, back_path, side_path) values
  ('5e550000-0000-0000-0000-000000000001', 80,
   'aaaaaaaa-0000-0000-0000-0000000000f1/5e550000-0000-0000-0000-000000000001/front.jpg',
   'aaaaaaaa-0000-0000-0000-0000000000f1/5e550000-0000-0000-0000-000000000001/back.jpg',
   'aaaaaaaa-0000-0000-0000-0000000000f1/5e550000-0000-0000-0000-000000000001/side.jpg');
select tests.assert((select count(*) from public.physique_sessions) = 1, 'A creates a session');

do $$ begin
  insert into public.physique_sessions (id, front_path) values
    ('5e550000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000f1/other-session/front.jpg');
  raise exception 'should have failed';
exception when check_violation then raise notice 'ok - photo paths must live in the session folder';
end $$;

do $$ begin
  insert into public.physique_analyses (session_id, user_id, summary)
    values ('5e550000-0000-0000-0000-000000000001', auth.uid(), 'fake');
  raise exception 'should have failed';
exception when insufficient_privilege then raise notice 'ok - users cannot write analyses directly';
end $$;

-- The edge function (service role) writes the analysis
select tests.logout();
insert into public.physique_analyses (id, session_id, user_id, summary, lagging, routine_suggestions) values
  ('a0a10000-0000-0000-0000-000000000001', '5e550000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000f1',
   'Buen desarrollo general', '[{"muscle_id":"side_delts","severity":"moderate","note":"hombros estrechos"}]',
   jsonb_build_array(
     jsonb_build_object('muscle_id','side_delts','exercise_id',(select id from public.exercises where slug='lateral_raise'),'exercise_name','Elevaciones laterales','sets',4,'rep_min',12,'rep_max',20,'reason','x'),
     jsonb_build_object('muscle_id','side_delts','exercise_id',(select id from public.exercises where slug='cable_lateral_raise'),'exercise_name','Elevaciones laterales en polea','sets',3,'rep_min',12,'rep_max',15,'reason','y'),
     jsonb_build_object('muscle_id','calves','exercise_id',(select id from public.exercises where slug='standing_calf_raise'),'exercise_name','Gemelos','sets',99,'rep_min',10,'rep_max',5,'reason','z')));

select tests.login('aaaaaaaa-0000-0000-0000-0000000000f1');
insert into public.routines (id, name) values ('70070000-0000-0000-0000-000000000001', 'Push');
insert into public.routine_exercises (routine_id, exercise_id, position)
  select '70070000-0000-0000-0000-000000000001', id, 0 from public.exercises where slug = 'lateral_raise';

select tests.assert(public.add_suggestions_to_routine('a0a10000-0000-0000-0000-000000000001', '70070000-0000-0000-0000-000000000001', array[0, 1, 2, 7]) = 2,
  'adds new suggestions, skips duplicates and bad indexes');
select tests.assert((select count(*) from public.routine_exercises where source = 'ai_suggestion' and analysis_id = 'a0a10000-0000-0000-0000-000000000001') = 2,
  'suggestions are tagged with their analysis');
select tests.assert((select target_sets = 10 and rep_max >= rep_min from public.routine_exercises re join public.exercises e on e.id = re.exercise_id where e.slug = 'standing_calf_raise'),
  'suggested sets/reps are clamped to valid ranges');
select tests.assert((select string_agg(e.slug, ',' order by re.position) from public.routine_exercises re join public.exercises e on e.id = re.exercise_id
  where re.routine_id = '70070000-0000-0000-0000-000000000001') = 'lateral_raise,cable_lateral_raise,standing_calf_raise', 'appended at the end');

-- B cannot see or use A's analysis
select tests.login('bbbbbbbb-0000-0000-0000-0000000000f2');
select tests.assert((select count(*) from public.physique_sessions) = 0, 'B cannot see A''s sessions');
select tests.assert((select count(*) from public.physique_analyses) = 0, 'B cannot see A''s analyses');
insert into public.routines (id, name) values ('70070000-0000-0000-0000-000000000002', 'B');
do $$ begin
  perform public.add_suggestions_to_routine('a0a10000-0000-0000-0000-000000000001', '70070000-0000-0000-0000-000000000002', array[0]);
  raise exception 'should have failed';
exception when no_data_found then raise notice 'ok - B cannot apply A''s analysis';
end $$;
do $$ begin
  perform public.add_suggestions_to_routine(
    (select id from public.physique_analyses limit 1), '70070000-0000-0000-0000-000000000001', array[0]);
exception when others then null;
end $$;
select tests.assert((select count(*) from public.routine_exercises) = 0, 'B cannot add to A''s routine');

-- Deleting the session deletes the analysis, the routine exercises keep existing but unlinked
select tests.login('aaaaaaaa-0000-0000-0000-0000000000f1');
delete from public.physique_sessions where id = '5e550000-0000-0000-0000-000000000001';
select tests.assert((select count(*) from public.physique_analyses) = 0, 'session delete cascades to its analysis');
select tests.assert((select count(*) from public.routine_exercises where source = 'ai_suggestion' and analysis_id is null) = 2,
  'added exercises stay in the routine after the analysis is deleted');
select tests.logout();
rollback;
