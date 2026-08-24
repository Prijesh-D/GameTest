"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/format";

const PRESETS = [60, 90, 120, 180];

export function RestTimer({ startedAt, onDismiss }: { startedAt: number; onDismiss: () => void }) {
  const [target, setTarget] = useState(90);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Derived from wall-clock rather than a decrementing counter, so the timer
  // stays correct when iOS suspends timers on a backgrounded PWA.
  const elapsed = Math.floor((now - startedAt) / 1000);
  const remaining = target - elapsed;
  const done = remaining <= 0;

  return (
    <div
      className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-lg px-4"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className={`flex items-center gap-3 rounded-xl border p-3 shadow-lg ${
          done ? "border-accent bg-accentDim" : "border-border bg-surface2"
        }`}
      >
        <span className={`text-2xl font-bold tabular-nums ${done ? "text-accent" : "text-text"}`}>
          {done ? "Go" : formatClock(remaining)}
        </span>

        <div className="flex flex-1 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setTarget(p)}
              className={`flex-1 rounded px-1 py-1.5 text-xs ${
                target === p ? "bg-border text-text" : "text-muted"
              }`}
            >
              {p < 120 ? `${p}s` : `${p / 60}m`}
            </button>
          ))}
        </div>

        <button onClick={onDismiss} className="px-2 text-sm text-muted" aria-label="Dismiss rest timer">
          ✕
        </button>
      </div>
    </div>
  );
}
