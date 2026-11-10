-- Stage 1: profiles + nutrition targets.
-- Every user-owned table has RLS enabled and is scoped to auth.uid().

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  sex            text check (sex in ('male', 'female')),
  birth_date     date check (birth_date between '1900-01-01' and current_date),
  height_cm      numeric(5,1) check (height_cm between 120 and 230),
  weight_kg      numeric(5,1) check (weight_kg between 35 and 250),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal           text check (goal in ('bulk', 'cut', 'maintain')),
  experience     text check (experience in ('beginner', 'intermediate', 'advanced')),
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A profile can only be marked onboarded once every field the
  -- calorie calculation needs is present.
  constraint profiles_onboarding_complete check (
    onboarded_at is null or (
      sex is not null and birth_date is not null and height_cm is not null and
      weight_kg is not null and activity_level is not null and goal is not null and
      experience is not null
    )
  )
);

-- History of targets: a new row whenever weight or goal changes.
create table public.nutrition_targets (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  kcal           integer not null check (kcal between 800 and 8000),
  protein_g      integer not null check (protein_g >= 0),
  carbs_g        integer not null check (carbs_g >= 0),
  fat_g          integer not null check (fat_g >= 0),
  effective_from date not null default current_date,
  created_at     timestamptz not null default now()
);
create index nutrition_targets_user_date on public.nutrition_targets (user_id, effective_from desc);

-- Keep updated_at fresh.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create an empty profile row for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row level security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.nutrition_targets enable row level security;

create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "targets: owner reads" on public.nutrition_targets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "targets: owner inserts" on public.nutrition_targets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "targets: owner deletes" on public.nutrition_targets
  for delete to authenticated using (user_id = (select auth.uid()));

-- Latest target per user, for the dashboard.
create view public.current_nutrition_targets with (security_invoker = true) as
  select distinct on (user_id) *
  from public.nutrition_targets
  where effective_from <= current_date
  order by user_id, effective_from desc, id desc;

-- Saves onboarding answers and the first nutrition target atomically.
-- security invoker: runs with the caller's rights, so RLS still applies.
create or replace function public.complete_onboarding(
  p_sex text, p_birth_date date, p_height_cm numeric, p_weight_kg numeric,
  p_activity_level text, p_goal text, p_experience text,
  p_kcal integer, p_protein_g integer, p_carbs_g integer, p_fat_g integer
) returns void
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  update public.profiles set
    sex = p_sex, birth_date = p_birth_date, height_cm = p_height_cm, weight_kg = p_weight_kg,
    activity_level = p_activity_level, goal = p_goal, experience = p_experience,
    onboarded_at = coalesce(onboarded_at, now())
  where id = uid;
  if not found then raise exception 'profile not found'; end if;
  insert into public.nutrition_targets (user_id, kcal, protein_g, carbs_g, fat_g)
    values (uid, p_kcal, p_protein_g, p_carbs_g, p_fat_g);
end $$;

revoke execute on function public.complete_onboarding from public, anon;
grant execute on function public.complete_onboarding to authenticated;
