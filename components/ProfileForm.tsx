"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const EMOJI = ["💪", "🏋️", "🦍", "🐺", "🔥", "🥊", "🐉", "⚡", "🧗", "🏃"];

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name);
  const [emoji, setEmoji] = useState(profile.avatar_emoji);
  const [goal, setGoal] = useState(profile.weekly_goal);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty =
    name !== profile.display_name || emoji !== profile.avatar_emoji || goal !== profile.weekly_goal;

  async function save() {
    setBusy(true);
    setSaved(false);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim(), avatar_emoji: emoji, weekly_goal: goal })
      .eq("id", profile.id);

    setBusy(false);
    if (!error) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <section className="card">
      <label className="block">
        <span className="text-sm text-muted">Name</span>
        <input
          className="field mt-1"
          value={name}
          maxLength={40}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </label>

      <div className="mt-3">
        <span className="text-sm text-muted">Avatar</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {EMOJI.map((e) => (
            <button
              key={e}
              onClick={() => {
                setEmoji(e);
                setSaved(false);
              }}
              className={`rounded-lg border px-2.5 py-1.5 text-xl ${
                emoji === e ? "border-accent bg-accentDim" : "border-border bg-surface2"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <span className="text-sm text-muted">Weekly goal</span>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={7}
            value={goal}
            onChange={(e) => {
              setGoal(Number(e.target.value));
              setSaved(false);
            }}
            className="flex-1 accent-accent"
          />
          <span className="w-24 text-right text-sm tabular-nums">
            {goal} session{goal === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Your streak and consistency score are measured against this, so pick something you&rsquo;ll
          actually hit.
        </p>
      </div>

      <button
        onClick={save}
        disabled={!dirty || busy}
        className="btn-primary mt-4 w-full"
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </section>
  );
}
