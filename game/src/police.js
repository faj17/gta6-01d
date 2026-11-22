// police.js — the wanted system and the Solmara police. Crimes raise stars
// (steal +1, hit a pedestrian +1, ram a police car +1); police cars spawn at the
// map edge and chase, ramming the player's car; 1 star = 1 car, 2 stars = 2,
// 3+ = 3, faster. Stars drain one at a time after 12 clean seconds with no
// police car within 40 m. At 0 health the player is Busted.

import * as THREE from 'three';
import { makeRng, range, clamp, angleToward, dist2D } from './util.js';
import { makeCarMesh } from './world.js';

export class Police {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed ^ 0x9e3779b9);
    this.wanted = 0;
    this.cars = []; // { mesh, speed, ramCool }
    this.cleanT = 0;
    this._starFlash = 0;
  }

  get wantedCount() { return this.cars.length; }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    if (this.wanted > before) {
      this.cleanT = 0;
      this._starFlash = 1;
      return true;
    }
    return false;
  }

  clearWanted() {
    this.wanted = 0;
    this.cleanT = 0;
    this._despawnAll();
  }

  _despawnAll() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = [];
  }

  _targetCount() {
    if (this.wanted <= 0) return 0;
    if (this.wanted === 1) return 1;
    if (this.wanted === 2) return 2;
    return 3;
  }

  _spawnCar(px, pz) {
    const mesh = makeCarMesh(0x1c2f4a, { police: true });
    // Spawn at the map edge, on the player's side of town.
    const side = range(this.rng, 0, Math.PI * 2);
    const x = clamp(px + Math.sin(side) * 120, -210, 210);
    const z = clamp(pz + Math.cos(side) * 120, -210, 200);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.atan2(px - x, pz - z);
    this.scene.add(mesh);
    this.cars.push({ mesh, speed: 0, ramCool: 0 });
  }

  update(dt, S) {
    const px = S.player.pos.x, pz = S.player.pos.z;
    const target = this._targetCount();
    while (this.cars.length < target) this._spawnCar(px, pz);
    while (this.cars.length > target) {
      // Despawn the farthest car first.
      let far = 0, farD = -1;
      this.cars.forEach((c, i) => {
        const d = dist2D(c.mesh.position.x, c.mesh.position.z, px, pz);
        if (d > farD) { farD = d; far = i; }
      });
      this.scene.remove(this.cars[far].mesh);
      this.cars.splice(far, 1);
    }

    let nearest = Infinity;
    for (const c of this.cars) {
      const mesh = c.mesh;
      const m = mesh.position;
      const d = dist2D(m.x, m.z, px, pz);
      nearest = Math.min(nearest, d);
      const topSpeed = 15 + this.wanted * 3.2;
      // Police steer hard and ram: aim slightly ahead of the player's motion.
      const lead = S.player.onFoot ? 0 : 0.35;
      const tx = px + Math.sin(S.player.heading) * S.player.carSpeed * lead;
      const tz = pz + Math.cos(S.player.heading) * S.player.carSpeed * lead;
      const leadHeading = Math.atan2(tx - m.x, tz - m.z);
      mesh.rotation.y = angleToward(mesh.rotation.y, leadHeading, dt * 3.2);
      c.speed = THREE.MathUtils.lerp(c.speed, topSpeed, dt * 0.9);
      m.x += Math.sin(mesh.rotation.y) * c.speed * dt;
      m.z += Math.cos(mesh.rotation.y) * c.speed * dt;
      c.ramCool = Math.max(0, c.ramCool - dt);
      // Ram: contact hurts the player and shoves their car.
      if (d < 4.4 && c.ramCool <= 0) {
        c.ramCool = 1.2;
        S.audio.crash(0.5);
        S.addShake(0.35);
        if (S.player.onFoot) {
          if (S.player.hurt(14)) S.onBusted();
        } else {
          if (S.player.hurt(9)) S.onBusted();
          S.player.carSpeed *= 0.55;
          // Shove the player's car sideways off the police nose.
          const ux = (px - m.x) / (d || 1), uz = (pz - m.z) / (d || 1);
          S.player.pos.x += ux * 1.6;
          S.player.pos.z += uz * 1.6;
          if (S.player.car) {
            S.player.car.mesh.position.copy(S.player.pos);
          }
        }
      }
    }

    // Wanted drains one star after 12 clean seconds, no police car near.
    if (this.wanted > 0) {
      if (nearest > 40) this.cleanT += dt;
      else this.cleanT = 0;
      if (this.cleanT >= 12) {
        this.wanted -= 1;
        this.cleanT = 0;
        if (this.wanted === 0) this._despawnAll();
      }
    }
    this._starFlash = Math.max(0, this._starFlash - dt * 2);
  }

  /** Dots for the minimap: { x, z } of each police car. */
  dots() {
    return this.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z }));
  }
}
