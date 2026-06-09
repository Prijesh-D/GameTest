import {
  CHAOS_EVENTS,
  MUTATIONS,
  STATIONS,
  type ChaosEvent,
  type Mutation,
  type Outcome,
  type StationDef,
  type WeightedOutcome,
} from './content';
import { loadState, saveState, type BuyAmount, type GameState } from './state';

// Combined modifiers from street cred + active mutation + temporary buffs.
export interface Mods {
  rev: number;
  speed: number;
  cost: number;
  growthAdd: number;
  eventFreq: number;
  tap: number;
  cred: number;
  startCashPct: number;
}

export const CRED_BASE = 25_000; // run earnings needed for the first cred
export const EVENT_TIMEOUT_MS = 12_000;
const EVENT_MIN_GAP_SEC = 50;
const EVENT_MAX_GAP_SEC = 100;
const EVENT_EARNINGS_FLOOR = 50; // no chaos until the run is underway
const OFFLINE_RATE = 0.4;
const OFFLINE_CAP_SEC = 8 * 3600;

function pickWeighted(items: WeightedOutcome[]): WeightedOutcome {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// Transient visual events the scene renderer drains each frame.
export interface Fx {
  id: string;
  amount: number;
  kind: 'cycle' | 'rush';
}

export class Game {
  s: GameState;
  pending: ChaosEvent | null = null;
  eventDeadline = 0;
  readonly offlineGain: number;
  onChaos: ((ev: ChaosEvent, deadline: number) => void) | null = null;
  fxQueue: Fx[] = [];
  private lastEventId = '';

  constructor() {
    this.s = loadState();
    const elapsedSec = (Date.now() - this.s.lastSaved) / 1000;
    const rps = this.rps();
    if (elapsedSec > 60 && rps > 0) {
      this.offlineGain = rps * Math.min(elapsedSec, OFFLINE_CAP_SEC) * OFFLINE_RATE;
      this.earn(this.offlineGain);
    } else {
      this.offlineGain = 0;
    }
  }

  save(): void {
    saveState(this.s);
  }

  mutation(): Mutation | null {
    return MUTATIONS.find((m) => m.id === this.s.mutationId) ?? null;
  }

  mods(): Mods {
    const m: Mods = {
      rev: 1 + this.s.cred * 0.1,
      speed: 1,
      cost: 1,
      growthAdd: 0,
      eventFreq: 1,
      tap: 0,
      cred: 1,
      startCashPct: 0,
    };
    const mut = this.mutation();
    if (mut) {
      m.rev *= mut.mods.revMult ?? 1;
      m.speed *= mut.mods.speedMult ?? 1;
      m.cost *= mut.mods.costMult ?? 1;
      m.growthAdd += mut.mods.costGrowthAdd ?? 0;
      m.eventFreq *= mut.mods.eventFreqMult ?? 1;
      m.tap = mut.mods.tapMult ?? 0;
      m.cred *= mut.mods.credMult ?? 1;
      m.startCashPct = mut.mods.startCashPct ?? 0;
    }
    const now = Date.now();
    for (const b of this.s.buffs) {
      if (b.expiresAt > now) {
        m.rev *= b.revMult;
        m.speed *= b.speedMult;
      }
    }
    return m;
  }

  // Milestones: revenue doubles at level 25, 50, and every 100 levels.
  milestoneMult(level: number): number {
    let count = 0;
    if (level >= 25) count++;
    if (level >= 50) count++;
    count += Math.floor(level / 100);
    return Math.pow(2, count);
  }

  revenuePerCycle(def: StationDef, mods: Mods = this.mods()): number {
    const st = this.s.stations[def.id];
    if (st.level <= 0) return 0;
    return def.baseRevenue * st.level * this.milestoneMult(st.level) * mods.rev;
  }

  cycleTime(def: StationDef, mods: Mods = this.mods()): number {
    return def.cycleTime / mods.speed;
  }

  rps(mods: Mods = this.mods()): number {
    let total = 0;
    for (const def of STATIONS) {
      if (this.s.stations[def.id].level <= 0) continue;
      total += this.revenuePerCycle(def, mods) / this.cycleTime(def, mods);
    }
    return total;
  }

  // How many levels a buy click purchases right now (locked stations unlock 1).
  buyCount(def: StationDef, mods: Mods = this.mods()): number {
    const st = this.s.stations[def.id];
    if (st.level === 0) return 1;
    if (this.s.buyAmount !== 'max') return this.s.buyAmount;
    const g = def.costGrowth + mods.growthAdd;
    let next = def.baseCost * mods.cost * Math.pow(g, st.level);
    let budget = this.s.cash;
    let count = 0;
    while (budget >= next && count < 1000) {
      budget -= next;
      next *= g;
      count++;
    }
    return Math.max(count, 1);
  }

  bulkCost(def: StationDef, count: number, mods: Mods = this.mods()): number {
    const g = def.costGrowth + mods.growthAdd;
    const from = this.s.stations[def.id].level;
    return (def.baseCost * mods.cost * Math.pow(g, from) * (Math.pow(g, count) - 1)) / (g - 1);
  }

  buy(id: string): void {
    const def = STATIONS.find((d) => d.id === id);
    if (!def) return;
    const mods = this.mods();
    const count = this.buyCount(def, mods);
    const cost = this.bulkCost(def, count, mods);
    if (this.s.cash < cost) return;
    this.s.cash -= cost;
    this.s.stations[id].level += count;
  }

  // Tap-rush: instantly complete the current cycle (plus any mutation tap bonus).
  rush(id: string): number {
    const def = STATIONS.find((d) => d.id === id);
    if (!def) return 0;
    const st = this.s.stations[id];
    if (st.level <= 0) return 0;
    const mods = this.mods();
    const earned = this.revenuePerCycle(def, mods) * (1 + mods.tap);
    st.progress = 0;
    this.earn(earned);
    this.pushFx(id, earned, 'rush');
    return earned;
  }

  cycleBuyAmount(): void {
    const order: BuyAmount[] = [1, 10, 'max'];
    this.s.buyAmount = order[(order.indexOf(this.s.buyAmount) + 1) % order.length];
  }

  tick(dtSec: number): void {
    const now = Date.now();
    this.s.buffs = this.s.buffs.filter((b) => b.expiresAt > now);
    const mods = this.mods();
    for (const def of STATIONS) {
      const st = this.s.stations[def.id];
      if (st.level <= 0) continue;
      st.progress += dtSec / this.cycleTime(def, mods);
      if (st.progress >= 1) {
        const cycles = Math.floor(st.progress);
        st.progress -= cycles;
        const earned = this.revenuePerCycle(def, mods) * cycles;
        this.earn(earned);
        this.pushFx(def.id, earned, 'cycle');
      }
    }
    if (!this.pending && now >= this.s.nextEventAt && this.s.runEarnings >= EVENT_EARNINGS_FLOOR) {
      this.fireChaos(now);
    }
  }

  resolveChaos(choiceIdx: number | null): WeightedOutcome | null {
    const ev = this.pending;
    if (!ev) return null;
    const picked = choiceIdx === null ? ev.timeout : pickWeighted(ev.choices[choiceIdx].results);
    this.applyOutcome(picked.outcome);
    this.pending = null;
    const gapSec =
      (EVENT_MIN_GAP_SEC + Math.random() * (EVENT_MAX_GAP_SEC - EVENT_MIN_GAP_SEC)) /
      this.mods().eventFreq;
    this.s.nextEventAt = Date.now() + gapSec * 1000;
    return picked;
  }

  credGain(): number {
    return Math.floor(Math.sqrt(this.s.runEarnings / CRED_BASE) * this.mods().cred);
  }

  // Two random mutations offered at each rebrand.
  mutationChoices(): Mutation[] {
    const shuffled = [...MUTATIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }

  rebrand(mutationId: string): void {
    const gain = this.credGain();
    if (gain < 1) return;
    const startPct = MUTATIONS.find((m) => m.id === mutationId)?.mods.startCashPct ?? 0;
    this.s.cred += gain;
    this.s.rebrands += 1;
    this.s.lastRunEarnings = this.s.runEarnings;
    this.s.runEarnings = 0;
    this.s.mutationId = mutationId;
    this.s.buffs = [];
    this.s.cash = this.s.lastRunEarnings * startPct;
    for (const def of STATIONS) this.s.stations[def.id] = { level: 0, progress: 0 };
    this.s.stations[STATIONS[0].id].level = 1;
    this.s.nextEventAt = Date.now() + 75_000;
    this.pending = null;
    this.save();
  }

  private pushFx(id: string, amount: number, kind: 'cycle' | 'rush'): void {
    if (this.fxQueue.length < 60) this.fxQueue.push({ id, amount, kind });
  }

  private earn(amount: number): void {
    this.s.cash += amount;
    this.s.runEarnings += amount;
    this.s.totalEarnings += amount;
  }

  private fireChaos(now: number): void {
    const pool = CHAOS_EVENTS.filter((e) => e.id !== this.lastEventId);
    const ev = pool[Math.floor(Math.random() * pool.length)];
    this.lastEventId = ev.id;
    this.pending = ev;
    this.eventDeadline = now + EVENT_TIMEOUT_MS;
    if (this.onChaos) this.onChaos(ev, this.eventDeadline);
  }

  private applyOutcome(o: Outcome): void {
    if (o.cashSeconds) {
      this.earn(Math.max(this.rps(), 1) * o.cashSeconds);
    }
    if (o.cashPct) {
      if (o.cashPct > 0) this.earn(this.s.cash * o.cashPct);
      else this.s.cash = Math.max(0, this.s.cash * (1 + o.cashPct));
    }
    if (o.buff) {
      this.s.buffs.push({
        label: o.buff.label,
        revMult: o.buff.revMult ?? 1,
        speedMult: o.buff.speedMult ?? 1,
        expiresAt: Date.now() + o.buff.durationSec * 1000,
      });
    }
  }
}
