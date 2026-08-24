"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MESSAGES = [
  "Gym. Now. 👀",
  "Your streak is dying.",
  "I went. Your turn.",
  "Still waiting on you 🏋️",
];

export function NudgeButton({ toUserId, toName }: { toUserId: string; toName: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    setState("sending");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setState("error");

    const { error } = await supabase.from("nudges").insert({
      from_user: user.id,
      to_user: toUserId,
      message: MESSAGES[Math.floor(Math.random() * MESSAGES.length)],
    });

    setState(error ? "error" : "sent");
  }

  if (state === "sent") {
    return <span className="text-xs text-accent">nudged 👊</span>;
  }

  return (
    <button
      onClick={send}
      disabled={state === "sending"}
      aria-label={`Nudge ${toName}`}
      className="rounded-full border border-border bg-surface2 px-3 py-1.5 text-xs text-text
                 active:bg-border disabled:opacity-50"
    >
      {state === "sending" ? "…" : state === "error" ? "failed" : "nudge 👊"}
    </button>
  );
}
