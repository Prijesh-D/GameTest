import './style.css';
import { Game } from './game';
import { initUI } from './ui';

const game = new Game();
initUI(game);

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  // Cap dt so a throttled background tab doesn't dump a giant step at once;
  // long absences are handled by the offline-earnings pass on load.
  const dt = Math.min((now - last) / 1000, 5);
  last = now;
  game.tick(dt);
}, 100);

setInterval(() => game.save(), 5000);
window.addEventListener('beforeunload', () => game.save());
