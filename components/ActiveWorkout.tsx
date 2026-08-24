"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExercisePicker } from "@/components/ExercisePicker";
import { RestTimer } from "@/components/RestTimer";
import { createClient } from "@/lib/supabase/client";
import { deleteSet, pendingCount, saveSet, startAutoFlush, type PendingSet } from "@/lib/offline";
import { formatWeight, formatVolume, titleCase } from "@/lib/format";
import type { Exercise, LastPerformance, WorkoutSet } from "@/lib/types";

type LoggedSet = WorkoutSet & { pending?: boolean };

/** Sets grouped under the exercise they belong to, in the order first logged. */
type Block = {
  exercise: Exercise;
  sets: LoggedSet[];
  /** undefined while still loading, null once known to have no history. */
  lastTime: LastPerformance | null | undefined;
};

export function ActiveWorkout({
  workoutId,
  startedAt,
  initialSets,
  initialExercises,
}: {
  workoutId: string;
  startedAt: string;
  initialSets: WorkoutSet[];
  initialExercises: Exercise[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const [sets, setSets] = useState<LoggedSet[]>(initialSets);
  const [lastTimes, setLastTimes] = useState<Record<string, LastPerformance | null>>({});
  const [picking, setPicking] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [queued, setQueued] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Replay anything stranded by a dropped connection, then keep watching.
  useEffect(() => {
    void pendingCount().then(setQueued);
    return startAutoFlush(() => {
      void pendingCount().then(setQueued);
      router.refresh();
    });
  }, [router]);

  const blocks: Block[] = useMemo(() => {
    const order: string[] = [];
    for (const s of sets) if (!order.includes(s.exercise_id)) order.push(s.exercise_id);
    for (const e of exercises) if (!order.includes(e.id)) order.push(e.id);

    return order.flatMap<Block>((id) => {
      const exercise = exercises.find((e) => e.id === id);
      if (!exercise) return [];
      return [
        {
          exercise,
          sets: sets
            .filter((s) => s.exercise_id === id)
            .sort((a, b) => a.set_index - b.set_index),
          lastTime: lastTimes[id],
        },
      ];
    });
  }, [sets, exercises, lastTimes]);

  const totals = useMemo(() => {
    const working = sets.filter((s) => !s.is_warmup);
    return {
      sets: working.length,
      volume: working.reduce((sum, s) => sum + Number(s.weight_kg) * s.reps, 0),
    };
  }, [sets]);

  const loadLastPerformance = useCallback(
    async (exerciseId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.rpc("last_performance", {
        target_user: user.id,
        target_exercise: exerciseId,
      });

      const rows = (data ?? []) as LastPerformance[];
      setLastTimes((prev) => ({ ...prev, [exerciseId]: rows[0] ?? null }));
    },
    [supabase],
  );

  useEffect(() => {
    for (const e of exercises) {
      if (!(e.id in lastTimes)) void loadLastPerformance(e.id);
    }
  }, [exercises, lastTimes, loadLastPerformance]);

  function addExercise(exercise: Exercise) {
    setPicking(false);
    setExercises((prev) => (prev.some((e) => e.id === exercise.id) ? prev : [...prev, exercise]));
  }

  async function logSet(block: Block, weight: number, reps: number, isWarmup: boolean) {
    const set: PendingSet = {
      // Client-generated so a retry after a dropped connection upserts rather
      // than inserting a duplicate.
      id: crypto.randomUUID(),
      workout_id: workoutId,
      exercise_id: block.exercise.id,
      set_index: block.sets.length,
      weight_kg: weight,
      reps,
      rpe: null,
      is_warmup: isWarmup,
    };

    // Optimistic: the row appears instantly, then reconciles.
    setSets((prev) => [...prev, { ...set, created_at: new Date().toISOString(), pending: true }]);
    if (!isWarmup) setRestStartedAt(Date.now());

    const result = await saveSet(set);
    setSets((prev) =>
      prev.map((s) => (s.id === set.id ? { ...s, pending: result === "queued" } : s)),
    );
    if (result === "queued") void pendingCount().then(setQueued);
  }

  async function removeSet(id: string) {
    setSets((prev) => prev.filter((s) => s.id !== id));
    await deleteSet(id);
  }

  async function finish() {
    setFinishing(true);
    if (totals.sets === 0 && sets.length === 0) {
      // Nothing logged — bin the empty session rather than posting it to the feed.
      await supabase.from("workouts").delete().eq("id", workoutId);
    } else {
      await supabase
        .from("workouts")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", workoutId);
    }
    router.replace("/feed");
    router.refresh();
  }

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workout</h1>
          <p className="text-sm text-muted">
            <Elapsed since={startedAt} /> · {totals.sets} sets · {formatVolume(totals.volume)}
          </p>
        </div>
        <button onClick={finish} disabled={finishing} className="btn-primary px-4 py-2 text-sm">
          {finishing ? "…" : "Finish"}
        </button>
      </header>

      {queued > 0 && (
        <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {queued} set{queued === 1 ? "" : "s"} saved on this phone — they&rsquo;ll sync when
          you&rsquo;re back online.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {blocks.map((block) => (
          <ExerciseBlock
            key={block.exercise.id}
            block={block}
            onLog={logSet}
            onRemoveSet={removeSet}
          />
        ))}
      </div>

      <button onClick={() => setPicking(true)} className="btn-ghost mt-4 w-full">
        + Add exercise
      </button>

      {blocks.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">
          Add your first exercise to get going.
        </p>
      )}

      {picking && <ExercisePicker onPick={addExercise} onClose={() => setPicking(false)} />}
      {restStartedAt && (
        <RestTimer startedAt={restStartedAt} onDismiss={() => setRestStartedAt(null)} />
      )}
    </>
  );
}

function ExerciseBlock({
  block,
  onLog,
  onRemoveSet,
}: {
  block: Block;
  onLog: (block: Block, weight: number, reps: number, isWarmup: boolean) => void;
  onRemoveSet: (id: string) => void;
}) {
  const previous = block.sets.at(-1);
  const [weight, setWeight] = useState(() => String(previous?.weight_kg ?? ""));
  const [reps, setReps] = useState(() => String(previous?.reps ?? ""));
  const [isWarmup, setIsWarmup] = useState(false);

  // Prefill from the last set logged in this session so repeat sets are one tap.
  useEffect(() => {
    if (previous) {
      setWeight(formatWeight(previous.weight_kg));
      setReps(String(previous.reps));
    }
  }, [previous]);

  const hint =
    block.lastTime === undefined
      ? null
      : block.lastTime === null
        ? "First time logging this"
        : `Last time: ${block.lastTime.sets}×${formatWeight(block.lastTime.weight_kg)}kg × ${block.lastTime.reps}`;

  const canLog = weight !== "" && reps !== "" && Number(reps) > 0;

  return (
    <section className="card">
      <div className="mb-2 flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={block.exercise.image_url}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded bg-surface2 object-cover"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{titleCase(block.exercise.name)}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>

      {block.sets.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {block.sets.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded bg-surface2 px-3 py-1.5 text-sm"
            >
              <span className="w-6 text-muted">{s.is_warmup ? "W" : i + 1}</span>
              <span className="flex-1 tabular-nums">
                {formatWeight(s.weight_kg)}kg × {s.reps}
              </span>
              {s.pending && <span className="text-xs text-warn">pending</span>}
              <button
                onClick={() => onRemoveSet(s.id)}
                className="px-1 text-muted"
                aria-label={`Delete set ${i + 1}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Weight in kg</span>
          <input
            className="field text-center tabular-nums"
            inputMode="decimal"
            placeholder="kg"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </label>
        <span className="text-muted">×</span>
        <label className="flex-1">
          <span className="sr-only">Reps</span>
          <input
            className="field text-center tabular-nums"
            inputMode="numeric"
            placeholder="reps"
            value={reps}
            onChange={(e) => setReps(e.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <button
          onClick={() => {
            onLog(block, Number(weight), Number(reps), isWarmup);
            setIsWarmup(false);
          }}
          disabled={!canLog}
          className="btn-primary shrink-0 px-4 py-3"
        >
          Log
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={isWarmup}
          onChange={(e) => setIsWarmup(e.target.checked)}
          className="h-4 w-4 accent-current"
        />
        Warm-up set (excluded from volume and PRs)
      </label>
    </section>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  return <>{mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}</>;
}
