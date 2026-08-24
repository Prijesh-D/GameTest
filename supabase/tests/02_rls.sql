-- RLS enforcement checks, run as the `authenticated` role with an impersonated
-- JWT subject — the same path the anon-key client takes. Running these as
-- superuser would bypass RLS and prove nothing.

\set ON_ERROR_STOP 0

grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  workouts, workout_sets, routines, routine_exercises, reactions, nudges,
  push_subscriptions, profiles
  to authenticated;

-- Two users: A acts, B is the victim.
select id as a_id from profiles where display_name = 'Perfect' \gset
select id as b_id from profiles where display_name = 'Missed' \gset
select id as b_workout from workouts where user_id = :'b_id' limit 1 \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'a_id', false);

\echo '--- 1. A can read B''s workouts (group-readable) -> expect a row count > 0'
select count(*) > 0 as can_read_others from workouts where user_id = :'b_id';

\echo ''
\echo '--- 2. A inserts a set into B''s workout -> MUST FAIL'
insert into workout_sets (workout_id, exercise_id, set_index, weight_kg, reps)
values (:'b_workout', 't2', 99, 60, 5);

\echo ''
\echo '--- 3. A updates B''s workout notes -> MUST affect 0 rows'
update workouts set notes = 'hacked' where id = :'b_workout';

\echo ''
\echo '--- 4. A deletes B''s workout -> MUST affect 0 rows'
delete from workouts where id = :'b_workout';

\echo ''
\echo '--- 5. A edits B''s profile goal -> MUST affect 0 rows'
update profiles set weekly_goal = 99 where id = :'b_id';

\echo ''
\echo '--- 6. A inserts a workout claiming to be B -> MUST FAIL'
insert into workouts (user_id) values (:'b_id');

\echo ''
\echo '--- 7. A inserts their own workout -> must succeed'
insert into workouts (user_id, finished_at) values (:'a_id', now()) returning 'inserted ok' as result;

\echo ''
\echo '--- 8. A sends a nudge as B -> MUST FAIL'
insert into nudges (from_user, to_user, message) values (:'b_id', :'a_id', 'spoofed');

\echo ''
\echo '--- 9. A sends their own nudge -> must succeed'
insert into nudges (from_user, to_user, message) values (:'a_id', :'b_id', 'gym time')
  returning 'nudge sent' as result;

\echo ''
\echo '--- 10. Push subscriptions are private: A reads B''s -> expect 0'
select count(*) as visible_b_subscriptions from push_subscriptions where user_id = :'b_id';

\echo ''
\echo '--- 11. B''s goal is still 3 and B''s workout still exists -> expect 3 / t'
reset role;
select weekly_goal from profiles where id = :'b_id';
select exists(select 1 from workouts where id = :'b_workout') as b_workout_intact;
select notes is null as notes_untouched from workouts where id = :'b_workout';
