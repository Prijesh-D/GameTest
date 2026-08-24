"use client";

import { useState } from "react";
import Link from "next/link";
import { formatVolume } from "@/lib/format";
import type { LeaderboardPeriod, LeaderboardRow } from "@/lib/types";

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

const METRICS = [
  { key: "sessions", label: "Sessions" },
  { key: "volume_kg", label: "Volume" },
  { key: "goal_rate", label: "Consistency" },
] as const;

type Metric = (typeof METRICS)[number]["key"];

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({
  rows,
  period,
  userId,
}: {
  rows: LeaderboardRow[];
  period: LeaderboardPeriod;
  userId: string;
}) {
  const [metric, setMetric] = useState<Metric>("sessions");

  const sorted = [...rows].sort((a, b) => Number(b[metric]) - Number(a[metric]));

  const display = (row: LeaderboardRow) => {
    if (metric === "sessions") return `${row.sessions}`;
    if (metric === "volume_kg") return formatVolume(Number(row.volume_kg));
    return `${Math.round(Number(row.goal_rate) * 100)}%`;
  };

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Leaderboard</h1>

      <div className="mb-3 flex gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/leaderboard?period=${p.key}`}
            scroll={false}
            className={`flex-1 rounded-lg border px-2 py-2 text-center text-xs ${
              period === p.key
                ? "border-accent bg-accentDim text-accent"
                : "border-border bg-surface2 text-muted"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex gap-1.5">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
              metric === m.key ? "bg-border text-text" : "text-muted"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {sorted.map((row, i) => (
          <li
            key={row.user_id}
            className={`card flex items-center gap-3 py-3 ${
              row.user_id === userId ? "border-accent/50" : ""
            }`}
          >
            <span className="w-6 text-center text-sm text-muted">
              {MEDALS[i] ?? i + 1}
            </span>
            <span className="text-2xl">{row.avatar_emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.display_name}</p>
              {row.streak > 0 && (
                <p className="text-xs text-muted">🔥 {row.streak} week streak</p>
              )}
            </div>
            <span className="text-lg font-bold tabular-nums">{display(row)}</span>
          </li>
        ))}
      </ul>

      {metric === "goal_rate" && (
        <p className="mt-4 text-center text-xs text-muted">
          Consistency is the share of weeks you hit your own goal — so it&rsquo;s fair whether your
          target is 2 or 6 sessions.
        </p>
      )}
    </>
  );
}
