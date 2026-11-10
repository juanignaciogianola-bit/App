-- Stage 4: physique photos and AI analysis.

create table public.physique_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  taken_at    timestamptz not null default now(),
  weight_kg   numeric(5,1) check (weight_kg between 35 and 250),
  front_path  text,
  back_path   text,
  side_path   text,
  created_at  timestamptz not null default now(),
  -- photos live under "<user id>/<session id>/"
  check (front_path is null or front_path like (user_id::text || '/' || id::text || '/%')),
  check (back_path  is null or back_path  like (user_id::text || '/' || id::text || '/%')),
  check (side_path  is null or side_path  like (user_id::text || '/' || id::text || '/%'))
);
create index physique_sessions_user on public.physique_sessions (user_id, taken_at desc);

-- Written only by the analyze-physique edge function (service role).
create table public.physique_analyses (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.physique_sessions (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  summary             text not null,
  strengths           jsonb not null default '[]',  -- [{muscle_id, note}]
  lagging             jsonb not null default '[]',  -- [{muscle_id, severity, note}]
  imbalances          jsonb not null default '[]',  -- [{note, muscles: [muscle_id]}]
  routine_suggestions jsonb not null default '[]',  -- [{muscle_id, exercise_id, exercise_name, sets, rep_min, rep_max, reason}]
  diet_suggestions    jsonb not null default '[]',  -- [{title, detail}]
  model               text,
  created_at          timestamptz not null default now()
);
create index physique_analyses_session on public.physique_analyses (session_id, created_at desc);
create index physique_analyses_user on public.physique_analyses (user_id, created_at desc);

-- Exercises added to a routine from an analysis keep a link to it.
alter table public.routine_exercises
  add constraint routine_exercises_analysis_fk
  foreign key (analysis_id) references public.physique_analyses (id) on delete set null;

alter table public.physique_sessions enable row level security;
alter table public.physique_analyses enable row level security;

create policy "physique_sessions: owner" on public.physique_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "physique_analyses: owner reads" on public.physique_analyses for select to authenticated
  using (user_id = (select auth.uid()));
create policy "physique_analyses: owner deletes" on public.physique_analyses for delete to authenticated
  using (user_id = (select auth.uid()));

-- Private bucket: "<user id>/<session id>/<pose>.jpg"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('physique-photos', 'physique-photos', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "physique photos: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'physique-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "physique photos: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'physique-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "physique photos: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'physique-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Adds suggested exercises from an analysis to one of the user's routines.
create or replace function public.add_suggestions_to_routine(p_analysis_id uuid, p_routine_id uuid, p_indexes integer[])
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  a public.physique_analyses;
  next_pos integer;
  added integer := 0;
  s jsonb;
  i integer;
begin
  select * into a from public.physique_analyses where id = p_analysis_id;
  if not found then raise exception 'analysis not found' using errcode = 'P0002'; end if;
  select coalesce(max(position) + 1, 0) into next_pos from public.routine_exercises where routine_id = p_routine_id;
  foreach i in array p_indexes loop
    s := a.routine_suggestions -> i;
    if s is null then continue; end if;
    -- skip exercises already in the routine
    if exists (select 1 from public.routine_exercises
               where routine_id = p_routine_id and exercise_id = (s->>'exercise_id')::uuid) then
      continue;
    end if;
    insert into public.routine_exercises (routine_id, exercise_id, position, target_sets, rep_min, rep_max, source, analysis_id)
      values (p_routine_id, (s->>'exercise_id')::uuid, next_pos + added,
              least(greatest(coalesce((s->>'sets')::int, 3), 1), 10),
              least(greatest(coalesce((s->>'rep_min')::int, 8), 1), 100),
              least(greatest(coalesce((s->>'rep_max')::int, 12), coalesce((s->>'rep_min')::int, 8), 1), 100),
              'ai_suggestion', p_analysis_id);
    added := added + 1;
  end loop;
  return added;
end $$;

revoke execute on function public.add_suggestions_to_routine from public, anon;
grant execute on function public.add_suggestions_to_routine to authenticated;
