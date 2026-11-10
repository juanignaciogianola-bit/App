-- Stage 3: calorie log with photo estimation.

create table public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_at    timestamptz not null default now(),
  meal_type   text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name        text not null check (length(trim(name)) between 1 and 80),
  photo_path  text check (photo_path is null or photo_path like (user_id::text || '/%')),
  source      text not null default 'manual' check (source in ('photo', 'manual')),
  -- untouched AI output, kept to compare with what the user saved
  ai_raw      jsonb,
  ai_model    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index meals_user_eaten on public.meals (user_id, eaten_at desc);
create trigger meals_touch before update on public.meals
  for each row execute function public.touch_updated_at();

create table public.meal_items (
  id         uuid primary key default gen_random_uuid(),
  meal_id    uuid not null references public.meals (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position   smallint not null default 0,
  name       text not null check (length(trim(name)) between 1 and 80),
  grams      numeric(7,1) check (grams is null or grams between 0 and 5000),
  kcal       numeric(7,1) not null check (kcal between 0 and 10000),
  protein_g  numeric(6,1) not null default 0 check (protein_g between 0 and 1000),
  carbs_g    numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g      numeric(6,1) not null default 0 check (fat_g between 0 and 1000),
  edited     boolean not null default false
);
create index meal_items_meal on public.meal_items (meal_id, position);

-- One row per AI call: used for per-user daily limits and cost tracking.
-- Written only by edge functions (service role); users can read their own.
create table public.ai_requests (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('meal', 'physique')),
  model         text,
  input_tokens  integer,
  output_tokens integer,
  ok            boolean not null,
  created_at    timestamptz not null default now()
);
create index ai_requests_user_kind on public.ai_requests (user_id, kind, created_at desc);

alter table public.meals       enable row level security;
alter table public.meal_items  enable row level security;
alter table public.ai_requests enable row level security;

create policy "meals: owner" on public.meals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal_items: owner" on public.meal_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.meals m where m.id = meal_id and m.user_id = (select auth.uid()))
  );
create policy "ai_requests: owner reads" on public.ai_requests for select to authenticated
  using (user_id = (select auth.uid()));

-- Storage: private bucket, every object under "<user id>/".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "meal photos: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "meal photos: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "meal photos: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- RPCs ----------------------------------------------------------------------------

-- Creates (p_id null) or replaces a meal and all its items atomically.
-- p_items: [{name, grams?, kcal, protein_g, carbs_g, fat_g, edited?}, ...]
create or replace function public.save_meal(
  p_id uuid, p_eaten_at timestamptz, p_meal_type text, p_name text, p_items jsonb,
  p_photo_path text default null, p_source text default 'manual', p_ai_raw jsonb default null, p_ai_model text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare mid uuid := p_id;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a meal needs at least one item' using errcode = '22023';
  end if;
  if mid is null then
    insert into public.meals (eaten_at, meal_type, name, photo_path, source, ai_raw, ai_model)
      values (p_eaten_at, p_meal_type, p_name, p_photo_path, p_source, p_ai_raw, p_ai_model)
      returning id into mid;
  else
    update public.meals set eaten_at = p_eaten_at, meal_type = p_meal_type, name = p_name
      where id = mid;
    if not found then raise exception 'meal not found' using errcode = 'P0002'; end if;
    delete from public.meal_items where meal_id = mid;
  end if;
  insert into public.meal_items (meal_id, position, name, grams, kcal, protein_g, carbs_g, fat_g, edited)
    select mid, (e.ord - 1)::smallint, e.item->>'name', (e.item->>'grams')::numeric, (e.item->>'kcal')::numeric,
           coalesce((e.item->>'protein_g')::numeric, 0), coalesce((e.item->>'carbs_g')::numeric, 0),
           coalesce((e.item->>'fat_g')::numeric, 0), coalesce((e.item->>'edited')::boolean, false)
    from jsonb_array_elements(p_items) with ordinality as e(item, ord);
  return mid;
end $$;

-- Totals consumed in a time window (the client passes its local day).
create or replace function public.nutrition_totals(p_from timestamptz, p_to timestamptz)
returns table (kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric, meals integer)
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(i.kcal), 0), coalesce(sum(i.protein_g), 0), coalesce(sum(i.carbs_g), 0),
         coalesce(sum(i.fat_g), 0), count(distinct m.id)::integer
  from public.meals m
  left join public.meal_items i on i.meal_id = m.id
  where m.user_id = (select auth.uid()) and m.eaten_at >= p_from and m.eaten_at < p_to;
$$;

revoke execute on function public.save_meal, public.nutrition_totals from public, anon;
grant execute on function public.save_meal, public.nutrition_totals to authenticated;
