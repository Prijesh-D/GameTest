// Synthesized sound effects via Web Audio — no asset files. The context is
// created lazily on first play so it always starts from a user gesture.

class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Tap pitch rises with the combo — the audio IS the combo feedback. */
  tap(combo: number): void {
    this.tone(280 + Math.min(combo, 24) * 22, 0.07, 'square', 0.035);
  }

  coin(): void {
    this.tone(880, 0.08, 'sine', 0.03, 1500);
  }

  serve(): void {
    this.tone(620, 0.06, 'triangle', 0.035, 900);
  }

  buy(): void {
    this.tone(200, 0.09, 'triangle', 0.05, 320);
  }

  unlock(): void {
    this.tone(523, 0.1, 'triangle', 0.05);
    this.tone(659, 0.1, 'triangle', 0.05, undefined, 0.09);
    this.tone(784, 0.14, 'triangle', 0.05, undefined, 0.18);
  }

  chaos(): void {
    this.tone(440, 0.15, 'sawtooth', 0.04, 330);
    this.tone(440, 0.15, 'sawtooth', 0.04, 330, 0.18);
  }

  frenzy(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.04, undefined, i * 0.07));
  }

  bag(): void {
    this.tone(300, 0.25, 'sine', 0.05, 1200);
  }

  rebrand(): void {
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.05, undefined, i * 0.09));
  }

  claim(): void {
    this.tone(700, 0.08, 'sine', 0.04, 1000);
    this.tone(1000, 0.1, 'sine', 0.04, undefined, 0.08);
  }
}

export const sfx = new Sfx();
