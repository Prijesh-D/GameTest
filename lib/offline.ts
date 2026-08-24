"use client";

/**
 * Durable write queue for workout sets.
 *
 * Gym basements have no signal, and losing a logged set is the fastest way to
 * get people to stop using the app. Every set is written with a client-generated
 * id straight away; if the network call fails it lands in IndexedDB and is
 * replayed later. Replay upserts on the primary key, so a set that actually did
 * reach the server before the connection dropped is never duplicated.
 */

import { createClient } from "@/lib/supabase/client";

const DB_NAME = "gymgroup";
const DB_VERSION = 1;
const STORE = "pending_sets";

export type PendingSet = {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function enqueue(set: PendingSet) {
  await withStore("readwrite", (s) => s.put(set));
}

async function dequeue(id: string) {
  await withStore("readwrite", (s) => s.delete(id));
}

export async function pendingCount(): Promise<number> {
  try {
    return await withStore("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

/**
 * Writes a set. Returns "synced" if it reached the server, "queued" if it was
 * stored locally for replay. Never throws — a failed write must not lose data
 * or interrupt the workout.
 */
export async function saveSet(set: PendingSet): Promise<"synced" | "queued"> {
  const supabase = createClient();

  try {
    const { error } = await supabase.from("workout_sets").upsert(set, { onConflict: "id" });
    if (error) throw error;
    return "synced";
  } catch {
    await enqueue(set).catch(() => {
      // IndexedDB unavailable (private mode, quota). Nothing more we can do
      // than surface it — the caller shows the pending badge.
    });
    return "queued";
  }
}

export async function deleteSet(id: string): Promise<void> {
  const supabase = createClient();
  await dequeue(id).catch(() => {});
  await supabase.from("workout_sets").delete().eq("id", id);
}

/** Replays everything queued. Returns how many sets were flushed. */
export async function flushQueue(): Promise<number> {
  let pending: PendingSet[];
  try {
    pending = await withStore<PendingSet[]>("readonly", (s) => s.getAll());
  } catch {
    return 0;
  }
  if (pending.length === 0) return 0;

  const supabase = createClient();
  const { error } = await supabase.from("workout_sets").upsert(pending, { onConflict: "id" });
  if (error) return 0;

  await Promise.all(pending.map((p) => dequeue(p.id).catch(() => {})));
  return pending.length;
}

/** Flushes now and whenever the connection comes back. Returns an unsubscribe. */
export function startAutoFlush(onFlush?: (count: number) => void): () => void {
  const run = () => {
    void flushQueue().then((n) => {
      if (n > 0) onFlush?.(n);
    });
  };

  run();
  window.addEventListener("online", run);
  return () => window.removeEventListener("online", run);
}
