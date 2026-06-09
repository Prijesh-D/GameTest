// Canvas scene: a live simulation view of the alley. Pure visualization —
// the engine stays the source of truth; the scene reads game state each
// frame and drains game.fxQueue for cycle/rush events, which it turns into
// customers being served, products handed over, and coins flying to the
// cash counter.

import { STATIONS } from './content';
import { fmt } from './format';
import { FRENZY_DURATION_MS, type Game } from './game';

const CUSTOMERS = ['🐀', '🐦', '👵', '🦔', '🐈', '🦆', '🐸', '🐕'];
const EMOTES = ['😋', '❤️', '🤑', '✨'];
const PRODUCTS: Record<string, string> = {
  dumpster: '🍕',
  crusher: '🥤',
  cauldron: '🥣',
  sorter: '🔧',
  atelier: '🖼️',
  boutique: '👜',
};
const EMOJI_FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';
const SIGN_TOP = 44; // px reserved for the wall sign
const SIDEWALK = 26; // px reserved for the walkway
const QUEUE_MAX = 3;
const SERVE_COOLDOWN_MS = 500;
const CUSTOMER_CAP = 12;

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

// A thing flying from A to B along an arc (products to customers, coins to the till).
interface Tween {
  emoji: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
  dur: number;
  arc: number;
  size: number;
}

interface Customer {
  emoji: string;
  x: number;
  y: number;
  state: 'in' | 'approach' | 'queue' | 'served' | 'leave';
  station: number; // slot index, -1 for passers-by
  queuePos: number;
  speed: number;
  servedAt: number;
  phase: number; // animation offset so walkers don't sync
}

interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function moveToward(c: { x: number; y: number }, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - c.x;
  const dy = ty - c.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= step) {
    c.x = tx;
    c.y = ty;
    return true;
  }
  c.x += (dx / dist) * step;
  c.y += (dy / dist) * step;
  return false;
}

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private tweens: Tween[] = [];
  private customers: Customer[] = [];
  private jumps: number[] = STATIONS.map(() => 0);
  private lastServeAt: number[] = STATIONS.map(() => 0);
  private boss = { x: 60, y: 150, tx: 60, ty: 150, idleUntil: 0 };
  private nextCustomerIn = 1.5;
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

  private sidewalkY(): number {
    return this.H - 12;
  }

  private queueSpot(station: number, pos: number): { x: number; y: number } {
    const r = this.slotRect(station);
    return { x: r.x + 16 + pos * 18, y: r.y + r.h - 4 };
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
          // The boss hustles over to whatever you're rushing.
          const spot = this.queueSpot(i, 0);
          this.boss.tx = spot.x + r.w * 0.5;
          this.boss.ty = spot.y;
          this.boss.idleUntil = Date.now() + 2500;
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

  private queueAt(station: number): Customer[] {
    return this.customers
      .filter((c) => c.station === station && c.state === 'queue')
      .sort((a, b) => a.queuePos - b.queuePos);
  }

  // Serve the first customer in a stall's queue: product flies over, customer
  // reacts, pays (coin flies to the till), and leaves happy.
  private serve(c: Customer, station: number): void {
    const r = this.slotRect(station);
    c.state = 'served';
    c.servedAt = Date.now();
    this.tweens.push({
      emoji: PRODUCTS[STATIONS[station].id] ?? '🗑️',
      x0: r.x + r.w / 2,
      y0: r.y + r.h / 2,
      x1: c.x,
      y1: c.y - 10,
      age: 0,
      dur: 0.35,
      arc: 16,
      size: 14,
    });
    for (const other of this.customers) {
      if (other !== c && other.station === station && other.queuePos > 0) other.queuePos--;
    }
  }

  private update(dt: number): void {
    const n = this.visibleCount();
    const now = Date.now();

    // Combo pop animation tracking.
    if (this.game.combo > this.prevCombo) this.comboPop = 1;
    this.comboPop = Math.max(0, this.comboPop - dt * 4);
    this.prevCombo = this.game.combo;

    // Engine fx → serve animations where a customer is waiting, coin pops otherwise.
    for (const fx of this.game.fxQueue.splice(0)) {
      const idx = STATIONS.findIndex((d) => d.id === fx.id);
      if (idx < 0 || idx >= n) continue;
      const r = this.slotRect(idx);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const waiting = this.queueAt(idx);
      if (waiting.length > 0 && now - this.lastServeAt[idx] > SERVE_COOLDOWN_MS) {
        this.lastServeAt[idx] = now;
        this.serve(waiting[0], idx);
      } else {
        this.spawnCoin(cx, cy);
      }
      if (fx.kind === 'rush') {
        for (let i = 0; i < 2; i++) this.spawnCoin(cx, cy);
        this.texts.push({ x: cx, y: r.y + 6, text: `+$${fmt(fx.amount)}`, age: 0, life: 0.9 });
      }
    }

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

    for (const tw of this.tweens) tw.age += dt;
    this.tweens = this.tweens.filter((tw) => tw.age < tw.dur);

    // Customer spawning: prefer stalls with queue space, else a passer-by.
    this.nextCustomerIn -= dt;
    if (this.nextCustomerIn <= 0 && this.customers.length < CUSTOMER_CAP) {
      const unlockedCount = STATIONS.filter((d, i) => i < n && this.game.s.stations[d.id].level > 0).length;
      this.nextCustomerIn = (1.2 + Math.random() * 2.5) / Math.max(Math.min(unlockedCount, 4), 1);
      const candidates: number[] = [];
      for (let i = 0; i < n; i++) {
        if (this.game.s.stations[STATIONS[i].id].level <= 0) continue;
        const heading = this.customers.filter((c) => c.station === i && c.state !== 'leave').length;
        if (heading < QUEUE_MAX) candidates.push(i);
      }
      const emoji = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
      if (candidates.length > 0 && Math.random() > 0.25) {
        const station = candidates[Math.floor(Math.random() * candidates.length)];
        const queuePos = this.customers.filter((c) => c.station === station && c.state !== 'leave').length;
        this.customers.push({
          emoji,
          x: -20,
          y: this.sidewalkY(),
          state: 'in',
          station,
          queuePos,
          speed: 55 + Math.random() * 30,
          servedAt: 0,
          phase: Math.random() * 10,
        });
      } else if (unlockedCount > 0) {
        // Window shopper: strolls through without buying.
        this.customers.push({
          emoji,
          x: -20,
          y: this.sidewalkY(),
          state: 'leave',
          station: -1,
          queuePos: 0,
          speed: 40 + Math.random() * 35,
          servedAt: 0,
          phase: Math.random() * 10,
        });
      }
    }

    // Customer state machine.
    for (const c of this.customers) {
      // If the run was rebranded under them, head home.
      if (c.station >= 0 && this.game.s.stations[STATIONS[c.station].id].level <= 0) {
        c.station = -1;
        c.state = 'leave';
      }
      switch (c.state) {
        case 'in': {
          const spot = this.queueSpot(c.station, c.queuePos);
          if (moveToward(c, spot.x, this.sidewalkY(), c.speed, dt)) c.state = 'approach';
          break;
        }
        case 'approach': {
          const spot = this.queueSpot(c.station, c.queuePos);
          if (moveToward(c, spot.x, spot.y, c.speed * 0.8, dt)) c.state = 'queue';
          break;
        }
        case 'queue': {
          const spot = this.queueSpot(c.station, c.queuePos);
          moveToward(c, spot.x, spot.y, c.speed * 0.8, dt);
          break;
        }
        case 'served': {
          if (now - c.servedAt > 500) {
            this.texts.push({
              x: c.x,
              y: c.y - 18,
              text: EMOTES[Math.floor(Math.random() * EMOTES.length)],
              age: 0,
              life: 0.8,
            });
            // Payment: coin flies from the customer up to the cash counter.
            this.tweens.push({
              emoji: '🪙',
              x0: c.x,
              y0: c.y,
              x1: 24,
              y1: -16,
              age: 0,
              dur: 0.6,
              arc: 30,
              size: 13,
            });
            c.state = 'leave';
          }
          break;
        }
        case 'leave': {
          if (Math.abs(c.y - this.sidewalkY()) > 2) {
            moveToward(c, c.x + 14, this.sidewalkY(), c.speed, dt);
          } else {
            c.x += c.speed * dt;
          }
          break;
        }
      }
    }
    this.customers = this.customers.filter((c) => c.x < this.W + 24);

    // Boss raccoon: runs between stalls, inspecting the empire.
    const atTarget = Math.hypot(this.boss.x - this.boss.tx, this.boss.y - this.boss.ty) < 2;
    if (!atTarget) {
      moveToward(this.boss, this.boss.tx, this.boss.ty, 85, dt);
    } else if (now > this.boss.idleUntil) {
      const unlockedIdx: number[] = [];
      for (let i = 0; i < n; i++) {
        if (this.game.s.stations[STATIONS[i].id].level > 0) unlockedIdx.push(i);
      }
      if (unlockedIdx.length > 0) {
        const slot = unlockedIdx[Math.floor(Math.random() * unlockedIdx.length)];
        const r = this.slotRect(slot);
        this.boss.tx = r.x + r.w / 2 + (Math.random() - 0.5) * 30;
        this.boss.ty = r.y + r.h - 4;
        this.boss.idleUntil = now + 2000 + Math.random() * 3000;
      }
    }
  }

  private drawShadow(x: number, y: number, w: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, w, w * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCharacter(emoji: string, x: number, y: number, size: number, rock: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rock);
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
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
    const pnow = performance.now();
    const now = Date.now();
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
      // Stall emoji pulses when it just served someone.
      const servePulse = Math.max(0, 1 - (now - this.lastServeAt[i]) / 200);
      ctx.font = `${30 + servePulse * 6}px ${EMOJI_FONT}`;
      ctx.fillText(locked ? '🔒' : def.emoji, r.x + r.w / 2, r.y + r.h / 2 - 6);
      if (!locked) {
        ctx.font = '700 10px system-ui';
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'left';
        ctx.fillText(`Lv ${st.level}`, r.x + 7, r.y + 11);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#10131a';
        ctx.fillRect(r.x + 8, r.y + r.h - 8, r.w - 16, 4);
        ctx.fillStyle = '#6ee7a0';
        ctx.fillRect(r.x + 8, r.y + r.h - 8, (r.w - 16) * Math.min(st.progress, 1), 4);
        const bob = pnow < this.jumps[i] ? -7 : Math.sin(t * 4 * mods.speed + i * 1.7) * 2.5;
        ctx.font = `16px ${EMOJI_FONT}`;
        ctx.fillText('🦝', r.x + r.w - 16, r.y + r.h - 18 + bob);
      }
      ctx.globalAlpha = 1;
    }

    // Boss raccoon (top hat, important)
    const bossMoving = Math.hypot(this.boss.x - this.boss.tx, this.boss.y - this.boss.ty) > 2;
    const bossRock = bossMoving ? Math.sin(t * 14) * 0.12 : 0;
    const bossBob = bossMoving ? 0 : Math.sin(t * 3) * 1.5;
    this.drawShadow(this.boss.x, this.boss.y, 9);
    this.drawCharacter('🦝', this.boss.x, this.boss.y - 8 + bossBob, 19, bossRock);
    this.drawCharacter('🎩', this.boss.x + bossRock * 14, this.boss.y - 21 + bossBob, 11, bossRock);

    // Customers
    for (const c of this.customers) {
      const walking = c.state === 'in' || c.state === 'approach' || c.state === 'leave';
      const rock = walking ? Math.sin(t * 12 + c.phase) * 0.12 : 0;
      const bob = walking ? 0 : Math.sin(t * 4 + c.phase) * 1.5;
      this.drawShadow(c.x, c.y, 7);
      this.drawCharacter(c.emoji, c.x, c.y - 7 + bob, 15, rock);
      // Waiting customers daydream about the product.
      if (c.state === 'queue') {
        ctx.globalAlpha = 0.85;
        ctx.font = `10px ${EMOJI_FONT}`;
        ctx.fillText(PRODUCTS[STATIONS[c.station].id] ?? '🗑️', c.x + 7, c.y - 20 + Math.sin(t * 3 + c.phase) * 1.5);
        ctx.globalAlpha = 1;
      }
    }

    // Flying tweens (products, payments)
    for (const tw of this.tweens) {
      const p = Math.min(tw.age / tw.dur, 1);
      const ease = p * (2 - p); // ease-out
      const x = tw.x0 + (tw.x1 - tw.x0) * ease;
      const y = tw.y0 + (tw.y1 - tw.y0) * ease - Math.sin(p * Math.PI) * tw.arc;
      ctx.font = `${tw.size}px ${EMOJI_FONT}`;
      ctx.fillText(tw.emoji, x, y);
    }

    // Particles (coins, sparkles)
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.font = `${p.size}px ${EMOJI_FONT}`;
      ctx.fillText(p.emoji, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    // Floating text (earnings, emotes)
    ctx.font = '800 13px system-ui';
    ctx.fillStyle = '#6ee7a0';
    for (const ft of this.texts) {
      ctx.globalAlpha = Math.max(0, 1 - ft.age / ft.life);
      ctx.font = ft.text.startsWith('+$') ? '800 13px system-ui' : `14px ${EMOJI_FONT}`;
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
