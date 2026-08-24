"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Routine = {
  id: string;
  name: string;
  routine_exercises: { exercise_id: string; position: number }[];
};

export function StartWorkout({ routines }: { routines: Routine[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(routine?: Routine) {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setError("You're signed out.");

    // routine_id is all that's needed — the active screen expands it into empty
    // exercise blocks, and it survives a reload without inventing any set rows.
    const { error: createError } = await supabase
      .from("workouts")
      .insert({ user_id: user.id, routine_id: routine?.id ?? null });

    if (createError) {
      setError("Couldn't start a workout. Check your connection.");
      setBusy(false);
      return;
    }

    router.refresh();
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Train</h1>
        <p className="text-sm text-muted">Start empty, or from one of your routines.</p>
      </header>

      <button onClick={() => start()} disabled={busy} className="btn-primary w-full text-lg">
        {busy ? "Starting…" : "Start empty workout"}
      </button>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {routines.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Your routines
          </h2>
          <ul className="flex flex-col gap-2">
            {routines.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => start(r)}
                  disabled={busy}
                  className="card flex w-full items-center justify-between text-left active:bg-surface2"
                >
                  <span>
                    <span className="block font-medium">{r.name}</span>
                    <span className="block text-sm text-muted">
                      {r.routine_exercises.length} exercises
                    </span>
                  </span>
                  <span className="text-muted">→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
