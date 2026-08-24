/**
 * Push delivery for GymGroup. Deployed as a Supabase Edge Function (Deno).
 *
 * Two callers:
 *
 *  1. A Database Webhook on `nudges` INSERT — fires the moment someone calls a
 *     friend out. This is the path that actually gets people to the gym, so it
 *     must be immediate rather than batched.
 *
 *  2. Supabase Cron, once a day — sweeps for anyone behind their weekly pace
 *     late in the week and reminds them. Scheduling lives here rather than on
 *     Vercel because Hobby cron is capped at one run per day, UTC only.
 *
 * Deploy:
 *   supabase functions deploy send-push --no-verify-jwt
 *   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
 *                        VAPID_SUBJECT=mailto:you@example.com \
 *                        PUSH_SHARED_SECRET=...
 *
 * --no-verify-jwt is required because the webhook and cron call it without a
 * user JWT; PUSH_SHARED_SECRET is what actually authenticates callers.
 */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const SHARED_SECRET = Deno.env.get("PUSH_SHARED_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Service role: this runs with no user session and must read other people's
// push subscriptions, which RLS deliberately hides from everyone but the owner.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Payload = { title: string; body: string; url?: string; tag?: string };

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Sends to every device a user has registered. Prunes dead endpoints. */
async function pushToUser(userId: string, payload: Payload): Promise<number> {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .returns<PushRow[]>();

  if (!subs?.length) return 0;

  let delivered = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away — the user
        // deleted the PWA or cleared data. Anything else is transient.
        if (status === 404 || status === 410) dead.push(sub.id);
        else console.error(`push to ${sub.id} failed:`, err);
      }
    }),
  );

  if (dead.length) {
    await supabase.from("push_subscriptions").delete().in("id", dead);
  }

  return delivered;
}

/** Webhook path: someone was nudged. */
async function handleNudge(record: { from_user: string; to_user: string; message: string | null }) {
  const { data: sender } = await supabase
    .from("profiles")
    .select("display_name, avatar_emoji")
    .eq("id", record.from_user)
    .maybeSingle<{ display_name: string; avatar_emoji: string }>();

  const name = sender?.display_name ?? "Someone";

  const delivered = await pushToUser(record.to_user, {
    title: `${sender?.avatar_emoji ?? "👊"} ${name} nudged you`,
    body: record.message ?? "Get to the gym.",
    url: "/",
    // Per-sender tag: two nudges from different people both show, but a
    // repeat from the same person replaces rather than stacks.
    tag: `nudge-${record.from_user}`,
  });

  return { kind: "nudge", delivered };
}

/**
 * Cron path: remind anyone who can still realistically hit their goal.
 *
 * Deliberately quiet — nobody is reminded before Thursday (there's nothing
 * useful to say on a Monday), and nobody is reminded once they've already hit
 * their goal. An accountability app that pings you for no reason gets its
 * notifications turned off, and then it can't do its job at all.
 */
async function handleScheduled() {
  const { data: stats } = await supabase
    .from("weekly_stats")
    .select("user_id, sessions, goal, met_goal, week")
    .returns<
      { user_id: string; sessions: number; goal: number; met_goal: boolean; week: string }[]
    >();

  const { data: currentWeek } = await supabase.rpc("current_week");
  const thisWeek = (stats ?? []).filter((s) => s.week === currentWeek && !s.met_goal);

  // 0 = Monday. Only nudge from Thursday onward.
  //
  // Read in UTC, which matches the group's calendar day only because the cron
  // fires at 23:00 UTC and America/New_York is behind UTC — 23:00 UTC Thursday
  // is still Thursday evening there. Moving the schedule past midnight UTC
  // would make this a day ahead of the group (02:00 UTC Friday is Thursday
  // 21:00 ET), so keep the two in step. See 0002_push.sql.
  const dayOfWeek = (new Date().getUTCDay() + 6) % 7;
  if (dayOfWeek < 3) return { kind: "scheduled", skipped: "too early in the week" };

  const daysLeft = 7 - dayOfWeek;
  let delivered = 0;

  for (const row of thisWeek) {
    const remaining = row.goal - row.sessions;
    if (remaining <= 0) continue;

    delivered += await pushToUser(row.user_id, {
      title: remaining === 1 ? "One session to go" : `${remaining} sessions to go`,
      body:
        daysLeft <= 1
          ? "Last day of the week. Your streak is on the line."
          : `${daysLeft} days left to hit your goal of ${row.goal}.`,
      url: "/",
      // One tag for the whole reminder class: today's replaces yesterday's
      // rather than piling up on the lock screen.
      tag: "pace-reminder",
    });
  }

  return { kind: "scheduled", candidates: thisWeek.length, delivered };
}

Deno.serve(async (req) => {
  // The function is deployed with --no-verify-jwt so the webhook and cron can
  // reach it, which means this header is the only thing standing between the
  // internet and a push-spam endpoint.
  if (req.headers.get("x-push-secret") !== SHARED_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Database Webhooks post { type, table, record, ... }.
    if (body?.table === "nudges" && body?.record) {
      return Response.json(await handleNudge(body.record));
    }

    return Response.json(await handleScheduled());
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
