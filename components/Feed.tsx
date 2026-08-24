"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, formatVolume, timeAgo, titleCase } from "@/lib/format";
import type { FeedItem, Reaction } from "@/lib/types";

const EMOJI = ["💪", "🔥", "👏", "😤"];

export function Feed({
  initialItems,
  initialReactions,
  userId,
}: {
  initialItems: FeedItem[];
  initialReactions: Reaction[];
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(initialItems);
  const [reactions, setReactions] = useState(initialReactions);

  // Live feed: a friend finishing a session shows up without a refresh, which
  // is most of the point of having a feed at all.
  useEffect(() => {
    const channel = supabase
      .channel("feed")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workouts" },
        async (payload) => {
          const row = payload.new as { id: string; finished_at: string | null };
          if (!row.finished_at) return;

          const { data } = await supabase
            .from("workout_feed")
            .select("*")
            .eq("id", row.id)
            .maybeSingle<FeedItem>();

          // Dedupe inside the updater rather than against a captured `items`,
          // so this effect doesn't need `items` as a dependency — otherwise
          // every new card tears down and rebuilds the subscription, and
          // events land in the gap.
          if (data) {
            setItems((prev) => (prev.some((i) => i.id === data.id) ? prev : [data, ...prev]));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reactions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setReactions((prev) => [...prev, payload.new as Reaction]);
          } else if (payload.eventType === "DELETE") {
            const gone = payload.old as { id: string };
            setReactions((prev) => prev.filter((r) => r.id !== gone.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function toggleReaction(workoutId: string, emoji: string) {
    const mine = reactions.find(
      (r) => r.workout_id === workoutId && r.user_id === userId && r.emoji === emoji,
    );

    if (mine) {
      setReactions((prev) => prev.filter((r) => r.id !== mine.id));
      await supabase.from("reactions").delete().eq("id", mine.id);
    } else {
      const optimistic: Reaction = {
        id: crypto.randomUUID(),
        workout_id: workoutId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString(),
      };
      setReactions((prev) => [...prev, optimistic]);
      const { error } = await supabase.from("reactions").insert(optimistic);
      if (error) setReactions((prev) => prev.filter((r) => r.id !== optimistic.id));
    }
  }

  if (items.length === 0) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">Feed</h1>
        <p className="card text-sm text-muted">
          No workouts yet. Be the one who goes first.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Feed</h1>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const mine = reactions.filter((r) => r.workout_id === item.id);
          return (
            <li key={item.id} className="card">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{item.avatar_emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.display_name}</p>
                  <p className="text-xs text-muted">{timeAgo(item.finished_at)}</p>
                </div>
                {item.user_id === userId && (
                  <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted">
                    you
                  </span>
                )}
              </div>

              <div className="mt-3 flex gap-4 text-sm">
                <Stat label="sets" value={String(item.working_sets)} />
                <Stat label="volume" value={formatVolume(item.volume_kg)} />
                <Stat label="time" value={formatDuration(item.duration_seconds)} />
              </div>

              {item.exercise_names.length > 0 && (
                <p className="mt-2 text-sm text-muted">
                  {item.exercise_names.slice(0, 4).map(titleCase).join(" · ")}
                  {item.exercise_names.length > 4 && ` +${item.exercise_names.length - 4} more`}
                </p>
              )}

              {item.notes && <p className="mt-2 text-sm italic">&ldquo;{item.notes}&rdquo;</p>}

              <div className="mt-3 flex gap-1.5">
                {EMOJI.map((emoji) => {
                  const count = mine.filter((r) => r.emoji === emoji).length;
                  const reacted = mine.some((r) => r.emoji === emoji && r.user_id === userId);
                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(item.id, emoji)}
                      className={`rounded-full border px-2.5 py-1 text-sm ${
                        reacted
                          ? "border-accent bg-accentDim"
                          : "border-border bg-surface2"
                      }`}
                    >
                      {emoji}
                      {count > 0 && <span className="ml-1 text-xs text-muted">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-semibold tabular-nums">{value}</span>{" "}
      <span className="text-xs text-muted">{label}</span>
    </span>
  );
}
