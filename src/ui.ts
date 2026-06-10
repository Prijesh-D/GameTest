import { sfx } from './audio';
import { REVIEWS, STATIONS, type ChaosEvent, type StationDef } from './content';
import { fmt } from './format';
import { CRED_BASE, EVENT_TIMEOUT_MS, type Game } from './game';
import { Scene } from './scene';
import { SAVE_KEY } from './state';

interface CardRefs {
  def: StationDef;
  card: HTMLElement;
  fill: HTMLElement;
  lvl: HTMLElement;
  rev: HTMLElement;
  buy: HTMLButtonElement;
}

export function initUI(game: Game): void {
  const app = document.getElementById('app') as HTMLElement;
  app.innerHTML = `
    <header class="hud">
      <div class="hud-top">
        <div class="brand">🦝 Trash Panda Empire</div>
        <div class="cred" id="cred"></div>
      </div>
      <div class="cash" id="cash">$0</div>
      <div class="rps" id="rps"></div>
      <div class="chips" id="chips"></div>
    </header>
    <canvas id="scene" class="scene"></canvas>
    <section class="rebrand">
      <div>
        <div class="rebrand-title">📈 Rebrand</div>
        <div class="rebrand-desc" id="rebrand-desc"></div>
      </div>
      <button id="rebrand-btn" class="btn-rebrand" disabled>Locked</button>
    </section>
    <section class="quest">
      <div class="quest-emoji" id="quest-emoji"></div>
      <div class="quest-body">
        <div class="quest-desc" id="quest-desc"></div>
        <div class="quest-bar"><div class="quest-fill" id="quest-fill"></div></div>
      </div>
      <button id="quest-claim" class="btn-claim" style="display:none">CLAIM</button>
    </section>
    <div class="toolbar">
      <span>Stations</span>
      <span class="toolbar-btns">
        <button id="settings-btn" class="btn-toggle" title="Stats & settings">⚙️</button>
        <button id="buy-toggle" class="btn-toggle"></button>
      </span>
    </div>
    <section class="stations" id="stations"></section>
    <footer class="ticker">
      <span class="review" id="review"></span>
    </footer>
    <div id="toasts" class="toasts"></div>
    <div id="modal-root"></div>
  `;

  const $ = (sel: string): HTMLElement => app.querySelector(sel) as HTMLElement;
  const cashEl = $('#cash');
  const rpsEl = $('#rps');
  const credEl = $('#cred');
  const chipsEl = $('#chips');
  const rebrandDesc = $('#rebrand-desc');
  const rebrandBtn = $('#rebrand-btn') as HTMLButtonElement;
  const buyToggle = $('#buy-toggle') as HTMLButtonElement;
  const stationsEl = $('#stations');
  const reviewEl = $('#review');
  const toastsEl = $('#toasts');
  const modalRoot = $('#modal-root');
  const questEmoji = $('#quest-emoji');
  const questDesc = $('#quest-desc');
  const questFill = $('#quest-fill');
  const questClaim = $('#quest-claim') as HTMLButtonElement;
  const sceneCanvas = $('#scene') as HTMLCanvasElement;

  sfx.enabled = game.s.soundOn;
  const scene = new Scene(sceneCanvas, game);

  const cards: CardRefs[] = STATIONS.map((def) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <button class="art">${def.emoji}<span class="bar"><span class="fill"></span></span></button>
      <div class="info">
        <div class="name">${def.name} <span class="lvl"></span></div>
        <div class="sub rev"></div>
      </div>
      <button class="buy"></button>
    `;
    stationsEl.appendChild(card);
    const refs: CardRefs = {
      def,
      card,
      fill: card.querySelector('.fill') as HTMLElement,
      lvl: card.querySelector('.lvl') as HTMLElement,
      rev: card.querySelector('.rev') as HTMLElement,
      buy: card.querySelector('.buy') as HTMLButtonElement,
    };
    (card.querySelector('.art') as HTMLButtonElement).addEventListener('click', () => {
      const earned = game.rush(def.id);
      if (earned > 0) floater(card, `+$${fmt(earned)}`);
    });
    refs.buy.addEventListener('click', () => {
      const before = game.s.stations[def.id].level;
      game.buy(def.id);
      const after = game.s.stations[def.id].level;
      if (after > before) {
        if (before === 0) {
          sfx.unlock();
          toast(`${def.emoji} ${def.name} unlocked!`);
          scene.celebrateUnlock(def.id);
        } else {
          sfx.buy();
        }
      }
      update();
    });
    return refs;
  });

  buyToggle.addEventListener('click', () => {
    game.cycleBuyAmount();
    update();
  });

  $('#settings-btn').addEventListener('click', showSettings);

  questClaim.addEventListener('click', () => {
    const res = game.claimQuest();
    if (!res) return;
    sfx.claim();
    toast(`${res.quest.emoji} Quest complete! +$${fmt(res.reward)}`);
    scene.confettiBurst(sceneCanvas.clientWidth / 2, 90, 18);
    update();
  });

  rebrandBtn.addEventListener('click', () => {
    const gain = game.credGain();
    if (gain < 1) return;
    showMutationModal(gain);
  });

  game.onChaos = (ev: ChaosEvent, deadline: number): void => {
    sfx.chaos();
    modalRoot.innerHTML = `
      <div class="overlay"><div class="modal">
        <div class="modal-emoji">${ev.emoji}</div>
        <h2>${ev.title}</h2>
        <p>${ev.text}</p>
        <div class="choices"></div>
        <div class="countdown"><div class="countdown-fill"></div></div>
      </div></div>
    `;
    const choicesEl = modalRoot.querySelector('.choices') as HTMLElement;
    const fillEl = modalRoot.querySelector('.countdown-fill') as HTMLElement;
    let timer = 0;
    function resolve(idx: number | null): void {
      window.clearInterval(timer);
      const picked = game.resolveChaos(idx);
      modalRoot.innerHTML = '';
      if (picked) toast(`${ev.emoji} ${picked.text}`);
    }
    timer = window.setInterval(() => {
      const remain = deadline - Date.now();
      fillEl.style.width = `${Math.max(0, (remain / EVENT_TIMEOUT_MS) * 100)}%`;
      if (remain <= 0) resolve(null);
    }, 100);
    ev.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.textContent = choice.label;
      btn.addEventListener('click', () => resolve(i));
      choicesEl.appendChild(btn);
    });
  };

  function showMutationModal(gain: number): void {
    const opts = game.mutationChoices();
    modalRoot.innerHTML = `
      <div class="overlay"><div class="modal">
        <div class="modal-emoji">📈</div>
        <h2>Time to Rebrand</h2>
        <p>Cash out for <b>+${gain} 🏆 Street Cred</b> and start fresh.
           Every new era comes with a twist — pick yours.</p>
        <div class="mut-cards"></div>
        <button class="cancel">Actually, the dumpster is fine as-is</button>
      </div></div>
    `;
    const holder = modalRoot.querySelector('.mut-cards') as HTMLElement;
    for (const m of opts) {
      const el = document.createElement('button');
      el.className = 'mut-card';
      el.innerHTML = `
        <span class="mut-emoji">${m.emoji}</span>
        <span>
          <span class="mut-name">${m.name}</span>
          <span class="mut-desc">${m.desc}</span>
        </span>
      `;
      el.addEventListener('click', () => {
        scene.celebrateRebrand(m.name);
        game.rebrand(m.id);
        sfx.rebrand();
        modalRoot.innerHTML = '';
        toast(`📈 Rebranded! +${gain} 🏆 Street Cred. Welcome to the ${m.name} era.`);
        update();
      });
      holder.appendChild(el);
    }
    (modalRoot.querySelector('.cancel') as HTMLButtonElement).addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });
  }

  function showSettings(): void {
    const st = game.s.stats;
    const rows: [string, string][] = [
      ['💵 Lifetime earned', `$${fmt(game.s.totalEarnings)}`],
      ['👆 Stall taps', fmt(st.taps)],
      ['♻️ Cycles completed', fmt(st.serves)],
      ['🌀 Chaos survived', fmt(st.chaosResolved)],
      ['💰 Golden bags caught', fmt(st.bagsCaught)],
      ['⚡ Frenzies triggered', fmt(st.frenzies)],
      ['🔥 Best combo', fmt(st.maxCombo)],
      ['📈 Rebrands', fmt(game.s.rebrands)],
      ['🏆 Street Cred', fmt(game.s.cred)],
    ];
    modalRoot.innerHTML = `
      <div class="overlay"><div class="modal">
        <div class="modal-emoji">📊</div>
        <h2>Empire Records</h2>
        <div class="stats-grid">
          ${rows.map(([k, v]) => `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`).join('')}
        </div>
        <div class="choices" style="margin-top:14px">
          <button class="choice" id="sound-toggle">${game.s.soundOn ? '🔊 Sound: ON' : '🔇 Sound: OFF'}</button>
          <button class="choice danger" id="wipe-save">🗑️ Reset save (burn it all down)</button>
        </div>
        <button class="cancel">Close</button>
      </div></div>
    `;
    (modalRoot.querySelector('#sound-toggle') as HTMLButtonElement).addEventListener('click', (e) => {
      game.s.soundOn = !game.s.soundOn;
      sfx.enabled = game.s.soundOn;
      game.save();
      (e.target as HTMLButtonElement).textContent = game.s.soundOn ? '🔊 Sound: ON' : '🔇 Sound: OFF';
      if (game.s.soundOn) sfx.claim();
    });
    (modalRoot.querySelector('#wipe-save') as HTMLButtonElement).addEventListener('click', () => {
      if (window.confirm('Burn it all down and start over from one dumpster?')) {
        localStorage.removeItem(SAVE_KEY);
        window.location.reload();
      }
    });
    (modalRoot.querySelector('.cancel') as HTMLButtonElement).addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });
  }

  function toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastsEl.appendChild(el);
    window.setTimeout(() => el.classList.add('out'), 4200);
    window.setTimeout(() => el.remove(), 4800);
  }

  function floater(card: HTMLElement, text: string): void {
    const el = document.createElement('span');
    el.className = 'floater';
    el.textContent = text;
    card.appendChild(el);
    window.setTimeout(() => el.remove(), 700);
  }

  function rotateReview(): void {
    const r = REVIEWS[Math.floor(Math.random() * REVIEWS.length)];
    reviewEl.style.opacity = '0';
    window.setTimeout(() => {
      reviewEl.textContent = `${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)} ${r.name}: “${r.text}”`;
      reviewEl.style.opacity = '1';
    }, 400);
  }

  function update(): void {
    const mods = game.mods();
    cashEl.textContent = `$${fmt(game.s.cash)}`;
    rpsEl.textContent = `$${fmt(game.rps(mods))}/s · ${game.s.rebrands} rebrand${game.s.rebrands === 1 ? '' : 's'}`;
    credEl.textContent = `🏆 ${game.s.cred} cred`;
    buyToggle.textContent = `Buy ×${game.s.buyAmount === 'max' ? 'MAX' : game.s.buyAmount}`;

    const chips: string[] = [];
    const mut = game.mutation();
    if (mut) chips.push(`<span class="chip mut">${mut.emoji} ${mut.name}</span>`);
    const now = Date.now();
    for (const b of game.s.buffs) {
      const left = Math.max(0, Math.ceil((b.expiresAt - now) / 1000));
      chips.push(`<span class="chip buff">${b.label} · ${left}s</span>`);
    }
    chipsEl.innerHTML = chips.join('');

    // Quest panel
    const quest = game.currentQuest();
    if (quest) {
      const p = Math.min(quest.progress(game), quest.target);
      questEmoji.textContent = quest.emoji;
      questDesc.textContent = `${quest.desc} — ${fmt(p)}/${fmt(quest.target)}`;
      questFill.style.width = `${(p / quest.target) * 100}%`;
      questClaim.style.display = p >= quest.target ? '' : 'none';
    } else {
      questEmoji.textContent = '👑';
      questDesc.textContent = 'Empire complete. New goals coming soon.';
      questFill.style.width = '100%';
      questClaim.style.display = 'none';
    }

    const gain = game.credGain();
    rebrandBtn.disabled = gain < 1;
    if (gain >= 1) {
      rebrandBtn.textContent = `+${gain} 🏆`;
      rebrandDesc.textContent = 'Sell the empire, keep the clout. Each cred = +10% revenue, forever.';
    } else {
      rebrandBtn.textContent = 'Locked';
      rebrandDesc.textContent = `Earn $${fmt(CRED_BASE)} in one run to unlock. This run: $${fmt(game.s.runEarnings)}`;
    }

    // Show all unlocked stations plus the next locked one, hide the rest.
    let firstLocked = STATIONS.findIndex((d) => game.s.stations[d.id].level <= 0);
    if (firstLocked === -1) firstLocked = STATIONS.length - 1;
    cards.forEach((c, i) => {
      c.card.style.display = i <= firstLocked ? '' : 'none';
      const st = game.s.stations[c.def.id];
      const locked = st.level <= 0;
      c.card.classList.toggle('locked', locked);
      if (locked) {
        c.lvl.textContent = '';
        c.rev.textContent = c.def.flavor;
        const cost = game.bulkCost(c.def, 1, mods);
        c.buy.textContent = `Unlock\n$${fmt(cost)}`;
        c.buy.disabled = game.s.cash < cost;
        c.fill.style.width = '0%';
      } else {
        c.lvl.textContent = `Lv ${st.level}`;
        const nextMilestone = st.level < 25 ? 25 : st.level < 50 ? 50 : (Math.floor(st.level / 100) + 1) * 100;
        c.rev.textContent = `$${fmt(game.revenuePerCycle(c.def, mods))} / ${game.cycleTime(c.def, mods).toFixed(1)}s · ×2 @ Lv ${nextMilestone}`;
        const count = game.buyCount(c.def, mods);
        const cost = game.bulkCost(c.def, count, mods);
        c.buy.textContent = `Up ×${count}\n$${fmt(cost)}`;
        c.buy.disabled = game.s.cash < cost;
        c.fill.style.width = `${Math.min(st.progress * 100, 100)}%`;
      }
    });
  }

  new Scene($('#scene') as HTMLCanvasElement, game);

  // Desktop playtesting: keys 1-6 rush the corresponding station.
  window.addEventListener('keydown', (e) => {
    const idx = parseInt(e.key, 10) - 1;
    if (idx >= 0 && idx < STATIONS.length) {
      const def = STATIONS[idx];
      if (game.s.stations[def.id].level > 0) {
        game.rush(def.id);
        sfx.tap(game.combo);
      }
    }
  });

  window.setInterval(update, 100);
  window.setInterval(rotateReview, 9000);
  rotateReview();
  update();

  if (game.offlineGain > 0) {
    modalRoot.innerHTML = `
      <div class="overlay"><div class="modal">
        <div class="modal-emoji">💤</div>
        <h2>Welcome back, boss</h2>
        <p>The raccoons kept working while you were gone:</p>
        <div class="offline-amount">+$${fmt(game.offlineGain)}</div>
        <div class="choices"><button class="choice" id="collect-offline">Collect 🦝</button></div>
      </div></div>
    `;
    (modalRoot.querySelector('#collect-offline') as HTMLButtonElement).addEventListener('click', () => {
      modalRoot.innerHTML = '';
      sfx.claim();
      scene.confettiBurst(sceneCanvas.clientWidth / 2, 90, 14);
    });
  }
}
