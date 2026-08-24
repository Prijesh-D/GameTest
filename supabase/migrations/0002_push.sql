-- Wires push delivery to the send-push Edge Function.
--
-- Both paths are defined here rather than clicked together in the dashboard, so
-- the setup is reproducible and reviewable.
--
-- Prerequisite: store the function URL and shared secret in Vault first, so
-- neither ends up in version control. See SETUP.md.
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push',
--                              'push_function_url');
--   select vault.create_secret('<your PUSH_SHARED_SECRET>', 'push_shared_secret');

create extension if not exists pg_net    with schema extensions;
create extension if not exists pg_cron   with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Posts to the Edge Function. Returns the pg_net request id; delivery is
-- asynchronous, so this never blocks the transaction that triggered it.
create or replace function call_send_push(payload jsonb) returns bigint
  language plpgsql security definer set search_path = public, extensions, vault
  as $$
declare
  fn_url text;
  secret text;
  request_id bigint;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'push_shared_secret';

  if fn_url is null or secret is null then
    raise warning 'push secrets are not configured in Vault; skipping';
    return null;
  end if;

  select net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-secret', secret
               ),
    body    := payload,
    timeout_milliseconds := 5000
  ) into request_id;

  return request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Event-driven: a nudge is sent
-- ---------------------------------------------------------------------------

create or replace function on_nudge_created() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  perform call_send_push(jsonb_build_object(
    'table',  'nudges',
    'record', jsonb_build_object(
      'from_user', new.from_user,
      'to_user',   new.to_user,
      'message',   new.message
    )
  ));
  return new;
end;
$$;

create trigger nudge_push
  after insert on nudges
  for each row execute function on_nudge_created();

-- ---------------------------------------------------------------------------
-- 2. Scheduled: behind-pace sweep
-- ---------------------------------------------------------------------------

-- 18:00 UTC daily. The function itself decides who is worth pinging — it stays
-- quiet before Thursday and skips anyone already at their goal — so this only
-- needs to fire once a day at an hour people might act on.
select cron.schedule(
  'gymgroup-pace-reminder',
  '0 18 * * *',
  $$ select public.call_send_push('{"scheduled":true}'::jsonb) $$
);

-- To undo:  select cron.unschedule('gymgroup-pace-reminder');
