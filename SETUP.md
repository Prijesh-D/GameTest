# Setting up GymGroup

End to end this is about 30 minutes, and costs nothing. You need a Supabase
account, a Vercel account, and a GitHub account. No Apple Developer account, no
App Store, no credit card.

Work through it in order — later steps depend on values produced by earlier ones.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project. Any
   region near you is fine; pick the free plan.
2. Save the database password somewhere — you won't need it for this app, but
   Supabase won't show it again.
3. Wait for it to finish provisioning (a minute or two).

From **Project Settings → API**, copy three values:

| Value | Goes into |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |

> The `service_role` key bypasses every security rule in the database. It is
> only ever used server-side. Never paste it into client code, and never commit
> it.

## 2. Turn off email confirmation

**Authentication → Sign In / Providers → Email**, and turn **Confirm email**
off.

This matters: Supabase's built-in mailer sends **2 emails per hour** and is not
meant for production. With confirmation on, your third friend to sign up would
be locked out with no way through. The app never sends an auth email at all —
the invite code is what controls access instead.

## 3. Apply the schema

**SQL Editor → New query**. Paste the entire contents of
`supabase/migrations/0001_init.sql` and run it.

This creates every table, the row-level security policies, the views behind
streaks and the leaderboard, and turns on Realtime for the feed.

Leave `0002_push.sql` for now — it needs values you don't have yet (step 7).

To confirm it worked, **Database → Publications → `supabase_realtime`** should
list `workouts` and `reactions`. Without those the feed still loads, it just
never updates on its own.

## 4. Configure the app locally

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with the three Supabase values from step 1, plus an
`INVITE_CODE` of your choosing — that's the code your friends will need to sign
up. Leave the VAPID key blank for now.

## 5. Load the exercises

```bash
npm run db:seed
```

This loads 1,324 exercises into your database. Expect:

```
Seeding 1324 exercises…
  200/1324
  ...
Done. exercises table now holds 1324 rows.
```

The data is vendored in `data/exercises.en.json`, so this works without network
access to GitHub. To pull upstream changes later, run `npm run data:refresh`
then seed again — it upserts, so re-running is safe.

Now try it:

```bash
npm run dev
```

Open http://localhost:3000, sign up with your invite code, and log a workout.

## 6. Deploy to Vercel

1. Push this repo to GitHub if you haven't.
2. At [vercel.com](https://vercel.com), **Add New → Project**, and import the
   repo. It'll detect Next.js on its own.
3. Before deploying, add the environment variables under **Environment
   Variables** — the same four from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INVITE_CODE`
4. Deploy.

You now have a URL like `https://gymgroup-xyz.vercel.app`. **That URL is the
whole distribution story** — send it to your friends and you're done.

### Get it onto a home screen

On iPhone, in **Safari** (Chrome cannot install web apps on iOS):

**Share → Add to Home Screen → Add**

There's a copy of these instructions at `/install` you can send people
straight to.

This step is not optional if you want notifications — iOS only grants push
access to a PWA that has been added to the home screen. It also makes the app
open full-screen with no browser chrome, and work offline in the gym.

## 7. Push notifications

Generate a key pair:

```bash
npx web-push generate-vapid-keys
```

**Public key** → add as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in both `.env.local` and
Vercel's environment variables, then redeploy.

**Private key** → goes to Supabase only, next step.

Install the Supabase CLI and deploy the function:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>

npx supabase secrets set \
  VAPID_PUBLIC_KEY=<public key> \
  VAPID_PRIVATE_KEY=<private key> \
  VAPID_SUBJECT=mailto:you@example.com \
  PUSH_SHARED_SECRET=<make up a long random string>

npx supabase functions deploy send-push --no-verify-jwt
```

`--no-verify-jwt` is required: the database calls this function with no user
session. `PUSH_SHARED_SECRET` is what actually authenticates those calls, so
make it long and random.

Now store the function URL and that same secret in the database's vault. In the
**SQL Editor**:

```sql
select vault.create_secret(
  'https://<your-project-ref>.supabase.co/functions/v1/send-push',
  'push_function_url'
);
select vault.create_secret('<the same PUSH_SHARED_SECRET>', 'push_shared_secret');
```

Finally run `supabase/migrations/0002_push.sql` in the SQL Editor. That adds the
trigger that fires the instant someone is nudged, and the daily sweep for people
behind their weekly pace.

To check it works: open the installed app on your phone, go to **You**, turn on
**Nudges**, then have someone nudge you from their Home screen.

To test the scheduled sweep without waiting a day:

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/send-push \
  -H "x-push-secret: <PUSH_SHARED_SECRET>" \
  -H "Content-Type: application/json" -d '{}'
```

---

## Things worth knowing

**Free Supabase projects pause after 7 days of no activity.** A group that
trains weekly will never hit this. If you all go on holiday, un-pause it from
the dashboard — no data is lost.

**Changing the group's timezone.** Week boundaries drive streaks and the
leaderboard, and are computed in one place. If your group isn't in the UK, edit
`app_tz()` at the top of `0001_init.sql` before running it (or `create or
replace` it later):

```sql
create or replace function app_tz() returns text
  language sql immutable parallel safe
  as $$ select 'America/New_York'::text $$;
```

**Exercise media.** The thumbnails and animated GIFs come from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
and are © Gym Visual, served at their original 180×180 with the required credit
shown on each exercise page. Don't resize them or strip the attribution. If this
ever stops being a private app among friends, swap `image_url`/`gif_url` for
[free-exercise-db](https://github.com/yuhonas/free-exercise-db), which is public
domain — that's a change to the seed script and nothing else.

**Checking the database logic.** `./supabase/tests/run.sh` spins up a throwaway
local Postgres and verifies streak arithmetic and every RLS policy. It never
touches your Supabase project. Needs local Postgres 16 server binaries.

**Adding people later.** Send them the URL and the invite code (it's shown on
your profile page). To change the code, update `INVITE_CODE` in Vercel and
redeploy — existing accounts are unaffected.
