// hud.js — everything drawn over the 3D scene: cash, debt, wanted stars, health,
// the objective line, the minimap (roads, sea, player arrow, mission blip, police
// dots), the speedometer, mission banners and message toasts, plus the title,
// pause and busted screens. All English, all high contrast for the screenshots.

import { money } from './util.js';

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      cash: document.getElementById('cash'),
      debt: document.getElementById('debt'),
      stars: document.getElementById('stars'),
      healthfill: document.getElementById('healthfill'),
      healthnum: document.getElementById('healthnum'),
      objtext: document.getElementById('objtext'),
      objsub: document.getElementById('objsub'),
      minimap: document.getElementById('minimap'),
      speed: document.getElementById('speed'),
      carname: document.getElementById('carname'),
      banner: document.getElementById('banner'),
      toast: document.getElementById('toast'),
      title: document.getElementById('title'),
      pause: document.getElementById('pause'),
      busted: document.getElementById('busted'),
      status: document.getElementById('status'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this._bannerT = 0;
    this._toastT = 0;
    this._lastStars = -1;
  }

  showHud(on) { this.el.hud.classList.toggle('on', on); }
  showTitle(on) { this.el.title.style.display = on ? 'flex' : 'none'; }
  showPause(on) { this.el.pause.style.display = on ? 'flex' : 'none'; }
  showBusted(on) { this.el.busted.style.display = on ? 'flex' : 'none'; }

  banner(title, sub = '') {
    this.el.banner.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    this.el.banner.classList.add('show');
    this._bannerT = 3.2;
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this._toastT = 2.6;
  }

  /** Per-frame HUD refresh from the live game state. */
  update(dt, S) {
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this.el.banner.classList.remove('show');
    }
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.el.toast.classList.remove('show');
    }
    const M = S.missions;
    const P = S.player;
    this.el.cash.textContent = money(M.cash);
    this.el.debt.textContent = M.debt > 0
      ? `Debt to Vera Kade: ${money(M.debt)}`
      : 'Debt PAID — free roam';
    const w = S.police.wanted;
    if (w !== this._lastStars) {
      this._lastStars = w;
      let stars = '';
      for (let i = 0; i < 5; i++) {
        stars += i < w ? '★' : '<span class="off">★</span>';
      }
      this.el.stars.innerHTML = stars;
    }
    const hp = Math.round(P.health);
    this.el.healthfill.style.width = hp + '%';
    this.el.healthfill.classList.toggle('low', hp <= 30);
    this.el.healthnum.textContent = String(hp);
    const obj = M.objectiveText();
    this.el.objtext.textContent = obj.text;
    this.el.objsub.textContent = obj.sub;
    this.el.speed.innerHTML = `${Math.round(P.speedMph)}<small> mph</small>`;
    this.el.carname.textContent = P.onFoot
      ? 'On foot — press E near a car to drive'
      : (P.car ? P.car.name : 'Driving');
    this._drawMinimap(S);
  }

  /** Top-down minimap: roads, sea, player arrow, mission blip, police dots. */
  _drawMinimap(S) {
    const g = this.mapCtx;
    const W = 190, R = 95;
    const toMap = (v) => ((v + 240) / 480) * W;
    g.clearRect(0, 0, W, W);
    // Round clip.
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    // Land + sea.
    g.fillStyle = '#3a5a44';
    g.fillRect(0, 0, W, W);
    g.fillStyle = '#8a7a5a';
    g.fillRect(0, toMap(190), W, W - toMap(190));
    g.fillStyle = '#1f8fa8';
    g.fillRect(0, toMap(238), W, W - toMap(238));
    // Roads.
    g.strokeStyle = '#565e68';
    g.lineWidth = 4;
    for (let v = -200; v <= 200; v += 40) {
      g.beginPath(); g.moveTo(toMap(v), 0); g.lineTo(toMap(v), W); g.stroke();
      g.beginPath(); g.moveTo(0, toMap(v)); g.lineTo(W, toMap(v)); g.stroke();
    }
    // Downtown blocks.
    g.fillStyle = 'rgba(255, 255, 255, 0.14)';
    for (let x = -80; x <= 80; x += 40) {
      for (let z = -80; z <= 80; z += 40) {
        g.fillRect(toMap(x + 4), toMap(z + 4), toMap(x + 36) - toMap(x + 4), toMap(z + 36) - toMap(z + 4));
      }
    }
    // Mission blip (pulsing yellow diamond).
    const mk = S.missions.marker();
    if (mk) {
      const pulse = 6 + Math.sin(performance.now() / 240) * 2.5;
      const mx = toMap(mk.x), my = toMap(mk.z);
      g.fillStyle = '#ffd23e';
      g.strokeStyle = '#7a2d00';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(mx, my - pulse);
      g.lineTo(mx + pulse, my);
      g.lineTo(mx, my + pulse);
      g.lineTo(mx - pulse, my);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // Police dots (red).
    g.fillStyle = '#ff3b30';
    for (const d of S.police.dots()) {
      g.beginPath();
      g.arc(toMap(d.x), toMap(d.z), 4, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow (white, rotates with heading).
    const px = toMap(S.player.pos.x), py = toMap(S.player.pos.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - S.player.heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 7);
    g.lineTo(0, 4);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();
    // North tick.
    g.fillStyle = '#fff';
    g.font = 'bold 11px sans-serif';
    g.fillText('N', R - 4, 12);
  }
}
