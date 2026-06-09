// Canvas scene: a live view of the alley. Pure visualization layer — the
// engine stays the source of truth; the scene reads game state each frame
// and drains game.fxQueue for transient effects (coins, rush bursts).

import { STATIONS } from './content';
import { fmt } from './format';
import { FRENZY_DURATION_MS, type Game } from './game';

const CUSTOMERS = ['🐀', '🐦', '👵', '🦔', '🐈', '🦆', '🐸', '🐕'];
const EMOJI_FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';
const SIGN_TOP = 44; // px reserved for the wall sign
const SIDEWALK = 26; // px reserved for the customer walkway

interface Particle {
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  age: number;
  life: number;
  size: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  age: number;
  life: number;
}

interface Customer {
  emoji: string;
  x: number;
  speed: number;
  state: 'in' | 'wait' | 'out';
  targetX: number;
  waitLeft: number;
}

interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private customers: Customer[] = [];
  private jumps: number[] = STATIONS.map(() => 0);
  private nextCustomerIn = 2;
  private last = performance.now();
  private prevCombo = 0;
  private comboPop = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
  ) {
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.tap(e));
    requestAnimationFrame(() => this.frame());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.W = this.canvas.clientWidth;
    this.H = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private visibleCount(): number {
    let firstLocked = STATIONS.findIndex((d) => this.game.s.stations[d.id].level <= 0);
    if (firstLocked === -1) firstLocked = STATIONS.length - 1;
    return firstLocked + 1;
  }

  private slotRect(i: number): SlotRect {
    const cols = 3;
    const w = this.W / cols;
    const h = (this.H - SIGN_TOP - SIDEWALK) / 2;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { x: col * w + 8, y: SIGN_TOP + row * h + 4, w: w - 16, h: h - 10 };
  }

  private bagPos(): { x: number; y: number } | null {
    const bag = this.game.bag;
    if (!bag) return null;
    const p = (Date.now() - bag.spawnedAt) / bag.duration;
    return {
      x: -30 + (this.W + 60) * p,
      y: 64 + Math.sin(p * Math.PI * 4) * 18,
    };
  }

  private tap(e: PointerEvent): void {
    // Golden bag has priority over stalls.
    const bp = this.bagPos();
    if (bp && Math.hypot(e.offsetX - bp.x, e.offsetY - bp.y) < 26) {
      const got = this.game.collectBag();
      if (got) {
        if (got.jackpot) {
          this.texts.push({ x: bp.x, y: bp.y, text: '⚡ JACKPOT! FRENZY! ⚡', age: 0, life: 1.4 });
        } else {
          this.texts.push({ x: bp.x, y: bp.y, text: `+$${fmt(got.amount)}`, age: 0, life: 1.2 });
        }
        for (let i = 0; i < 6; i++) this.spawnCoin(bp.x, bp.y);
      }
      return;
    }
    const n = this.visibleCount();
    for (let i = 0; i < n; i++) {
      const r = this.slotRect(i);
      if (e.offsetX >= r.x && e.offsetX <= r.x + r.w && e.offsetY >= r.y && e.offsetY <= r.y + r.h) {
        const def = STATIONS[i];
        if (this.game.s.stations[def.id].level > 0) {
          this.game.rush(def.id);
          this.jumps[i] = performance.now() + 300;
        }
        return;
      }
    }
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.update(dt);
    this.draw(now / 1000);
    requestAnimationFrame(() => this.frame());
  }

  private spawnCoin(x: number, y: number): void {
    if (this.particles.length >= 80) return;
    this.particles.push({
      emoji: '🪙',
      x,
      y,
      vx: (Math.random() - 0.5) * 70,
      vy: -(60 + Math.random() * 50),
      gravity: 170,
      age: 0,
      life: 0.9,
      size: 13 + Math.random() * 5,
    });
  }

  private update(dt: number): void {
    const n = this.visibleCount();

    // Drain engine fx into coins / rush bursts.
    for (const fx of this.game.fxQueue.splice(0)) {
      const idx = STATIONS.findIndex((d) => d.id === fx.id);
      if (idx < 0 || idx >= n) continue;
      const r = this.slotRect(idx);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const burst = fx.kind === 'rush' ? 3 : 1;
      for (let i = 0; i < burst; i++) this.spawnCoin(cx, cy);
      if (fx.kind === 'rush') {
        this.texts.push({ x: cx, y: r.y + 6, text: `+$${fmt(fx.amount)}`, age: 0, life: 0.9 });
      }
    }

    // Sparkles while any buff is active.
    if (this.game.s.buffs.length > 0 && Math.random() < 0.08 && this.particles.length < 80) {
      this.particles.push({
        emoji: '✨',
        x: Math.random() * this.W,
        y: SIGN_TOP + Math.random() * (this.H - SIGN_TOP - SIDEWALK),
        vx: 0,
        vy: -14,
        gravity: 0,
        age: 0,
        life: 1.2,
        size: 12,
      });
    }

    // Combo pop animation tracking.
    if (this.game.combo > this.prevCombo) this.comboPop = 1;
    this.comboPop = Math.max(0, this.comboPop - dt * 4);
    this.prevCombo = this.game.combo;

    // Coin rain during frenzy.
    if (this.game.frenzyActive() && this.particles.length < 80) {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          emoji: '🪙',
          x: Math.random() * this.W,
          y: -10,
          vx: (Math.random() - 0.5) * 30,
          vy: 90 + Math.random() * 80,
          gravity: 60,
          age: 0,
          life: 1.6,
          size: 11 + Math.random() * 6,
        });
      }
    }

    for (const p of this.particles) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);

    for (const ft of this.texts) {
      ft.age += dt;
      ft.y -= 34 * dt;
    }
    this.texts = this.texts.filter((ft) => ft.age < ft.life);

    // Ambient customers: spawn rate scales with how built-out the alley is.
    const unlockedIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (this.game.s.stations[STATIONS[i].id].level > 0) unlockedIdx.push(i);
    }
    this.nextCustomerIn -= dt;
    if (this.nextCustomerIn <= 0 && this.customers.length < 8 && unlockedIdx.length > 0) {
      this.nextCustomerIn = (2 + Math.random() * 6) / Math.min(unlockedIdx.length, 4);
      const slot = unlockedIdx[Math.floor(Math.random() * unlockedIdx.length)];
      const r = this.slotRect(slot);
      this.customers.push({
        emoji: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)],
        x: -20,
        speed: 40 + Math.random() * 30,
        state: 'in',
        targetX: r.x + r.w / 2 + (Math.random() - 0.5) * 20,
        waitLeft: 1.5 + Math.random() * 3,
      });
    }
    for (const c of this.customers) {
      if (c.state === 'in') {
        c.x += c.speed * dt;
        if (c.x >= c.targetX) c.state = 'wait';
      } else if (c.state === 'wait') {
        c.waitLeft -= dt;
        if (c.waitLeft <= 0) c.state = 'out';
      } else {
        c.x += c.speed * dt;
      }
    }
    this.customers = this.customers.filter((c) => c.x < this.W + 24);
  }

  private draw(t: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.save();
    if (this.game.pending) {
      ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    }

    // Alley backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, '#1a1e27');
    grad.addColorStop(1, '#0e1015');
    ctx.fillStyle = grad;
    ctx.fillRect(-4, -4, this.W + 8, this.H + 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let y = 18; y < this.H - SIDEWALK; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.W, y);
      ctx.stroke();
    }

    // String lights
    for (let x = 18; x < this.W; x += 36) {
      ctx.fillStyle = Math.sin(t * 2 + x) > 0 ? 'rgba(251,191,36,0.9)' : 'rgba(110,231,160,0.8)';
      ctx.beginPath();
      ctx.arc(x, 10 + Math.sin(x * 0.3) * 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wall sign
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 13px system-ui, ${EMOJI_FONT}`;
    ctx.fillStyle = '#fbbf24';
    const mut = this.game.mutation();
    ctx.fillText(
      `🦝 TRASH PANDA EMPIRE${mut ? ` · ${mut.emoji} ${mut.name.toUpperCase()}` : ''}`,
      this.W / 2,
      28,
    );

    // Sidewalk
    ctx.fillStyle = '#191d24';
    ctx.fillRect(-4, this.H - SIDEWALK + 4, this.W + 8, SIDEWALK + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(0, this.H - SIDEWALK + 4);
    ctx.lineTo(this.W, this.H - SIDEWALK + 4);
    ctx.stroke();

    // Stalls
    const n = this.visibleCount();
    const mods = this.game.mods();
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const def = STATIONS[i];
      const st = this.game.s.stations[def.id];
      const r = this.slotRect(i);
      const locked = st.level <= 0;
      ctx.globalAlpha = locked ? 0.45 : 1;
      ctx.fillStyle = '#1e222b';
      ctx.strokeStyle = '#333a48';
      ctx.setLineDash(locked ? [5, 4] : []);
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `30px ${EMOJI_FONT}`;
      ctx.fillText(locked ? '🔒' : def.emoji, r.x + r.w / 2, r.y + r.h / 2 - 4);
      if (!locked) {
        ctx.font = '700 10px system-ui';
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'left';
        ctx.fillText(`Lv ${st.level}`, r.x + 7, r.y + 11);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#10131a';
        ctx.fillRect(r.x + 8, r.y + r.h - 10, r.w - 16, 4);
        ctx.fillStyle = '#6ee7a0';
        ctx.fillRect(r.x + 8, r.y + r.h - 10, (r.w - 16) * Math.min(st.progress, 1), 4);
        const bob = now < this.jumps[i] ? -7 : Math.sin(t * 4 * mods.speed + i * 1.7) * 2.5;
        ctx.font = `16px ${EMOJI_FONT}`;
        ctx.fillText('🦝', r.x + r.w - 16, r.y + r.h - 18 + bob);
      }
      ctx.globalAlpha = 1;
    }

    // Customers on the sidewalk
    ctx.font = `15px ${EMOJI_FONT}`;
    for (const c of this.customers) {
      const bob = c.state === 'wait' ? Math.sin(t * 8) * 2 : Math.sin(c.x * 0.15) * 1.5;
      ctx.fillText(c.emoji, c.x, this.H - 11 + bob);
    }

    // Particles (coins, sparkles)
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.font = `${p.size}px ${EMOJI_FONT}`;
      ctx.fillText(p.emoji, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    // Floating earnings text
    ctx.font = '800 13px system-ui';
    ctx.fillStyle = '#6ee7a0';
    for (const ft of this.texts) {
      ctx.globalAlpha = Math.max(0, 1 - ft.age / ft.life);
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    // Frenzy meter (drains during frenzy, fills with taps otherwise)
    const frenzy = this.game.frenzyActive();
    const meterY = this.H - SIDEWALK - 2;
    const fillFrac = frenzy
      ? Math.max(0, (this.game.frenzyUntil - Date.now()) / FRENZY_DURATION_MS)
      : this.game.frenzyMeter;
    ctx.fillStyle = '#10131a';
    ctx.fillRect(8, meterY, this.W - 16, 5);
    ctx.fillStyle = frenzy && Math.sin(t * 16) > 0 ? '#fff3c4' : '#fbbf24';
    ctx.fillRect(8, meterY, (this.W - 16) * Math.min(fillFrac, 1), 5);

    // Frenzy mode: golden wash + banner
    if (frenzy) {
      ctx.fillStyle = `rgba(251,191,36,${0.08 + 0.05 * Math.sin(t * 10)})`;
      ctx.fillRect(-4, -4, this.W + 8, this.H + 8);
      ctx.font = `800 ${22 + Math.sin(t * 12) * 3}px system-ui`;
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('⚡ FRENZY ⚡', this.W / 2, this.H / 2);
    }

    // Combo counter
    if (this.game.combo >= 3 && Date.now() < this.game.comboExpiresAt) {
      const scale = 1 + this.comboPop * 0.4;
      ctx.font = `800 ${Math.round(15 * scale)}px system-ui`;
      ctx.fillStyle = '#f87171';
      ctx.textAlign = 'right';
      ctx.fillText(`🔥 ${this.game.combo} COMBO ×${this.game.comboMult().toFixed(2)}`, this.W - 10, 46);
      ctx.textAlign = 'center';
    }

    // Golden bag flying across
    const bp = this.bagPos();
    if (bp) {
      ctx.fillStyle = 'rgba(251,191,36,0.18)';
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 24 + Math.sin(t * 10) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `26px ${EMOJI_FONT}`;
      ctx.fillText('💰', bp.x, bp.y);
    }

    // Idle nudge when the player hasn't tapped in a while
    if (Date.now() - this.game.lastTapAt > 10_000 && !frenzy) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 3);
      ctx.font = '700 12px system-ui';
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText('👆 tap stalls to chain combos & charge FRENZY', this.W / 2, this.H - SIDEWALK - 14);
      ctx.globalAlpha = 1;
    }

    // Chaos: the event emoji bounces over the alley while it's unresolved
    const ev = this.game.pending;
    if (ev) {
      ctx.font = `40px ${EMOJI_FONT}`;
      ctx.fillText(ev.emoji, this.W / 2, 74 + Math.sin(t * 9) * 6);
    }

    // Night Shift tint
    if (mut?.id === 'night_shift') {
      ctx.fillStyle = 'rgba(30,30,80,0.25)';
      ctx.fillRect(-4, -4, this.W + 8, this.H + 8);
      ctx.font = `18px ${EMOJI_FONT}`;
      ctx.fillText('🌙', this.W - 20, 16);
    }

    ctx.restore();
  }
}
