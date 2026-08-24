/**
 * Pre-flight check for a GymGroup deployment.
 *
 * Answers "which step did I get wrong?" without needing database access —
 * paste the output anywhere for help. It only ever reads.
 *
 *   npm run doctor
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const EXPECTED_EXERCISES = 1324;

type Status = "pass" | "fail" | "warn";
const results: { status: Status; label: string; detail?: string; fix?: string }[] = [];

function record(status: Status, label: string, detail?: string, fix?: string) {
  results.push({ status, label, detail, fix });
  const icon = status === "pass" ? "\x1b[32m✓\x1b[0m" : status === "warn" ? "\x1b[33m!\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ""}`);
  if (fix && status !== "pass") console.log(`    → ${fix}`);
}

/** Minimal .env.local reader — avoids a dependency just to read five lines. */
function loadEnv(): Record<string, string> {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return {};

  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function checkEnv(env: Record<string, string>) {
  console.log("\n\x1b[1mEnvironment\x1b[0m");
  let urlValid = true;

  if (!existsSync(join(process.cwd(), ".env.local"))) {
    record("fail", ".env.local exists", "not found", "cp .env.example .env.local, then fill it in (SETUP.md step 4)");
    return false;
  }
  record("pass", ".env.local exists");

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    record("fail", "NEXT_PUBLIC_SUPABASE_URL", "missing", "Supabase → Project Settings → API → Project URL");
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
    record("fail", "NEXT_PUBLIC_SUPABASE_URL", `doesn't look right: ${url}`, "Expected https://<ref>.supabase.co — no trailing path");
    urlValid = false;
  } else {
    record("pass", "NEXT_PUBLIC_SUPABASE_URL", url);
  }

  // Supabase keys are JWTs (legacy) or sb_*/publishable-style (newer projects).
  // Accept either shape rather than pinning to one era of the dashboard.
  const keyLooksValid = (v: string) => v.startsWith("eyJ") || /^sb[_p]/.test(v);

  for (const [name, hint] of [
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "the 'anon public' key"],
    ["SUPABASE_SERVICE_ROLE_KEY", "the 'service_role' key — keep it secret"],
  ] as const) {
    const v = env[name];
    if (!v) record("fail", name, "missing", `Supabase → Project Settings → API → ${hint}`);
    else if (!keyLooksValid(v)) record("warn", name, "unrecognised format", `Double-check you copied ${hint}`);
    else record("pass", name, `${v.slice(0, 8)}…`);
  }

  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) {
    record("fail", "anon and service_role differ", "they're identical",
           "You pasted the same key twice — they are two different keys on that page");
  }

  if (!env.INVITE_CODE) {
    record("fail", "INVITE_CODE", "missing", "Pick any shared phrase; it gates signup");
  } else if (env.INVITE_CODE.length < 6) {
    record("warn", "INVITE_CODE", "quite short", "Longer is better — this is the only thing gating signup");
  } else {
    record("pass", "INVITE_CODE", `${env.INVITE_CODE.length} chars`);
  }

  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    record("warn", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "not set — push notifications are off",
           "Expected until SETUP.md step 7. The app handles this and says so in the UI.");
  } else {
    record("pass", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", `${env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.slice(0, 8)}…`);
  }

  // Don't bother dialling out on a URL we already know is wrong — a bare
  // "fetch failed" underneath a clear diagnosis only buries it.
  return urlValid && Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

async function checkSchema(admin: SupabaseClient) {
  console.log("\n\x1b[1mSchema\x1b[0m");

  const tables = [
    "profiles", "exercises", "workouts", "workout_sets",
    "routines", "routine_exercises", "reactions", "nudges", "push_subscriptions",
  ];

  let missing = 0;
  for (const table of tables) {
    const { error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) {
      missing++;
      record("fail", `table ${table}`, error.message);
    }
  }
  if (missing === 0) record("pass", `all ${tables.length} tables present`);
  else {
    record("fail", "schema incomplete", `${missing} table(s) missing`,
           "Run supabase/migrations/0001_init.sql in the SQL Editor (SETUP.md step 3)");
    return false;
  }

  for (const view of ["weekly_stats", "workout_feed"]) {
    const { error } = await admin.from(view).select("*", { head: true, count: "exact" });
    record(error ? "fail" : "pass", `view ${view}`, error?.message);
  }

  const { error: rpcError } = await admin.rpc("leaderboard", { period: "week" });
  record(rpcError ? "fail" : "pass", "function leaderboard()", rpcError?.message,
         rpcError ? "0001_init.sql did not finish — re-run it and watch for errors" : undefined);

  const { error: streakError } = await admin.rpc("current_week");
  record(streakError ? "fail" : "pass", "function current_week()", streakError?.message);

  const { data: tz } = await admin.rpc("app_tz");
  if (tz) record("pass", "timezone", String(tz));

  return true;
}

async function checkSeed(admin: SupabaseClient) {
  console.log("\n\x1b[1mExercise catalogue\x1b[0m");

  const { count, error } = await admin
    .from("exercises")
    .select("*", { count: "exact", head: true });

  if (error) {
    record("fail", "exercises readable", error.message);
    return;
  }

  if (count === 0) {
    record("fail", "exercises seeded", "table is empty", "npm run db:seed (SETUP.md step 5)");
    return;
  }
  if (count !== EXPECTED_EXERCISES) {
    record("warn", "exercise count", `${count}, expected ${EXPECTED_EXERCISES}`,
           "Re-run npm run db:seed — it upserts, so this is safe");
  } else {
    record("pass", "exercise count", `${count}`);
  }

  // The media licence requires the credit to travel with the images, so a row
  // with media but no attribution is a real problem, not a cosmetic one.
  const { count: unattributed } = await admin
    .from("exercises")
    .select("*", { count: "exact", head: true })
    .is("attribution", null);
  record(unattributed ? "fail" : "pass", "attribution present on every row",
         unattributed ? `${unattributed} row(s) missing it` : undefined,
         unattributed ? "Re-run npm run db:seed; it refuses to seed rows without attribution" : undefined);

  const { count: noGif } = await admin
    .from("exercises")
    .select("*", { count: "exact", head: true })
    .is("gif_url", null);
  record(noGif ? "warn" : "pass", "form GIFs present",
         noGif ? `${noGif} row(s) missing` : undefined);

  const { data: sample } = await admin
    .from("exercises").select("name, gif_url").ilike("name", "%bench press%").limit(1);
  if (sample?.[0]) record("pass", "search sanity", `"bench press" → ${sample[0].name}`);
}

async function checkRls(url: string, anonKey: string) {
  console.log("\n\x1b[1mSecurity\x1b[0m");

  // With the anon key and no signed-in user, every policy (all scoped to the
  // `authenticated` role) should exclude us. Rows coming back here would mean
  // the app's data is readable by anyone holding the public key.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  for (const table of ["workouts", "workout_sets", "profiles", "push_subscriptions"]) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    if (error) record("pass", `${table} closed to anonymous reads`, "rejected");
    else if (data && data.length > 0) {
      record("fail", `${table} closed to anonymous reads`, `${data.length} row(s) leaked`,
             "RLS is not enabled or a policy targets the wrong role — re-run 0001_init.sql");
    } else record("pass", `${table} closed to anonymous reads`, "no rows");
  }
}

async function main() {
  console.log("\x1b[1mGymGroup doctor\x1b[0m");

  const env = { ...loadEnv(), ...process.env } as Record<string, string>;
  const canReachDb = checkEnv(env);

  if (!canReachDb) {
    console.log("\n\x1b[31mStopping — fix the environment above, then run this again.\x1b[0m");
    process.exit(1);
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("\n\x1b[1mConnection\x1b[0m");
  try {
    const { error } = await admin.from("exercises").select("id", { head: true, count: "exact" });
    // A missing table still proves we reached the API and authenticated.
    if (error && !/relation|does not exist|schema cache/i.test(error.message)) throw new Error(error.message);
    record("pass", "reached Supabase", url);
  } catch (err) {
    record("fail", "reached Supabase", err instanceof Error ? err.message : String(err),
           "Check the URL and that the project isn't paused (free projects pause after 7 days idle)");
    process.exit(1);
  }

  const schemaOk = await checkSchema(admin);
  if (schemaOk) await checkSeed(admin);
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    await checkRls(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }

  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;

  console.log("");
  if (failed === 0 && warned === 0) {
    console.log("\x1b[32mAll good. Ready to deploy.\x1b[0m");
  } else if (failed === 0) {
    console.log(`\x1b[33m${warned} warning(s), nothing blocking. Safe to deploy.\x1b[0m`);
  } else {
    console.log(`\x1b[31m${failed} problem(s) to fix${warned ? `, plus ${warned} warning(s)` : ""}.\x1b[0m`);
  }

  // Realtime membership lives in pg_catalog, which PostgREST cannot read.
  console.log(
    "\nNot checked from here: the Realtime publication. Confirm in\n" +
    "Supabase → Database → Publications → supabase_realtime that\n" +
    "'workouts' and 'reactions' are listed, or the feed won't live-update.",
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\ndoctor crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
