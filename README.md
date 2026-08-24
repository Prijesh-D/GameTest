# GymGroup

A workout tracker for a small group of friends who want to keep each other
honest. Log your lifts, see everyone else's, and get called out when you're
slacking.

Free to run and free to share: it's a PWA, so you send your friends a URL and
they add it to their home screen. No App Store, no Apple Developer account, no
sideloading.

**[Setup instructions →](SETUP.md)**

## What it does

- **Log workouts** — 1,324 exercises with form GIFs, muscle groups and
  instructions. Sets, reps, weight, RPE, warm-up flags, rest timer, and a
  "last time: 3×80kg" hint so repeating a session is fast.
- **Routines** — save a template, start from it next time.
- **Shared feed** — everyone's finished sessions, live, with reactions.
- **Weekly goals and streaks** — set your own target; the streak counts
  consecutive weeks you hit it.
- **Leaderboard** — by sessions, volume, or consistency, over a week, month, or
  all time.
- **Nudges** — a push notification when a friend calls you out, plus a quiet
  reminder late in the week if you're behind your own pace.
- **Works offline** — sets logged with no signal are stored on the phone and
  sync when you're back. Gym basements were a design constraint.

## Stack

Next.js (App Router) and Tailwind on Vercel, Supabase for Postgres, auth,
realtime and edge functions, Serwist for the service worker. All on free tiers.

Exercise data from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)
— metadata MIT, media © [Gym Visual](https://gymvisual.com/) and credited in the
app. See the note in [SETUP.md](SETUP.md#things-worth-knowing).

## Development

```bash
npm install
cp .env.example .env.local   # fill in — see SETUP.md
npm run db:seed              # load the exercise catalogue
npm run dev
```

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run doctor` | check env, schema and seed; names the exact step that failed |
| `npm run db:seed` | load exercises into Supabase |
| `npm run data:refresh` | re-pull the upstream exercise dataset |
| `./supabase/tests/run.sh` | verify schema, stats and RLS on a throwaway local Postgres |

## Layout

```
app/(app)/          the signed-in app — home, feed, workout, leaderboard, profile
app/login, /signup  auth screens
app/install         iOS "add to home screen" walkthrough
app/api/signup      invite-code check; creates the account server-side
app/sw.ts           service worker: offline caching + push handlers
components/         UI
lib/offline.ts      IndexedDB queue for sets logged without signal
lib/supabase/       browser and server clients
supabase/migrations schema, RLS, derived stats; push wiring
supabase/functions  send-push edge function
supabase/tests      local Postgres verification
scripts/            exercise data pipeline, icon generation
data/               vendored exercise catalogue (English subset)
```
