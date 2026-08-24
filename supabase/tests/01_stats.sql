-- Verifies current_streak / weekly_stats / leaderboard against hand-computed
-- expectations, including a deliberately missed week and an in-progress week.

-- A couple of exercises so workout_sets has something to reference.
insert into exercises (id, name, body_part, equipment, target, image_url, gif_url, attribution)
values ('t1','Test Squat','upper legs','barbell','quads','i','g','© Gym visual'),
       ('t2','Test Bench','chest','barbell','pectorals','i','g','© Gym visual');

-- Helper: log `n` finished sessions in the week `offset_weeks` before this one.
create or replace function seed_sessions(u uuid, offset_weeks int, n int) returns void
  language plpgsql as $$
declare
  base timestamptz;
  i int;
  wid uuid;
begin
  -- Wednesday noon local time of the target week: safely inside the week
  -- regardless of the app timezone.
  base := ((current_week() - (offset_weeks * 7))::timestamp + interval '2 days 12 hours')
          at time zone app_tz();
  for i in 1..n loop
    insert into workouts (user_id, started_at, finished_at)
    values (u, base + (i || ' hours')::interval, base + (i || ' hours')::interval + interval '45 min')
    returning id into wid;
    insert into workout_sets (workout_id, exercise_id, set_index, weight_kg, reps)
    values (wid, 't1', 0, 100, 5), (wid, 't1', 1, 100, 5);
  end loop;
end $$;

do $$
declare
  u_perfect uuid; u_missed uuid; u_inprogress uuid; u_partial uuid; u_none uuid;
begin
  insert into auth.users (email, raw_user_meta_data) values
    ('perfect@t.co',    '{"display_name":"Perfect"}'),
    ('missed@t.co',     '{"display_name":"Missed"}'),
    ('inprogress@t.co', '{"display_name":"InProgress"}'),
    ('partial@t.co',    '{"display_name":"Partial"}'),
    ('none@t.co',       '{"display_name":"None"}');

  select id into u_perfect    from auth.users where email = 'perfect@t.co';
  select id into u_missed     from auth.users where email = 'missed@t.co';
  select id into u_inprogress from auth.users where email = 'inprogress@t.co';
  select id into u_partial    from auth.users where email = 'partial@t.co';
  select id into u_none       from auth.users where email = 'none@t.co';

  -- Everyone's goal is 3/week (the default).

  -- Met this week and the 3 before it -> streak 4.
  perform seed_sessions(u_perfect, 0, 3);
  perform seed_sessions(u_perfect, 1, 3);
  perform seed_sessions(u_perfect, 2, 4);
  perform seed_sessions(u_perfect, 3, 3);
  perform seed_sessions(u_perfect, 4, 1);   -- the miss that caps it

  -- Met this week, missed last week -> streak 1 (this week only; the gap caps it).
  perform seed_sessions(u_missed, 0, 3);
  perform seed_sessions(u_missed, 2, 3);

  -- Nothing logged yet this week, but the 2 before were met -> streak 2.
  -- (The in-progress week must not count as a miss.)
  perform seed_sessions(u_inprogress, 1, 3);
  perform seed_sessions(u_inprogress, 2, 3);

  -- 1 of 3 done this week, 2 met weeks behind it -> still 2, not 0.
  perform seed_sessions(u_partial, 0, 1);
  perform seed_sessions(u_partial, 1, 3);
  perform seed_sessions(u_partial, 2, 3);

  -- u_none logs nothing at all -> streak 0.
end $$;

\echo '=== streaks (expected: Perfect=4 Missed=0 InProgress=2 Partial=2 None=0) ==='
select p.display_name, current_streak(p.id) as streak
from profiles p order by p.display_name;

\echo ''
\echo '=== this week (expected sessions: Perfect=3 Missed=3 InProgress=0 Partial=1 None=0) ==='
select p.display_name, ws.sessions, ws.volume_kg, ws.met_goal
from weekly_stats ws join profiles p on p.id = ws.user_id
where ws.week = current_week() order by p.display_name;

\echo ''
\echo '=== leaderboard, all time (Perfect: 14 sessions, 100kg x 5 x 2 sets = 1000/session) ==='
select display_name, sessions, volume_kg, goal_rate, streak from leaderboard('all');

\echo ''
\echo '=== leaderboard, this week ==='
select display_name, sessions, volume_kg, streak from leaderboard('week');

\echo ''
\echo '=== workout_feed sanity (one row per finished workout) ==='
select display_name, working_sets, volume_kg, duration_seconds, exercise_names
from workout_feed order by finished_at desc limit 3;

\echo ''
\echo '=== last_performance for Perfect on t1 (expect 100kg x 5, 2 sets) ==='
select * from last_performance((select id from profiles where display_name='Perfect'), 't1');
