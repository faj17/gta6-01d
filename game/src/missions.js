// missions.js — Vera Kade's four jobs, chained one at a time. Each pays the debt
// down; after the last the debt is clear and Solmara is free roam with the cash
// total as the score. A mission has one marker, one objective line and one
// completion test; the HUD reads all three every frame.

import { dist2D, money } from './util.js';

const DEBT_START = 12000;

const MISSION_DEFS = [
  {
    id: 1,
    title: 'FIRST PICKUP',
    story: 'Vera Kade needs a package lifted from the docks. No questions, no cops.',
    objective: 'Collect the package at the docks',
    sub: 'Follow the yellow blip — walk or drive',
    reward: 1500,
  },
  {
    id: 2,
    title: 'HOT WHEELS',
    story: 'A yellow sports car waits at the marina. Take it. Bring it to the garage.',
    objective: 'Steal the yellow sports car at the marina',
    sub: 'Stealing it in sight of anyone raises the heat',
    reward: 3000,
  },
  {
    id: 3,
    title: 'GETAWAY',
    story: 'That marina job put two stars on you. Lose them. Break line of sight and stay clean.',
    objective: 'Lose the 2-star wanted level',
    sub: 'Stay out of sight of police cars until the stars drain',
    reward: 2500,
  },
  {
    id: 4,
    title: 'THE DROP',
    story: 'One last run: the package goes across town in 100 seconds, with heat on your tail.',
    objective: 'Deliver the package across town',
    sub: '100 seconds on the clock — drive fast, drive clean',
    reward: 5000,
  },
];

export class Missions {
  constructor(S) {
    this.S = S;
    this.index = 0;          // 0..3 active, 4 = all done (free roam)
    this.cash = 0;
    this.debt = DEBT_START;
    this.timer = 0;          // mission 4 countdown
    this.stolenYellow = false;
    this._doneFlash = 0;
    this._startMission(0, true);
  }

  get done() { return this.index >= MISSION_DEFS.length; }

  get current() { return MISSION_DEFS[this.index] || null; }

  /** Where the yellow blip points right now, or null in free roam. */
  marker() {
    if (this.done) return null;
    const P = this.S.world.places;
    switch (this.index) {
      case 0: return { x: P.docks.x, z: P.docks.z };
      case 1: return this.stolenYellow
        ? { x: P.garage.x, z: P.garage.z }
        : { x: P.marina.x, z: P.marina.z };
      case 2: return null; // getaway: no place to go, just survive
      case 3: return { x: P.delivery.x, z: P.delivery.z };
      default: return null;
    }
  }

  objectiveText() {
    if (this.done) {
      return {
        text: 'Debt paid — Solmara is yours',
        sub: `Free roam · cash ${money(this.cash)} · steal, drive, explore`,
      };
    }
    const m = this.current;
    if (this.index === 1 && this.stolenYellow) {
      return { text: 'Bring the sports car to the garage', sub: 'North-west corner of the city' };
    }
    if (this.index === 3) {
      return { text: m.objective, sub: `Time left: ${Math.max(0, Math.ceil(this.timer))}s · 1 star of heat` };
    }
    return { text: m.objective, sub: m.sub };
  }

  _startMission(i, first = false) {
    const m = MISSION_DEFS[i];
    if (!m) return;
    this.stolenYellow = false;
    if (i === 3) {
      this.timer = 100;
      this.S.police.addWanted(1, 'the drop is hot from the start');
    }
    if (i === 2) {
      this.S.police.wanted = 2;
      this.S.police.cleanT = 0;
    }
    if (!first) {
      this.S.hud.banner(`MISSION ${m.id}: ${m.title}`, m.story);
      this.S.audio.missionComplete();
    }
  }

  /** Called when the player enters any car. Returns true if it was the target. */
  onEnterCar(car) {
    if (this.index === 1 && !this.stolenYellow && car === this.S.missionCar) {
      this.stolenYellow = true;
      this.S.police.addWanted(1, 'stole the marina sports car');
      this.S.audio.wantedUp();
      this.S.toast('Stolen! Get the sports car to the garage — fast');
      return true;
    }
    return false;
  }

  _complete() {
    const m = this.current;
    this.cash += m.reward;
    this.debt = Math.max(0, this.debt - m.reward);
    this.S.audio.missionComplete();
    this.S.hud.banner(`JOB DONE — ${money(m.reward)}`, m.title + (this.debt > 0
      ? ` · debt left: ${money(this.debt)}`
      : ' · DEBT PAID. Solmara is yours.'));
    this.index += 1;
    if (!this.done) this._startMission(this.index);
    else this.S.hud.banner('DEBT PAID', 'Rook is free. Free roam — your cash is the score.');
    this.S.saveGame();
  }

  _failTimer() {
    // Ran out of time on The Drop: the job restarts, Vera keeps $500 of the fee.
    this.timer = 100;
    this.cash = Math.max(0, this.cash - 500);
    this.S.hud.banner('TOO SLOW', 'Vera is not happy. The Drop restarts — $500 docked.');
    this.S.toast('The Drop restarted — 100 seconds again');
    this.S.player.teleport(this.S.world.places.garage.x, this.S.world.places.garage.z, 0);
  }

  update(dt) {
    if (this.done) return;
    const S = this.S;
    const p = S.player.pos;
    if (this.index === 0) {
      const mk = this.marker();
      if (dist2D(p.x, p.z, mk.x, mk.z) < 6) {
        S.audio.pickup();
        this._complete();
      }
    } else if (this.index === 1) {
      if (this.stolenYellow) {
        const mk = this.marker();
        const inTarget = !S.player.onFoot && S.player.car === S.missionCar;
        if (inTarget && dist2D(p.x, p.z, mk.x, mk.z) < 9) this._complete();
      }
    } else if (this.index === 2) {
      if (S.police.wanted === 0) this._complete();
    } else if (this.index === 3) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this._failTimer();
        return;
      }
      const mk = this.marker();
      if (dist2D(p.x, p.z, mk.x, mk.z) < 9) this._complete();
    }
  }

  /** After a bust during the getaway, the heat comes back — the job is not free. */
  onBusted() {
    if (this.index === 2) {
      this.S.police.wanted = 2;
      this.S.police.cleanT = 0;
    }
    if (this.index === 3) {
      this.timer = 100;
    }
  }

  serialize() {
    return {
      index: this.index,
      cash: this.cash,
      debt: this.debt,
      stolenYellow: this.stolenYellow,
    };
  }

  restore(d) {
    if (!d) return;
    this.index = Math.min(d.index || 0, MISSION_DEFS.length);
    this.cash = d.cash || 0;
    this.debt = d.debt ?? DEBT_START;
    this.stolenYellow = !!d.stolenYellow;
    if (this.index === 3) this.timer = 100;
    if (this.index === 2) this.S.police.wanted = 2;
  }
}
