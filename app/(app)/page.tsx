import Link from "next/link";
import { ProgressRing } from "@/components/ProgressRing";
import { NudgeButton } from "@/components/NudgeButton";
import { createClient } from "@/lib/supabase/server";
import type { LeaderboardRow, WeeklyStat } from "@/lib/types";
import { formatVolume } from "@/lib/format";

// Always fresh — a stale "you've done 2 of 3" is worse than a spinner.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: week }, { data: board }, { data: openWorkout }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user!.id).single(),
      supabase
        .from("weekly_stats")
        .select("*")
        .eq("user_id", user!.id)
        .order("week", { ascending: false })
        .limit(1)
        .maybeSingle<WeeklyStat>(),
      supabase.rpc("leaderboard", { period: "week" }),
      supabase
        .from("workouts")
        .select("id")
        .eq("user_id", user!.id)
        .is("finished_at", null)
        .maybeSingle(),
    ]);

  const sessions = week?.sessions ?? 0;
  const goal = profile?.weekly_goal ?? 3;
  // supabase-js can't infer RPC return shapes without generated DB types.
  const rows = (board ?? []) as LeaderboardRow[];
  const me = rows.find((r) => r.user_id === user!.id);
  const others = rows.filter((r) => r.user_id !== user!.id);
  const behind = others.filter((r) => r.sessions < goal);

  return (
    <>
      <header className="mb-5">
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-2xl font-bold">
          {profile?.avatar_emoji} {profile?.display_name}
        </h1>
      </header>

      <section className="card flex items-center gap-5">
        <ProgressRing value={sessions} goal={goal} />
        <div className="flex-1">
          <p className="text-3xl font-bold text-accent">
            {me?.streak ?? 0}
            <span className="ml-1 text-base font-medium text-muted">
              week{me?.streak === 1 ? "" : "s"}
            </span>
          </p>
          <p className="text-sm text-muted">current streak</p>

          <p className="mt-3 text-sm">
            {sessions >= goal ? (
              <span className="text-accent">Goal hit. Anything else is a bonus.</span>
            ) : (
              <span className="text-warn">
                {goal - sessions} more session{goal - sessions === 1 ? "" : "s"} to go.
              </span>
            )}
          </p>
          {week && week.volume_kg > 0 && (
            <p className="mt-1 text-sm text-muted">{formatVolume(week.volume_kg)} lifted</p>
          )}
        </div>
      </section>

      <Link href="/workout" className="btn-primary mt-4 w-full text-lg">
        {openWorkout ? "Resume workout →" : "Start a workout"}
      </Link>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          The group this week
        </h2>
        <ul className="flex flex-col gap-2">
          {others.map((row) => {
            const onPace = row.sessions >= goal;
            return (
              <li key={row.user_id} className="card flex items-center gap-3 py-3">
                <span className="text-2xl">{row.avatar_emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.display_name}</p>
                  <p className="text-sm text-muted">
                    {row.sessions} session{row.sessions === 1 ? "" : "s"}
                    {row.streak > 0 && ` · 🔥 ${row.streak}`}
                  </p>
                </div>
                {onPace ? (
                  <span className="rounded-full bg-accentDim px-2.5 py-1 text-xs text-accent">
                    on pace
                  </span>
                ) : (
                  <NudgeButton toUserId={row.user_id} toName={row.display_name} />
                )}
              </li>
            );
          })}
          {others.length === 0 && (
            <li className="card text-sm text-muted">
              Nobody else has joined yet. Share the invite code from your profile.
            </li>
          )}
        </ul>

        {behind.length > 0 && (
          <p className="mt-3 text-center text-xs text-muted">
            {behind.length} {behind.length === 1 ? "person is" : "people are"} behind pace. A nudge
            sends them a notification.
          </p>
        )}
      </section>
    </>
  );
}
