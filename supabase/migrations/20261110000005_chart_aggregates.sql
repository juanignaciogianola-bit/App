-- Aggregates for charts, grouped by the user's local calendar (IANA time zone from the device).

-- Calories and macros per local day, including days with nothing logged.
create or replace function public.nutrition_daily(p_from date, p_to date, p_tz text)
returns table (day date, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric)
language sql stable security invoker set search_path = '' as $$
  with days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  totals as (
    select (m.eaten_at at time zone p_tz)::date as day,
           sum(i.kcal) as kcal, sum(i.protein_g) as protein_g, sum(i.carbs_g) as carbs_g, sum(i.fat_g) as fat_g
    from public.meals m
    join public.meal_items i on i.meal_id = m.id
    where m.user_id = (select auth.uid())
      and (m.eaten_at at time zone p_tz)::date between p_from and p_to
    group by 1
  )
  select d.day, coalesce(t.kcal, 0), coalesce(t.protein_g, 0), coalesce(t.carbs_g, 0), coalesce(t.fat_g, 0)
  from days d left join totals t using (day)
  order by d.day;
$$;

-- Sessions, sets and tonnage per local ISO week (Monday start), including empty weeks.
create or replace function public.training_weekly(p_weeks integer, p_tz text)
returns table (week_start date, sessions integer, sets integer, volume_kg numeric)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select date_trunc('week', (now() at time zone p_tz))::date as this_week
  ),
  weeks as (
    select generate_series(b.this_week - (least(greatest(p_weeks, 1), 52) - 1) * 7, b.this_week, interval '7 days')::date as week_start
    from bounds b
  ),
  per_workout as (
    select date_trunc('week', (w.started_at at time zone p_tz))::date as week_start,
           count(s.id) as sets, coalesce(sum(s.weight_kg * s.reps), 0) as volume_kg
    from public.workouts w
    left join public.workout_sets s on s.workout_id = w.id
    where w.user_id = (select auth.uid())
    group by w.id, 1
  )
  select wk.week_start,
         count(p.week_start)::integer,
         coalesce(sum(p.sets), 0)::integer,
         coalesce(sum(p.volume_kg), 0)
  from weeks wk left join per_workout p using (week_start)
  group by wk.week_start
  order by wk.week_start;
$$;

revoke execute on function public.nutrition_daily, public.training_weekly from public, anon;
grant execute on function public.nutrition_daily, public.training_weekly to authenticated;
