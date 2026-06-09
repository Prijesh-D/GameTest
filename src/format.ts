const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    return n < 100 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  }
  const tier = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
  const scaled = n / Math.pow(10, tier * 3);
  return (scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)) + SUFFIXES[tier];
}
