// traffic.js — the city's other road users: 12 AI cars looping the road graph in
// their lanes, parked cars along the kerbs as stealable stock, and 18 pedestrians
// strolling the sidewalks who scatter from a speeding car or a chase. Stealing a
// traffic car makes its driver flee on foot.

import * as THREE from 'three';
import { makeRng, range, rangeInt, pick, clamp, angleToward, dist2D, pushCircleOutOfAabb } from './util.js';
import { makeCarMesh, makePedMesh, onRoad } from './world.js';
import { CAR_COLORS, CAR_NAMES, PED_SHIRTS, PED_SKINS } from './palette.js';

const TRAFFIC_COUNT = 12;
const PARKED_COUNT = 9;
const PED_COUNT = 18;

export class Traffic {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.rng = makeRng(seed ^ 0x5f3759df);
    this.cars = [];    // AI traffic cars { mesh, loop, wp, speed, cruise, color, name, driver }
    this.parked = [];  // parked cars { mesh, color, name, stolen }
    this.peds = [];    // pedestrians { mesh, x, z, heading, speed, state, fleeT }
    this._spawnCars();
    this._spawnParked();
    this._spawnPeds();
  }

  _spawnCars() {
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const loop = pick(this.rng, this.world.loops);
      const wp = rangeInt(this.rng, 0, loop.length - 1);
      const color = pick(this.rng, CAR_COLORS.slice(1));
      const mesh = makeCarMesh(color, { taxi: this.rng() < 0.15 });
      const p = loop[wp];
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      this.cars.push({
        mesh, loop, wp, color,
        name: pick(this.rng, CAR_NAMES),
        cruise: range(this.rng, 7, 12),
        speed: 0,
        driver: null, // a ped mesh that appears when the car is stolen
        stolen: false,
      });
    }
  }

  _spawnParked() {
    for (let i = 0; i < PARKED_COUNT; i++) {
      const x = rangeInt(this.rng, -5, 5) * 40 + (this.rng() < 0.5 ? 7.5 : -7.5);
      const z = rangeInt(this.rng, -5, 5) * 40 + range(this.rng, -14, 14);
      if (Math.abs(z) > 185) continue;
      const color = pick(this.rng, CAR_COLORS.slice(1));
      const mesh = makeCarMesh(color);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = this.rng() < 0.5 ? 0 : Math.PI;
      this.scene.add(mesh);
      this.parked.push({ mesh, color, name: pick(this.rng, CAR_NAMES), stolen: false });
    }
  }

  _spawnPeds() {
    for (let i = 0; i < PED_COUNT; i++) {
      const x = rangeInt(this.rng, -5, 5) * 40 + range(this.rng, -6, 6);
      const z = rangeInt(this.rng, -5, 5) * 40 + range(this.rng, -6, 6);
      const mesh = makePedMesh(pick(this.rng, PED_SHIRTS), pick(this.rng, PED_SKINS));
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.peds.push({
        mesh, x, z,
        heading: this.rng() * Math.PI * 2,
        speed: range(this.rng, 1.2, 2.2),
        state: 'walk',
        fleeT: 0,
        bob: this.rng() * 6,
      });
    }
  }

  /** Every stealable car: traffic cars, parked cars and the player's own. */
  stealables() {
    const out = [];
    for (const c of this.cars) if (!c.stolen) out.push(c);
    for (const p of this.parked) if (!p.stolen) out.push(p);
    return out;
  }

  /** All cars the player can collide with, as { x, z, r, push, isPolice }. */
  collidables() {
    const out = [];
    for (const c of this.cars) {
      if (c.stolen) continue;
      const m = c.mesh.position;
      out.push({
        x: m.x, z: m.z, r: 2.1, isPolice: false,
        push: (dx, dz) => { m.x += dx; m.z += dz; c.speed *= 0.6; },
      });
    }
    return out;
  }

  /** Steal a car: mark it, spawn its fleeing driver for traffic cars. */
  steal(car) {
    car.stolen = true;
    if (car.driver === null && this.cars.includes(car)) {
      const mesh = makePedMesh(pick(this.rng, PED_SHIRTS), pick(this.rng, PED_SKINS));
      const m = car.mesh.position;
      mesh.position.set(m.x + 2.5, 0, m.z + 2.5);
      this.scene.add(mesh);
      const driver = {
        mesh, x: m.x + 2.5, z: m.z + 2.5,
        heading: this.rng() * Math.PI * 2, speed: 4.5,
        state: 'flee', fleeT: 6, bob: 0,
      };
      this.peds.push(driver);
      car.driver = driver;
    }
  }

  update(dt, S) {
    const px = S.player.pos.x, pz = S.player.pos.z;
    const playerSpeed = Math.abs(S.player.carSpeed);
    const wanted = S.police.wanted;
    for (const c of this.cars) {
      if (c.stolen) continue;
      const mesh = c.mesh;
      const m = mesh.position;
      const target = c.loop[(c.wp + 1) % c.loop.length];
      const dx = target.x - m.x, dz = target.z - m.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(dx, dz);
      mesh.rotation.y = angleToward(mesh.rotation.y, wantHeading, dt * 2.2);
      // Slow for the car ahead on the same stretch.
      let cruise = c.cruise;
      for (const o of this.cars) {
        if (o === c || o.stolen) continue;
        const od = dist2D(m.x, m.z, o.mesh.position.x, o.mesh.position.z);
        if (od < 9) {
          const ahead = (o.mesh.position.x - m.x) * Math.sin(mesh.rotation.y)
            + (o.mesh.position.z - m.z) * Math.cos(mesh.rotation.y);
          if (ahead > 0) cruise = Math.min(cruise, 3);
        }
      }
      // And for the player's car right in front.
      if (!S.player.onFoot) {
        const pd = dist2D(m.x, m.z, px, pz);
        if (pd < 9) {
          const ahead = (px - m.x) * Math.sin(mesh.rotation.y) + (pz - m.z) * Math.cos(mesh.rotation.y);
          if (ahead > 0) cruise = Math.min(cruise, 2);
        }
      }
      c.speed = THREE.MathUtils.lerp(c.speed, cruise, dt * 1.2);
      m.x += Math.sin(mesh.rotation.y) * c.speed * dt;
      m.z += Math.cos(mesh.rotation.y) * c.speed * dt;
      if (d < 2.5) c.wp = (c.wp + 1) % c.loop.length;
    }
    for (const p of this.peds) {
      const dPlayer = dist2D(p.x, p.z, px, pz);
      const danger = (wanted > 0 && dPlayer < 26)
        || (!S.player.onFoot && playerSpeed > 12 && dPlayer < 14);
      if (danger && p.state !== 'flee') {
        p.state = 'flee';
        p.fleeT = range(this.rng, 2, 4);
      }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        p.speed = 5.2;
        // Run away from the player.
        const away = Math.atan2(p.x - px, p.z - pz);
        p.heading = angleToward(p.heading, away, dt * 6);
        if (p.fleeT <= 0) p.state = 'walk';
      } else {
        p.speed = THREE.MathUtils.lerp(p.speed, 1.8, dt);
        // Wander: drift along sidewalks, turn at random.
        if (this.rng() < dt * 0.12) p.heading += range(this.rng, -1.2, 1.2);
        if (!onRoad(p.x, p.z) && this.rng() < dt * 0.3) p.heading += Math.PI / 2;
      }
      const pos = { x: p.x, z: p.z };
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.x = clamp(p.x, -228, 228);
      p.z = clamp(p.z, -228, 200);
      for (const box of this.world.colliders) pushCircleOutOfAabb(pos, 0.5, box);
      p.x = pos.x; p.z = pos.z;
      // A hit pedestrian scatters and raises the heat (once per cooldown).
      p.hitCool = Math.max(0, (p.hitCool || 0) - dt);
      if (!S.player.onFoot && dPlayer < 1.9 && playerSpeed > 3 && p.hitCool <= 0) {
        p.hitCool = 4;
        p.state = 'flee';
        p.fleeT = 3;
        p.x += Math.sin(p.heading) * 3;
        p.z += Math.cos(p.heading) * 3;
        S.police.addWanted(1, 'hit a pedestrian');
        S.player.carSpeed *= 0.7;
      }
      p.bob += p.speed * dt * 2.2;
      const swing = Math.sin(p.bob) * clamp(p.speed / 5, 0.15, 1) * 0.5;
      p.mesh.userData.legL.rotation.x = swing;
      p.mesh.userData.legR.rotation.x = -swing;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.bob)) * 0.06, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }
}
