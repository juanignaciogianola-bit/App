-- Stage 2: training tracker.

-- Reference data ---------------------------------------------------------------
create table public.muscle_groups (
  id       text primary key,
  name     text not null,
  region   text not null check (region in ('front', 'back')),
  position smallint not null
);

insert into public.muscle_groups (id, name, region, position) values
  ('chest',       'Pecho',             'front', 1),
  ('front_delts', 'Deltoide anterior', 'front', 2),
  ('side_delts',  'Deltoide lateral',  'front', 3),
  ('biceps',      'Bíceps',            'front', 4),
  ('forearms',    'Antebrazos',        'front', 5),
  ('abs',         'Abdominales',       'front', 6),
  ('obliques',    'Oblicuos',          'front', 7),
  ('quads',       'Cuádriceps',        'front', 8),
  ('adductors',   'Aductores',         'front', 9),
  ('traps',       'Trapecios',         'back', 10),
  ('rear_delts',  'Deltoide posterior','back', 11),
  ('triceps',     'Tríceps',           'back', 12),
  ('lats',        'Dorsales',          'back', 13),
  ('upper_back',  'Espalda alta',      'back', 14),
  ('lower_back',  'Lumbares',          'back', 15),
  ('glutes',      'Glúteos',           'back', 16),
  ('hamstrings',  'Isquiotibiales',    'back', 17),
  ('calves',      'Gemelos',           'back', 18);

create table public.exercises (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique,
  name       text not null check (length(trim(name)) between 2 and 80),
  equipment  text not null default 'other'
             check (equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other')),
  -- null = global catalog, otherwise a user's custom exercise
  owner_id   uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index exercises_owner on public.exercises (owner_id);

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_id   text not null references public.muscle_groups (id),
  role        text not null check (role in ('primary', 'secondary')),
  primary key (exercise_id, muscle_id)
);
create index exercise_muscles_muscle on public.exercise_muscles (muscle_id, role);

-- Global catalog: (slug, name, equipment, primary muscles, secondary muscles)
with seed(slug, name, equipment, prim, sec) as (values
  ('bench_press',            'Press banca',                       'barbell',   '{chest}'::text[],              '{front_delts,triceps}'::text[]),
  ('incline_bench_press',    'Press banca inclinado',             'barbell',   '{chest,front_delts}',          '{triceps}'),
  ('db_bench_press',         'Press con mancuernas',              'dumbbell',  '{chest}',                      '{front_delts,triceps}'),
  ('incline_db_press',       'Press inclinado con mancuernas',    'dumbbell',  '{chest,front_delts}',          '{triceps}'),
  ('decline_bench_press',    'Press banca declinado',             'barbell',   '{chest}',                      '{triceps}'),
  ('machine_chest_press',    'Press de pecho en máquina',         'machine',   '{chest}',                      '{front_delts,triceps}'),
  ('cable_fly',              'Aperturas en polea',                'cable',     '{chest}',                      '{front_delts}'),
  ('db_fly',                 'Aperturas con mancuernas',          'dumbbell',  '{chest}',                      '{front_delts}'),
  ('pec_deck',               'Pec deck',                          'machine',   '{chest}',                      '{}'),
  ('push_up',                'Flexiones',                         'bodyweight','{chest}',                      '{front_delts,triceps,abs}'),
  ('dips',                   'Fondos en paralelas',               'bodyweight','{chest,triceps}',              '{front_delts}'),
  ('overhead_press',         'Press militar',                     'barbell',   '{front_delts}',                '{side_delts,triceps,traps}'),
  ('db_shoulder_press',      'Press de hombros con mancuernas',   'dumbbell',  '{front_delts}',                '{side_delts,triceps}'),
  ('machine_shoulder_press', 'Press de hombros en máquina',       'machine',   '{front_delts}',                '{side_delts,triceps}'),
  ('lateral_raise',          'Elevaciones laterales',             'dumbbell',  '{side_delts}',                 '{traps}'),
  ('cable_lateral_raise',    'Elevaciones laterales en polea',    'cable',     '{side_delts}',                 '{}'),
  ('front_raise',            'Elevaciones frontales',             'dumbbell',  '{front_delts}',                '{}'),
  ('reverse_fly',            'Pájaros',                           'dumbbell',  '{rear_delts}',                 '{upper_back}'),
  ('reverse_pec_deck',       'Pec deck invertido',                'machine',   '{rear_delts}',                 '{upper_back}'),
  ('face_pull',              'Face pull',                         'cable',     '{rear_delts}',                 '{upper_back,traps}'),
  ('upright_row',            'Remo al mentón',                    'barbell',   '{side_delts,traps}',           '{biceps}'),
  ('shrug',                  'Encogimientos',                     'dumbbell',  '{traps}',                      '{forearms}'),
  ('pull_up',                'Dominadas',                         'bodyweight','{lats}',                       '{biceps,upper_back,rear_delts}'),
  ('chin_up',                'Dominadas supinas',                 'bodyweight','{lats,biceps}',                '{upper_back}'),
  ('lat_pulldown',           'Jalón al pecho',                    'cable',     '{lats}',                       '{biceps,upper_back}'),
  ('straight_arm_pulldown',  'Pullover en polea',                 'cable',     '{lats}',                       '{triceps}'),
  ('barbell_row',            'Remo con barra',                    'barbell',   '{upper_back,lats}',            '{biceps,rear_delts,lower_back}'),
  ('db_row',                 'Remo con mancuerna',                'dumbbell',  '{lats,upper_back}',            '{biceps,rear_delts}'),
  ('seated_cable_row',       'Remo sentado en polea',             'cable',     '{upper_back,lats}',            '{biceps,rear_delts}'),
  ('chest_supported_row',    'Remo con apoyo en pecho',           'machine',   '{upper_back}',                 '{lats,rear_delts,biceps}'),
  ('t_bar_row',              'Remo en T',                         'barbell',   '{upper_back,lats}',            '{biceps,lower_back}'),
  ('deadlift',               'Peso muerto',                       'barbell',   '{glutes,hamstrings,lower_back}','{traps,forearms,quads,upper_back}'),
  ('romanian_deadlift',      'Peso muerto rumano',                'barbell',   '{hamstrings,glutes}',          '{lower_back,forearms}'),
  ('back_extension',         'Hiperextensiones',                  'bodyweight','{lower_back,glutes}',          '{hamstrings}'),
  ('good_morning',           'Buenos días',                       'barbell',   '{hamstrings,lower_back}',      '{glutes}'),
  ('barbell_curl',           'Curl con barra',                    'barbell',   '{biceps}',                     '{forearms}'),
  ('db_curl',                'Curl con mancuernas',               'dumbbell',  '{biceps}',                     '{forearms}'),
  ('hammer_curl',            'Curl martillo',                     'dumbbell',  '{biceps,forearms}',            '{}'),
  ('incline_db_curl',        'Curl inclinado',                    'dumbbell',  '{biceps}',                     '{}'),
  ('preacher_curl',          'Curl predicador',                   'machine',   '{biceps}',                     '{}'),
  ('cable_curl',             'Curl en polea',                     'cable',     '{biceps}',                     '{forearms}'),
  ('triceps_pushdown',       'Extensión de tríceps en polea',     'cable',     '{triceps}',                    '{}'),
  ('overhead_triceps_ext',   'Extensión de tríceps sobre la cabeza','cable',   '{triceps}',                    '{}'),
  ('skull_crusher',          'Press francés',                     'barbell',   '{triceps}',                    '{}'),
  ('close_grip_bench',       'Press banca agarre cerrado',        'barbell',   '{triceps}',                    '{chest,front_delts}'),
  ('wrist_curl',             'Curl de muñeca',                    'dumbbell',  '{forearms}',                   '{}'),
  ('farmer_walk',            'Paseo del granjero',                'dumbbell',  '{forearms,traps}',             '{abs,obliques}'),
  ('back_squat',             'Sentadilla',                        'barbell',   '{quads,glutes}',               '{adductors,lower_back}'),
  ('front_squat',            'Sentadilla frontal',                'barbell',   '{quads}',                      '{glutes,upper_back,abs}'),
  ('goblet_squat',           'Sentadilla goblet',                 'dumbbell',  '{quads,glutes}',               '{adductors,abs}'),
  ('hack_squat',             'Hack squat',                        'machine',   '{quads}',                      '{glutes}'),
  ('leg_press',              'Prensa',                            'machine',   '{quads,glutes}',               '{adductors}'),
  ('bulgarian_split_squat',  'Sentadilla búlgara',                'dumbbell',  '{quads,glutes}',               '{adductors}'),
  ('lunge',                  'Zancadas',                          'dumbbell',  '{quads,glutes}',               '{adductors,hamstrings}'),
  ('leg_extension',          'Extensión de cuádriceps',           'machine',   '{quads}',                      '{}'),
  ('leg_curl',               'Curl femoral',                      'machine',   '{hamstrings}',                 '{calves}'),
  ('seated_leg_curl',        'Curl femoral sentado',              'machine',   '{hamstrings}',                 '{}'),
  ('nordic_curl',            'Curl nórdico',                      'bodyweight','{hamstrings}',                 '{}'),
  ('hip_thrust',             'Hip thrust',                        'barbell',   '{glutes}',                     '{hamstrings,quads}'),
  ('glute_bridge',           'Puente de glúteos',                 'bodyweight','{glutes}',                     '{hamstrings}'),
  ('cable_kickback',         'Patada de glúteo en polea',         'cable',     '{glutes}',                     '{hamstrings}'),
  ('hip_adduction',          'Aductores en máquina',              'machine',   '{adductors}',                  '{}'),
  ('hip_abduction',          'Abductores en máquina',             'machine',   '{glutes}',                     '{}'),
  ('standing_calf_raise',    'Elevación de talones de pie',       'machine',   '{calves}',                     '{}'),
  ('seated_calf_raise',      'Elevación de talones sentado',      'machine',   '{calves}',                     '{}'),
  ('crunch',                 'Crunch',                            'bodyweight','{abs}',                        '{}'),
  ('cable_crunch',           'Crunch en polea',                   'cable',     '{abs}',                        '{obliques}'),
  ('hanging_leg_raise',      'Elevación de piernas colgado',      'bodyweight','{abs}',                        '{obliques,forearms}'),
  ('plank',                  'Plancha',                           'bodyweight','{abs}',                        '{obliques}'),
  ('ab_wheel',               'Rueda abdominal',                   'other',     '{abs}',                        '{lats,obliques}'),
  ('russian_twist',          'Giros rusos',                       'bodyweight','{obliques}',                   '{abs}'),
  ('side_plank',             'Plancha lateral',                   'bodyweight','{obliques}',                   '{abs}'),
  ('pallof_press',           'Pallof press',                      'cable',     '{obliques}',                   '{abs}')
), ins as (
  insert into public.exercises (slug, name, equipment)
  select slug, name, equipment from seed
  returning id, slug
)
insert into public.exercise_muscles (exercise_id, muscle_id, role)
select ins.id, m, 'primary' from ins join seed using (slug), unnest(seed.prim) m
union all
select ins.id, m, 'secondary' from ins join seed using (slug), unnest(seed.sec) m;

-- Routines ----------------------------------------------------------------------
create table public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  notes      text,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_user on public.routines (user_id, position);
create trigger routines_touch before update on public.routines
  for each row execute function public.touch_updated_at();

create table public.routine_exercises (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references public.routines (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position    integer not null default 0,
  target_sets smallint not null default 3 check (target_sets between 1 and 10),
  rep_min     smallint not null default 8 check (rep_min between 1 and 100),
  rep_max     smallint not null default 12 check (rep_max between 1 and 100),
  -- 'ai_suggestion' rows are added from a physique analysis (stage 4)
  source      text not null default 'manual' check (source in ('manual', 'ai_suggestion')),
  analysis_id uuid,
  created_at  timestamptz not null default now(),
  check (rep_min <= rep_max)
);
create index routine_exercises_routine on public.routine_exercises (routine_id, position);

-- Workouts ----------------------------------------------------------------------
create table public.workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete set null,
  name       text not null default 'Entrenamiento',
  started_at timestamptz not null,
  ended_at   timestamptz not null,
  notes      text,
  created_at timestamptz not null default now(),
  check (ended_at >= started_at and ended_at - started_at < interval '12 hours')
);
create index workouts_user_started on public.workouts (user_id, started_at desc);

create table public.workout_sets (
  id                uuid primary key default gen_random_uuid(),
  workout_id        uuid not null references public.workouts (id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id       uuid not null references public.exercises (id) on delete cascade,
  exercise_position smallint not null default 0,
  set_index         smallint not null check (set_index >= 0),
  reps              smallint not null check (reps between 0 and 200),
  weight_kg         numeric(6,2) not null default 0 check (weight_kg between 0 and 1000),
  rpe               numeric(3,1) check (rpe between 1 and 10),
  created_at        timestamptz not null default now()
);
create index workout_sets_workout on public.workout_sets (workout_id, exercise_position, set_index);
create index workout_sets_user_exercise on public.workout_sets (user_id, exercise_id);

-- Row level security ------------------------------------------------------------
alter table public.muscle_groups     enable row level security;
alter table public.exercises         enable row level security;
alter table public.exercise_muscles  enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts          enable row level security;
alter table public.workout_sets      enable row level security;

-- An exercise is usable by a user when it is global or theirs.
create or replace function public.exercise_visible(p_exercise_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.exercises e
                 where e.id = p_exercise_id and (e.owner_id is null or e.owner_id = (select auth.uid())));
$$;

create policy "muscles: everyone reads" on public.muscle_groups for select to authenticated using (true);

create policy "exercises: read global or own" on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "exercises: insert own" on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()) and slug is null);
create policy "exercises: update own" on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and slug is null);
create policy "exercises: delete own" on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "exercise_muscles: read visible" on public.exercise_muscles for select to authenticated
  using (public.exercise_visible(exercise_id));
create policy "exercise_muscles: write own" on public.exercise_muscles for all to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

create policy "routines: owner" on public.routines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "routine_exercises: owner" on public.routine_exercises for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid()))
    and public.exercise_visible(exercise_id)
  );

create policy "workouts: owner" on public.workouts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (routine_id is null or exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())))
  );

create policy "workout_sets: owner" on public.workout_sets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid()))
    and public.exercise_visible(exercise_id)
  );

-- RPCs ---------------------------------------------------------------------------

-- Saves a finished workout and all its sets in one transaction.
-- p_sets: [{exercise_id, exercise_position, set_index, reps, weight_kg, rpe?}, ...]
create or replace function public.finish_workout(
  p_name text, p_routine_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_sets jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare wid uuid;
begin
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) = 0 then
    raise exception 'a workout needs at least one set' using errcode = '22023';
  end if;
  insert into public.workouts (name, routine_id, started_at, ended_at)
    values (coalesce(nullif(trim(p_name), ''), 'Entrenamiento'), p_routine_id, p_started_at, p_ended_at)
    returning id into wid;
  insert into public.workout_sets (workout_id, exercise_id, exercise_position, set_index, reps, weight_kg, rpe)
    select wid, s.exercise_id, s.exercise_position, s.set_index, s.reps, coalesce(s.weight_kg, 0), s.rpe
    from jsonb_to_recordset(p_sets) as s(exercise_id uuid, exercise_position smallint, set_index smallint,
                                         reps smallint, weight_kg numeric, rpe numeric);
  return wid;
end $$;

-- Weighted sets per muscle in a time window: a primary muscle counts 1 per set,
-- a secondary muscle 0.5. The client passes its local week boundaries.
create or replace function public.muscle_volume(p_from timestamptz, p_to timestamptz)
returns table (muscle_id text, sets numeric)
language sql stable security invoker set search_path = '' as $$
  select em.muscle_id, sum(case em.role when 'primary' then 1 else 0.5 end)::numeric as sets
  from public.workout_sets ws
  join public.workouts w on w.id = ws.workout_id
  join public.exercise_muscles em on em.exercise_id = ws.exercise_id
  where w.user_id = (select auth.uid()) and w.started_at >= p_from and w.started_at < p_to
  group by em.muscle_id;
$$;

-- Per-session progression for one exercise: heaviest set, best estimated 1RM
-- (Epley, only from sets of 1–12 reps) and total volume.
create or replace function public.exercise_progress(p_exercise_id uuid)
returns table (workout_id uuid, performed_at timestamptz, top_weight_kg numeric, best_e1rm_kg numeric,
               volume_kg numeric, sets integer)
language sql stable security invoker set search_path = '' as $$
  select w.id, w.started_at,
         max(ws.weight_kg),
         round(max(case when ws.reps between 1 and 12 then ws.weight_kg * (1 + ws.reps / 30.0) end), 1),
         sum(ws.weight_kg * ws.reps),
         count(*)::integer
  from public.workout_sets ws
  join public.workouts w on w.id = ws.workout_id
  where ws.exercise_id = p_exercise_id and w.user_id = (select auth.uid())
  group by w.id, w.started_at
  order by w.started_at;
$$;

revoke execute on function public.finish_workout, public.muscle_volume, public.exercise_progress from public, anon;
grant execute on function public.finish_workout, public.muscle_volume, public.exercise_progress to authenticated;
