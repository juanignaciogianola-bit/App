begin;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'b@test.dev');

select tests.login('aaaaaaaa-0000-0000-0000-0000000000a1');
select public.save_meal(null, '2026-11-10 13:00+00', 'lunch', 'Milanesa con puré',
  '[{"name":"Milanesa","grams":180,"kcal":450,"protein_g":35,"carbs_g":20,"fat_g":25},
    {"name":"Puré","grams":200,"kcal":220,"protein_g":4,"carbs_g":30,"fat_g":9,"edited":true}]'::jsonb,
  'aaaaaaaa-0000-0000-0000-0000000000a1/m1.jpg', 'photo', '{"items":[]}'::jsonb, 'claude-opus-5-5');
select public.save_meal(null, '2026-11-10 20:00+00', 'dinner', 'Yogur',
  '[{"name":"Yogur","kcal":100,"protein_g":10,"carbs_g":8,"fat_g":3}]'::jsonb);

select tests.assert((select kcal from public.nutrition_totals('2026-11-10', '2026-11-11')) = 770, 'daily kcal = 450 + 220 + 100');
select tests.assert((select protein_g from public.nutrition_totals('2026-11-10', '2026-11-11')) = 49, 'daily protein summed');
select tests.assert((select meals from public.nutrition_totals('2026-11-10', '2026-11-11')) = 2, 'meal count');
select tests.assert((select kcal from public.nutrition_totals('2026-11-11', '2026-11-12')) = 0, 'empty day is zero');
select tests.assert((select string_agg(name, ',' order by position) from public.meal_items
  where meal_id = (select id from public.meals where name = 'Milanesa con puré')) = 'Milanesa,Puré', 'item order kept');

-- Editing replaces items atomically
select public.save_meal((select id from public.meals where name = 'Yogur'), '2026-11-10 20:00+00', 'snack', 'Yogur grande',
  '[{"name":"Yogur","kcal":150,"protein_g":15,"carbs_g":12,"fat_g":4}]'::jsonb);
select tests.assert((select kcal from public.nutrition_totals('2026-11-10', '2026-11-11')) = 820, 'edit replaces items');

do $$ begin
  perform public.save_meal(null, now(), 'lunch', 'x', '[]'::jsonb);
  raise exception 'should have failed';
exception when invalid_parameter_value then raise notice 'ok - meals need items';
end $$;

do $$ begin
  perform public.save_meal(null, now(), 'lunch', 'x', '[{"name":"x","kcal":1}]'::jsonb,
    'bbbbbbbb-0000-0000-0000-0000000000b2/stolen.jpg', 'photo');
  raise exception 'should have failed';
exception when check_violation then raise notice 'ok - photo path must be in the owner''s folder';
end $$;

select set_config('tests.meal_a', (select id::text from public.meals where name = 'Yogur grande'), false);

-- B is isolated
select tests.login('bbbbbbbb-0000-0000-0000-0000000000b2');
select tests.assert((select count(*) from public.meals) = 0, 'B cannot see A''s meals');
select tests.assert((select kcal from public.nutrition_totals('2026-11-10', '2026-11-11')) = 0, 'B totals exclude A');
do $$ begin
  perform public.save_meal(current_setting('tests.meal_a')::uuid, now(), 'lunch', 'hack', '[{"name":"x","kcal":1}]'::jsonb);
  raise exception 'should have failed';
exception when no_data_found then raise notice 'ok - B cannot edit A''s meal';
end $$;
do $$ begin
  insert into public.ai_requests (user_id, kind, ok) values (auth.uid(), 'meal', true);
  raise exception 'should have failed';
exception when insufficient_privilege then raise notice 'ok - users cannot write the AI usage log';
end $$;

-- Storage policies: folder must match the user id
select tests.assert(not exists (select 1 from pg_policies where tablename = 'objects' and policyname like 'meal photos%' and roles <> '{authenticated}'),
  'storage policies apply to authenticated only');
select tests.logout();
rollback;
