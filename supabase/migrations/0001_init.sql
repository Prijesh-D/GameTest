-- GymGroup schema.
--
-- Group model: everyone with an account is in the one friend group. There are no
-- group/membership tables — RLS reads as "any authenticated user may read
-- everything, but may only write their own rows". Adding multi-group support
-- later is a real migration; it is deliberately not built in advance.

-- ---------------------------------------------------------------------------
-- Time helpers
-- ---------------------------------------------------------------------------

-- Week boundaries are computed in the group's local timezone, not UTC. Without
-- this, a Sunday-evening session lands in the following week and silently
-- breaks a streak the person actually earned. Edit this one function to move
-- the group.
--
-- Must be an IANA zone name, not a fixed offset — that is what makes daylight
-- saving handle itself, since `at time zone` resolves EST/EDT per timestamp.
create or replace function app_tz() returns text
  language sql immutable parallel safe
  as $$ select 'America/New_York'::text $$;

-- Monday-based (ISO) week containing the given instant, in local time.
create or replace function week_start(ts timestamptz) returns date
  language sql stable parallel safe
  as $$ select (date_trunc('week', ts at time zone app_tz()))::date $$;

create or replace function current_week() returns date
  language sql stable parallel safe
  as $$ select week_start(now()) $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (length(trim(display_name)) between 1 and 40),
  avatar_emoji  text not null default '💪' check (length(avatar_emoji) <= 8),
  weekly_goal   int  not null default 3 check (weekly_goal between 1 and 14),
  created_at    timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles readable by group" on profiles
  for select to authenticated using (true);
create policy "own profile updatable" on profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Signup carries display_name through raw_user_meta_data; the profile row is
-- created here so a half-registered user can never exist.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  insert into public.profiles (id, display_name, avatar_emoji)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'avatar_emoji', ''), '💪')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Exercise catalogue (seeded from scripts/seed-exercises.ts, read-only to clients)
-- ---------------------------------------------------------------------------

create table exercises (
  id                text primary key,
  name              text not null,
  body_part         text not null,
  equipment         text not null,
  target            text not null,
  secondary_muscles text[] not null default '{}',
  instructions      text[] not null default '{}',
  image_url         text not null,
  gif_url           text not null,
  -- "© Gym visual — https://gymvisual.com/". Carried verbatim from the dataset
  -- and displayed wherever media is shown; required by the media licence.
  attribution       text not null
);

alter table exercises enable row level security;
create policy "exercises readable by group" on exercises
  for select to authenticated using (true);

-- The picker's search box is the hottest query in the app.
alter table exercises add column search tsvector
  generated always as (
    setweight(to_tsvector('english', name), 'A') ||
    setweight(to_tsvector('english', target || ' ' || body_part), 'B') ||
    setweight(to_tsvector('english', equipment), 'C')
  ) stored;

create index exercises_search_idx  on exercises using gin (search);
create index exercises_name_trgm   on exercises (lower(name) text_pattern_ops);
create index exercises_body_part   on exercises (body_part);
create index exercises_equipment   on exercises (equipment);

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------

create table workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  notes       text check (length(notes) <= 500),
  constraint finished_after_started check (finished_at is null or finished_at >= started_at)
);

-- Declared after `routines` exists. Recording which routine a session came from
-- lets the active screen show that routine's exercises as empty blocks before
-- any set is logged, and survives a reload — no placeholder rows needed.
-- `set null` so deleting a routine never takes finished workouts with it.

alter table workouts enable row level security;

create policy "workouts readable by group" on workouts
  for select to authenticated using (true);
create policy "own workouts writable" on workouts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index workouts_user_finished on workouts (user_id, finished_at desc);
-- Drives the feed.
create index workouts_finished on workouts (finished_at desc) where finished_at is not null;

create table workout_sets (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references workouts(id) on delete cascade,
  exercise_id text not null references exercises(id),
  set_index   int  not null check (set_index >= 0),
  weight_kg   numeric(6,2) not null default 0 check (weight_kg >= 0 and weight_kg <= 1000),
  reps        int  not null check (reps >= 0 and reps <= 1000),
  rpe         numeric(3,1) check (rpe >= 1 and rpe <= 10),
  is_warmup   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (workout_id, exercise_id, set_index)
);

alter table workout_sets enable row level security;

create policy "sets readable by group" on workout_sets
  for select to authenticated using (true);

-- Ownership lives on the parent workout, so every write is checked against it.
-- This is what stops user A appending sets to user B's session.
create policy "own sets writable" on workout_sets
  for all to authenticated
  using (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));

create index workout_sets_workout on workout_sets (workout_id);
create index workout_sets_exercise on workout_sets (exercise_id);

-- ---------------------------------------------------------------------------
-- Routines (saved templates)
-- ---------------------------------------------------------------------------

create table routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table routines enable row level security;
create policy "routines readable by group" on routines
  for select to authenticated using (true);
create policy "own routines writable" on routines
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table routine_exercises (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references routines(id) on delete cascade,
  exercise_id text not null references exercises(id),
  position    int  not null check (position >= 0),
  target_sets int  not null default 3 check (target_sets between 1 and 20),
  unique (routine_id, position)
);

alter table routine_exercises enable row level security;
create policy "routine exercises readable by group" on routine_exercises
  for select to authenticated using (true);
create policy "own routine exercises writable" on routine_exercises
  for all to authenticated
  using (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()));

alter table workouts add column routine_id uuid references routines(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------

create table reactions (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  emoji      text not null check (length(emoji) <= 8),
  created_at timestamptz not null default now(),
  -- One of each emoji per person per workout; tapping again removes it.
  unique (workout_id, user_id, emoji)
);

alter table reactions enable row level security;
create policy "reactions readable by group" on reactions
  for select to authenticated using (true);
create policy "own reactions writable" on reactions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index reactions_workout on reactions (workout_id);

create table nudges (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references profiles(id) on delete cascade,
  to_user    uuid not null references profiles(id) on delete cascade,
  message    text check (length(message) <= 140),
  created_at timestamptz not null default now(),
  constraint no_self_nudge check (from_user <> to_user)
);

alter table nudges enable row level security;
create policy "nudges readable by participants" on nudges
  for select to authenticated using (auth.uid() = from_user or auth.uid() = to_user);
create policy "own nudges sendable" on nudges
  for insert to authenticated with check (auth.uid() = from_user);

create index nudges_to_user on nudges (to_user, created_at desc);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
-- Deliberately narrower than the other tables: a push endpoint is a capability,
-- not public information. Only the owner may see or manage their own devices.
create policy "own subscriptions" on push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Without this the feed still loads, it just never updates on its own — which
-- is most of the point of having a feed. Guarded so the schema still applies to
-- a plain Postgres cluster, where this publication does not exist.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table workouts;
    alter publication supabase_realtime add table reactions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Derived stats
--
-- Kept in SQL so the home screen, leaderboard and nudge job cannot disagree
-- about who hit their goal.
-- ---------------------------------------------------------------------------

-- security_invoker so the querying user's RLS applies rather than the owner's.
create view weekly_stats with (security_invoker = on) as
select
  p.id                                             as user_id,
  weeks.week                                       as week,
  count(distinct w.id)                             as sessions,
  coalesce(sum(s.weight_kg * s.reps)
    filter (where not s.is_warmup), 0)::numeric    as volume_kg,
  coalesce(count(s.id) filter (where not s.is_warmup), 0) as working_sets,
  p.weekly_goal                                    as goal,
  count(distinct w.id) >= p.weekly_goal            as met_goal
from profiles p
cross join lateral (
  -- Every week from the profile's first session to now, so weeks with zero
  -- sessions still produce a row (a missing row would look like a held streak).
  select generate_series(
    least(
      coalesce((select week_start(min(w2.finished_at)) from workouts w2
                where w2.user_id = p.id and w2.finished_at is not null),
               current_week()),
      current_week()
    ),
    current_week(),
    interval '1 week'
  )::date as week
) weeks
left join workouts w
  on w.user_id = p.id
 and w.finished_at is not null
 and week_start(w.finished_at) = weeks.week
left join workout_sets s on s.workout_id = w.id
group by p.id, p.weekly_goal, weeks.week;

-- Consecutive weeks meeting goal, counting back from now. The in-progress week
-- counts only once its goal is met, so hitting your target visibly bumps the
-- number rather than the streak appearing to reset every Monday.
create or replace function current_streak(target_user uuid) returns int
  language sql stable security invoker
  as $$
  with ordered as (
    select row_number() over (order by week desc) as rn, met_goal
    from weekly_stats
    where user_id = target_user
      and week <= current_week()
      -- An in-progress week that hasn't hit its goal yet is not a miss, it's
      -- just unfinished — drop it so the streak holds until the week is over.
      and (week < current_week() or met_goal)
  )
  -- Streak = however many weeks precede the most recent miss.
  select coalesce(
    (select min(rn) - 1 from ordered where not met_goal),
    (select count(*) from ordered)
  )::int;
$$;

-- Ranks the whole group over a window. `period` is 'week' | 'month' | 'all'.
create or replace function leaderboard(period text default 'week')
  returns table (
    user_id       uuid,
    display_name  text,
    avatar_emoji  text,
    sessions      bigint,
    volume_kg     numeric,
    goal_rate     numeric,
    streak        int
  )
  language sql stable security invoker
  as $$
  with bounds as (
    select case period
      when 'week'  then current_week()
      when 'month' then (date_trunc('month', current_week()::timestamp))::date
      else '1970-01-01'::date
    end as from_week
  )
  select
    p.id,
    p.display_name,
    p.avatar_emoji,
    coalesce(sum(ws.sessions), 0)  as sessions,
    coalesce(sum(ws.volume_kg), 0) as volume_kg,
    -- Share of weeks in the window where the goal was met. Keeps someone who
    -- trains steadily from being buried by one huge week from someone else.
    case when count(ws.week) = 0 then 0
         else round(count(*) filter (where ws.met_goal)::numeric / count(ws.week), 3)
    end as goal_rate,
    current_streak(p.id) as streak
  from profiles p
  cross join bounds b
  left join weekly_stats ws on ws.user_id = p.id and ws.week >= b.from_week
  group by p.id, p.display_name, p.avatar_emoji
  order by sessions desc, volume_kg desc;
$$;

-- Feed payload: one row per finished workout with everything the card renders,
-- so the feed is a single round trip instead of an N+1 over sets and reactions.
create view workout_feed with (security_invoker = on) as
select
  w.id,
  w.user_id,
  p.display_name,
  p.avatar_emoji,
  w.started_at,
  w.finished_at,
  w.notes,
  extract(epoch from (w.finished_at - w.started_at))::int as duration_seconds,
  coalesce(count(s.id) filter (where not s.is_warmup), 0) as working_sets,
  coalesce(sum(s.weight_kg * s.reps) filter (where not s.is_warmup), 0)::numeric as volume_kg,
  coalesce(
    (select array_agg(distinct e.name order by e.name)
     from workout_sets s2 join exercises e on e.id = s2.exercise_id
     where s2.workout_id = w.id),
    '{}'
  ) as exercise_names
from workouts w
join profiles p on p.id = w.user_id
left join workout_sets s on s.workout_id = w.id
where w.finished_at is not null
group by w.id, w.user_id, p.display_name, p.avatar_emoji;

-- Personal best per exercise: powers the "last time: 5x80kg" hint that makes
-- logging fast, and the PR badges on feed cards.
create or replace function last_performance(target_user uuid, target_exercise text)
  returns table (performed_at timestamptz, weight_kg numeric, reps int, sets bigint)
  language sql stable security invoker
  as $$
  select w.finished_at, s.weight_kg, s.reps, count(*) as sets
  from workout_sets s
  join workouts w on w.id = s.workout_id
  where w.user_id = target_user
    and s.exercise_id = target_exercise
    and w.finished_at is not null
    and not s.is_warmup
  group by w.finished_at, s.weight_kg, s.reps
  order by w.finished_at desc, s.weight_kg desc
  limit 1;
$$;
