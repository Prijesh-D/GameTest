/**
 * Loads data/exercises.en.json into the `exercises` table.
 *
 * Idempotent — upserts on id, so re-running after `npm run data:refresh` picks
 * up upstream changes without duplicating anything.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the catalogue
 * is read-only to normal clients, so seeding must bypass RLS).
 *
 *   npm run db:seed
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Exercise } from "./build-exercise-data";

const BATCH_SIZE = 200;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Put it in .env.local (see SETUP.md).`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const file = join(process.cwd(), "data", "exercises.en.json");
  const exercises = JSON.parse(readFileSync(file, "utf8")) as Exercise[];

  // The licence requires the attribution to travel with the media. Fail loudly
  // rather than quietly seeding rows the app would then be unable to credit.
  const missing = exercises.filter((e) => !e.attribution || !e.gif_url || !e.image_url);
  if (missing.length) {
    throw new Error(`${missing.length} exercises are missing media or attribution — aborting`);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Seeding ${exercises.length} exercises…`);

  for (let i = 0; i < exercises.length; i += BATCH_SIZE) {
    const batch = exercises.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("exercises").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Batch at ${i} failed: ${error.message}`);
    console.log(`  ${Math.min(i + BATCH_SIZE, exercises.length)}/${exercises.length}`);
  }

  const { count, error: countError } = await supabase
    .from("exercises")
    .select("*", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);

  console.log(`Done. exercises table now holds ${count} rows.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
