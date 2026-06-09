import { REVIEWS, STATIONS, type ChaosEvent, type StationDef } from './content';
import { fmt } from './format';
import { CRED_BASE, EVENT_TIMEOUT_MS, type Game } from './game';
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
    <section class="rebrand">
      <div>
        <div class="rebrand-title">📈 Rebrand</div>
        <div class="rebrand-desc" id="rebrand-desc"></div>
      </div>
      <button id="rebrand-btn" class="btn-rebrand" disabled>Locked</button>
    </section>
    <div class="toolbar">
      <span>Stations</span>
      <button id="buy-toggle" class="btn-toggle"></button>
    </div>
    <section class="stations" id="stations"></section>
    <footer class="ticker">
      <span class="review" id="review"></span>
      <button class="reset" id="reset">reset</button>
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
      game.buy(def.id);
      update();
    });
    return refs;
  });

  buyToggle.addEventListener('click', () => {
    game.cycleBuyAmount();
    update();
  });

  $('#reset').addEventListener('click', () => {
    if (window.confirm('Burn it all down and start over from one dumpster?')) {
      localStorage.removeItem(SAVE_KEY);
      window.location.reload();
    }
  });

  rebrandBtn.addEventListener('click', () => {
    const gain = game.credGain();
    if (gain < 1) return;
    showMutationModal(gain);
  });

  game.onChaos = (ev: ChaosEvent, deadline: number): void => {
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
        game.rebrand(m.id);
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
        c.rev.textContent = `$${fmt(game.revenuePerCycle(c.def, mods))} / ${game.cycleTime(c.def, mods).toFixed(1)}s`;
        const count = game.buyCount(c.def, mods);
        const cost = game.bulkCost(c.def, count, mods);
        c.buy.textContent = `Up ×${count}\n$${fmt(cost)}`;
        c.buy.disabled = game.s.cash < cost;
        c.fill.style.width = `${Math.min(st.progress * 100, 100)}%`;
      }
    });
  }

  window.setInterval(update, 100);
  window.setInterval(rotateReview, 9000);
  rotateReview();
  update();

  if (game.offlineGain > 0) {
    toast(`💤 While you were gone, the raccoons kept at it: +$${fmt(game.offlineGain)}`);
  }
}
