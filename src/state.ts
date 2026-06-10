import { STATIONS } from './content';

export interface StationState {
  level: number;
  progress: number; // 0..1 through current cycle
}

export interface Buff {
  label: string;
  revMult: number;
  speedMult: number;
  expiresAt: number; // epoch ms
}

export type BuyAmount = 1 | 10 | 'max';

export interface Stats {
  taps: number;
  serves: number; // production cycles completed
  chaosResolved: number;
  bagsCaught: number;
  frenzies: number;
  maxCombo: number;
}

export interface GameState {
  version: number;
  cash: number;
  runEarnings: number;
  lastRunEarnings: number;
  totalEarnings: number;
  cred: number;
  rebrands: number;
  mutationId: string | null;
  stations: Record<string, StationState>;
  buffs: Buff[];
  nextEventAt: number; // epoch ms
  lastSaved: number; // epoch ms
  buyAmount: BuyAmount;
  stats: Stats;
  soundOn: boolean;
  questIndex: number;
}

export const SAVE_KEY = 'trash-panda-save-v1';

export function defaultState(): GameState {
  const stations: Record<string, StationState> = {};
  for (const def of STATIONS) stations[def.id] = { level: 0, progress: 0 };
  stations[STATIONS[0].id].level = 1;
  return {
    version: 1,
    cash: 0,
    runEarnings: 0,
    lastRunEarnings: 0,
    totalEarnings: 0,
    cred: 0,
    rebrands: 0,
    mutationId: null,
    stations,
    buffs: [],
    nextEventAt: Date.now() + 30_000,
    lastSaved: Date.now(),
    buyAmount: 1,
    stats: { taps: 0, serves: 0, chaosResolved: 0, bagsCaught: 0, frenzies: 0, maxCombo: 0 },
    soundOn: true,
    questIndex: 0,
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<GameState>;
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      stations: { ...base.stations, ...(parsed.stations ?? {}) },
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return defaultState();
  }
}

export function saveState(s: GameState): void {
  s.lastSaved = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // storage blocked or full; the run continues unsaved
  }
}
