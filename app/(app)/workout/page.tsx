import { ActiveWorkout } from "@/components/ActiveWorkout";
import { StartWorkout } from "@/components/StartWorkout";
import { createClient } from "@/lib/supabase/server";
import type { Exercise, WorkoutSet } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // An unfinished workout is the source of truth for "in progress", so a reload
  // or a phone restart mid-session picks up exactly where it left off.
  const { data: open } = await supabase
    .from("workouts")
    .select("id, started_at, routine_id")
    .eq("user_id", user!.id)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) {
    const { data: routines } = await supabase
      .from("routines")
      .select("id, name, routine_exercises(exercise_id, position)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    return <StartWorkout routines={routines ?? []} />;
  }

  const { data: sets } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("workout_id", open.id)
    .order("set_index")
    .returns<WorkoutSet[]>();

  // Exercises already logged, plus any still-untouched ones from the routine
  // this session was started from.
  const routineExerciseIds = open.routine_id
    ? ((
        await supabase
          .from("routine_exercises")
          .select("exercise_id")
          .eq("routine_id", open.routine_id)
          .order("position")
      ).data ?? []).map((r) => r.exercise_id)
    : [];

  const exerciseIds = [
    ...new Set([...(sets ?? []).map((s) => s.exercise_id), ...routineExerciseIds]),
  ];

  const { data: exercises } = exerciseIds.length
    ? await supabase.from("exercises").select("*").in("id", exerciseIds).returns<Exercise[]>()
    : { data: [] as Exercise[] };

  // `in` does not preserve order; restore the routine's intended sequence.
  const ordered = exerciseIds
    .map((id) => (exercises ?? []).find((e) => e.id === id))
    .filter((e): e is Exercise => e !== undefined);

  return (
    <ActiveWorkout
      workoutId={open.id}
      startedAt={open.started_at}
      initialSets={sets ?? []}
      initialExercises={ordered}
    />
  );
}
