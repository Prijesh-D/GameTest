import { ProfileForm } from "@/components/ProfileForm";
import { PushToggle } from "@/components/PushToggle";
import { SignOutButton } from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import type { Profile, WeeklyStat } from "@/lib/types";
import { formatVolume } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: history }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single<Profile>(),
    supabase
      .from("weekly_stats")
      .select("*")
      .eq("user_id", user!.id)
      .order("week", { ascending: false })
      .limit(12)
      .returns<WeeklyStat[]>(),
  ]);

  const totalVolume = (history ?? []).reduce((sum, w) => sum + Number(w.volume_kg), 0);
  const totalSessions = (history ?? []).reduce((sum, w) => sum + w.sessions, 0);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">You</h1>

      {profile && <ProfileForm profile={profile} />}

      <section className="mt-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Last 12 weeks
        </h2>
        <div className="card">
          <div className="mb-3 flex gap-5 text-sm">
            <span>
              <span className="text-lg font-bold tabular-nums">{totalSessions}</span>{" "}
              <span className="text-muted">sessions</span>
            </span>
            <span>
              <span className="text-lg font-bold tabular-nums">{formatVolume(totalVolume)}</span>{" "}
              <span className="text-muted">lifted</span>
            </span>
          </div>

          {/* Oldest to newest, so the bars read left-to-right like a calendar. */}
          <div className="flex items-end gap-1" style={{ height: 64 }}>
            {[...(history ?? [])].reverse().map((w) => {
              const pct = w.goal > 0 ? Math.min(w.sessions / w.goal, 1) : 0;
              return (
                <div
                  key={w.week}
                  className="flex-1"
                  title={`${w.week}: ${w.sessions}/${w.goal}`}
                >
                  <div
                    className={`w-full rounded-sm ${w.met_goal ? "bg-accent" : "bg-surface2"}`}
                    style={{ height: Math.max(4, pct * 64) }}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Green weeks are ones you hit your goal.</p>
        </div>
      </section>

      <section className="mt-4">
        <PushToggle />
      </section>

      {/* Members are the ones who invite people, so they need to see the code.
          It is read server-side and never shipped in the client bundle. */}
      {process.env.INVITE_CODE && (
        <section className="card mt-4">
          <p className="font-medium">Invite a friend</p>
          <p className="mt-1 text-sm text-muted">
            Send them this link and the code below.
          </p>
          <p className="mt-2 select-all rounded-lg bg-surface2 px-3 py-2 text-center font-mono text-lg tracking-widest">
            {process.env.INVITE_CODE}
          </p>
        </section>
      )}

      <section className="mt-4">
        <SignOutButton />
      </section>
    </>
  );
}
