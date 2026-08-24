/**
 * Distils the upstream exercise dataset into the English-only subset this app
 * uses, and commits it to `data/exercises.en.json`.
 *
 * Upstream is ~17 MB because it carries instructions in 10 languages; the slice
 * we keep is ~1 MB, which is small enough to vendor into the repo. Vendoring
 * means the seed is reproducible and does not depend on GitHub being reachable
 * at deploy time.
 *
 * Source: https://github.com/hasaneyldrm/exercises-dataset
 * Metadata and instruction text are MIT. The media (thumbnails and GIFs) is
 * © Gym Visual and is referenced, never copied — see the `attribution` field,
 * which is carried through verbatim and must be displayed wherever media is.
 *
 * Run with `npm run data:refresh` to pull upstream changes.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json";

/** Media lives in the same repo; the dataset stores repo-relative paths. */
export const MEDIA_BASE =
  "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/";

type UpstreamExercise = {
  id: string;
  name: string;
  category: string;
  body_part: string;
  equipment: string;
  target: string;
  muscle_group: string;
  secondary_muscles: string[];
  instructions: Record<string, string>;
  instruction_steps: Record<string, string[]>;
  image: string;
  gif_url: string;
  media_id: string;
  attribution: string;
};

export type Exercise = {
  id: string;
  name: string;
  body_part: string;
  equipment: string;
  target: string;
  secondary_muscles: string[];
  instructions: string[];
  image_url: string;
  gif_url: string;
  attribution: string;
};

async function main() {
  console.log(`Fetching ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Upstream returned ${res.status} ${res.statusText}`);

  const upstream = (await res.json()) as UpstreamExercise[];
  if (!Array.isArray(upstream) || upstream.length === 0) {
    throw new Error("Upstream payload was not a non-empty array");
  }

  const exercises: Exercise[] = upstream.map((e) => {
    const steps = e.instruction_steps?.en;
    if (!steps?.length) throw new Error(`Exercise ${e.id} has no English instructions`);
    if (!e.attribution) throw new Error(`Exercise ${e.id} is missing its attribution`);

    return {
      id: e.id,
      name: e.name,
      // `category` is identical to `body_part` in every upstream record, and
      // `muscle_group` is always just one of `secondary_muscles` — `target` is
      // the actual primary mover. Both are dropped as redundant.
      body_part: e.body_part,
      equipment: e.equipment,
      target: e.target,
      secondary_muscles: e.secondary_muscles ?? [],
      instructions: steps,
      image_url: MEDIA_BASE + e.image,
      gif_url: MEDIA_BASE + e.gif_url,
      attribution: e.attribution,
    };
  });

  const ids = new Set(exercises.map((e) => e.id));
  if (ids.size !== exercises.length) throw new Error("Upstream contains duplicate ids");

  const out = join(process.cwd(), "data", "exercises.en.json");
  writeFileSync(out, JSON.stringify(exercises));

  console.log(`Wrote ${exercises.length} exercises to data/exercises.en.json`);
  console.log(`  body parts: ${new Set(exercises.map((e) => e.body_part)).size}`);
  console.log(`  equipment:  ${new Set(exercises.map((e) => e.equipment)).size}`);
  console.log(`  targets:    ${new Set(exercises.map((e) => e.target)).size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
