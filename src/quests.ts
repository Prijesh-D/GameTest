// Sequential goal chain — doubles as the tutorial. Progress functions read
// live game state; rewards are flat cash early, income-seconds later so they
// stay relevant at any scale.

import type { Game } from './game';

export interface Quest {
  desc: string;
  emoji: string;
  target: number;
  progress: (g: Game) => number;
  rewardFlat?: number;
  rewardSeconds?: number;
}

export const QUESTS: Quest[] = [
  { desc: 'Earn your first $200', emoji: '💵', target: 200, progress: (g) => g.s.totalEarnings, rewardFlat: 150 },
  { desc: 'Tap stalls 20 times', emoji: '👆', target: 20, progress: (g) => g.s.stats.taps, rewardFlat: 250 },
  { desc: 'Unlock the Can Crusher', emoji: '🥫', target: 1, progress: (g) => (g.s.stations.crusher.level >= 1 ? 1 : 0), rewardSeconds: 45 },
  { desc: 'Hit a 5 COMBO', emoji: '🔥', target: 5, progress: (g) => g.s.stats.maxCombo, rewardSeconds: 30 },
  { desc: 'Survive 3 chaos events', emoji: '📋', target: 3, progress: (g) => g.s.stats.chaosResolved, rewardSeconds: 60 },
  { desc: 'Catch a golden bag', emoji: '💰', target: 1, progress: (g) => g.s.stats.bagsCaught, rewardSeconds: 45 },
  { desc: 'Trigger a FRENZY', emoji: '⚡', target: 1, progress: (g) => g.s.stats.frenzies, rewardSeconds: 60 },
  { desc: 'Dumpster Dive to Lv 25', emoji: '🗑️', target: 25, progress: (g) => g.s.stations.dumpster.level, rewardSeconds: 60 },
  { desc: 'Unlock the Compost Cauldron', emoji: '🫧', target: 1, progress: (g) => (g.s.stations.cauldron.level >= 1 ? 1 : 0), rewardSeconds: 60 },
  { desc: 'Complete 300 production cycles', emoji: '♻️', target: 300, progress: (g) => g.s.stats.serves, rewardSeconds: 75 },
  { desc: 'Earn $25K', emoji: '💸', target: 25_000, progress: (g) => g.s.totalEarnings, rewardSeconds: 60 },
  { desc: 'Hit a 15 COMBO', emoji: '🔥', target: 15, progress: (g) => g.s.stats.maxCombo, rewardSeconds: 75 },
  { desc: 'Rebrand for the first time', emoji: '📈', target: 1, progress: (g) => g.s.rebrands, rewardSeconds: 90 },
  { desc: 'Unlock the Scrap Sorter', emoji: '🔩', target: 1, progress: (g) => (g.s.stations.sorter.level >= 1 ? 1 : 0), rewardSeconds: 90 },
  { desc: 'Survive 10 chaos events', emoji: '🌀', target: 10, progress: (g) => g.s.stats.chaosResolved, rewardSeconds: 90 },
  { desc: 'Earn 5 Street Cred', emoji: '🏆', target: 5, progress: (g) => g.s.cred, rewardSeconds: 120 },
  { desc: 'Unlock the Upcycling Atelier', emoji: '🎨', target: 1, progress: (g) => (g.s.stations.atelier.level >= 1 ? 1 : 0), rewardSeconds: 120 },
  { desc: 'Earn $1M', emoji: '💎', target: 1_000_000, progress: (g) => g.s.totalEarnings, rewardSeconds: 120 },
  { desc: 'Unlock the Garbage Boutique', emoji: '🛍️', target: 1, progress: (g) => (g.s.stations.boutique.level >= 1 ? 1 : 0), rewardSeconds: 180 },
  { desc: 'Earn $100M — true empire status', emoji: '👑', target: 100_000_000, progress: (g) => g.s.totalEarnings, rewardSeconds: 240 },
];
