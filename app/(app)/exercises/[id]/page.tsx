import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Exercise } from "@/lib/types";
import { titleCase } from "@/lib/format";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: exercise } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", id)
    .maybeSingle<Exercise>();

  if (!exercise) notFound();

  return (
    <>
      <Link href="/workout" className="mb-3 inline-block text-sm text-muted">
        ← Back
      </Link>

      <h1 className="text-2xl font-bold">{titleCase(exercise.name)}</h1>
      <p className="mt-1 text-sm text-muted">
        {titleCase(exercise.target)} · {titleCase(exercise.equipment)} ·{" "}
        {titleCase(exercise.body_part)}
      </p>

      {/*
        Rendered at its native 180x180 and never resized or proxied — the media
        licence permits that resolution only. Plain <img> rather than next/image
        for the same reason: no optimizer in the path.
        eslint-disable-next-line @next/next/no-img-element
      */}
      <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={exercise.gif_url}
          alt={`Animated demonstration of ${exercise.name}`}
          width={180}
          height={180}
          className="h-[180px] w-[180px]"
        />
      </div>

      <p className="mt-2 text-center text-xs text-muted">
        <a href="https://gymvisual.com/" target="_blank" rel="noopener noreferrer" className="underline">
          {exercise.attribution}
        </a>
      </p>

      {exercise.secondary_muscles.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Also works: {exercise.secondary_muscles.map(titleCase).join(", ")}
        </p>
      )}

      {exercise.instructions.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            How to do it
          </h2>
          <ol className="flex flex-col gap-2">
            {exercise.instructions.map((step, i) => (
              <li key={i} className="card flex gap-3 py-3 text-sm">
                <span className="font-bold text-accent">{i + 1}</span>
                <span className="flex-1">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
