"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Exercise } from "@/lib/types";
import { titleCase } from "@/lib/format";

const BODY_PARTS = [
  "chest", "back", "shoulders", "upper arms", "lower arms",
  "upper legs", "lower legs", "waist", "cardio", "neck",
];

export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [results, setResults] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Not autofocused: on iOS that yanks the keyboard up before the sheet has
  // finished animating, and the list jumps under the user's thumb.
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      let q = supabase.from("exercises").select("*").order("name").limit(60);

      const term = query.trim();
      if (term) {
        // Substring match beats full-text here: people type "incline db" and
        // expect a hit, which to_tsquery would miss on the partial word.
        q = q.ilike("name", `%${term}%`);
      }
      if (bodyPart) q = q.eq("body_part", bodyPart);

      const { data } = await q.returns<Exercise[]>();
      if (!cancelled) {
        setResults(data ?? []);
        setLoading(false);
      }
    };

    const t = setTimeout(run, query ? 180 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, bodyPart, supabase]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <input
          ref={inputRef}
          className="field flex-1"
          placeholder="Search 1,324 exercises…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button onClick={onClose} className="px-2 py-2 text-sm text-muted">
          Cancel
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border p-3">
        {BODY_PARTS.map((part) => (
          <button
            key={part}
            onClick={() => setBodyPart(bodyPart === part ? null : part)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
              bodyPart === part
                ? "border-accent bg-accentDim text-accent"
                : "border-border bg-surface2 text-muted"
            }`}
          >
            {titleCase(part)}
          </button>
        ))}
      </div>

      <ul className="flex-1 overflow-y-auto overscroll-contain">
        {loading && <li className="p-4 text-sm text-muted">Searching…</li>}
        {!loading && results.length === 0 && (
          <li className="p-4 text-sm text-muted">Nothing matches that.</li>
        )}
        {results.map((ex) => (
          <li key={ex.id}>
            <button
              onClick={() => onPick(ex)}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left active:bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ex.image_url}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                className="h-11 w-11 shrink-0 rounded bg-surface2 object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{titleCase(ex.name)}</span>
                <span className="block truncate text-xs text-muted">
                  {titleCase(ex.target)} · {titleCase(ex.equipment)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
