// player.js — Rook on foot and behind the wheel, plus the chase camera.
// On foot: WASD third-person, Shift to run, the camera auto-follows behind.
// Driving: arcade physics — acceleration, braking and reverse, steering that
// eases off with speed, Space handbrake for sharp turns, R to reset a stuck car.
// E gets in and out; E next to any other car steals it.

import * as THREE from 'three';
import { clamp, lerp, angleToward, angleDelta, pushCircleOutOfAabb, dist2D } from './util.js';
import { makeCarMesh } from './world.js';
import { CITY_HALF } from './world.js';

const WALK_SPEED = 5.2;
const RUN_SPEED = 9.5;
const CAR_ACCEL = 15;
const CAR_BRAKE = 26;
const CAR_MAX_SPEED = 36;
const CAR_REVERSE_MAX = 9;
const CAR_RADIUS = 2.1;

export class Player {
  constructor(scene, start) {
    this.pos = new THREE.Vector3(start.x, 0, start.z);
    this.heading = Math.PI; // facing north up the boulevard
    this.onFoot = true;
    this.speed = 0;         // on-foot speed
    this.carSpeed = 0;      // car speed along its heading
    this.steer = 0;
    this.health = 100;
    this.car = null;        // { mesh, color, name, damage } or null
    this.camYaw = this.heading;
    this.camPitch = 0.32;
    this.camDist = 9.5;
    this._mesh = null;      // on-foot figure
    this._bob = 0;
    this._buildFigure(scene);
    this._cameraPos = new THREE.Vector3(0, 8, -14);
    this._lookAt = new THREE.Vector3();
  }

  _buildFigure(scene) {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x232a33 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.0, 8), jacket);
    body.position.y = 1.05;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
    head.position.y = 1.88;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 10), pants);
    cap.position.y = 2.1;
    g.add(cap);
    const legGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.62, 6);
    this._legL = new THREE.Mesh(legGeo, pants);
    this._legL.position.set(0, 0.31, 0.17);
    g.add(this._legL);
    this._legR = new THREE.Mesh(legGeo, pants);
    this._legR.position.set(0, 0.31, -0.17);
    g.add(this._legR);
    this._mesh = g;
    this._mesh.position.copy(this.pos);
    scene.add(g);
  }

  get speedMph() {
    return this.onFoot ? Math.abs(this.speed) * 2.2 : Math.abs(this.carSpeed) * 2.2;
  }

  /** Put Rook in a car (mesh already placed in the scene by the caller). */
  enterCar(car) {
    this.car = car;
    this.onFoot = false;
    this.carSpeed = 0;
    this.steer = 0;
    this.pos.set(car.mesh.position.x, 0, car.mesh.position.z);
    this.heading = car.mesh.rotation.y;
    if (this._mesh) this._mesh.visible = false;
  }

  /** Step out beside the car, leaving it parked where it stops. */
  exitCar() {
    if (!this.car) return null;
    const car = this.car;
    this.car = null;
    this.onFoot = true;
    this.speed = 0;
    const side = { x: Math.cos(this.heading), z: -Math.sin(this.heading) };
    this.pos.set(car.mesh.position.x + side.x * 2.6, 0, car.mesh.position.z + side.z * 2.6);
    this.heading = car.mesh.rotation.y;
    if (this._mesh) {
      this._mesh.visible = true;
      this._mesh.position.copy(this.pos);
    }
    return car;
  }

  /** Reset a stuck car onto the nearest road, facing along it. */
  resetCar() {
    if (!this.car) return false;
    const m = this.car.mesh;
    const snapX = Math.round(m.position.x / 40) * 40;
    const snapZ = Math.round(m.position.z / 40) * 40;
    if (Math.abs(m.position.x - snapX) < Math.abs(m.position.z - snapZ)) {
      m.position.x = snapX; m.position.z = snapZ;
      m.rotation.y = Math.abs(m.position.z) < Math.abs(m.position.x) ? 0 : Math.PI / 2;
    } else {
      m.position.x = snapX; m.position.z = snapZ;
      m.rotation.y = Math.PI / 2;
    }
    this.pos.set(m.position.x, 0, m.position.z);
    this.heading = m.rotation.y;
    this.carSpeed = 0;
    return true;
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }

  update(dt, S) {
    const input = S.input;
    const drag = input.takeDrag();
    this.camYaw -= drag.dx * 0.005;
    this.camPitch = clamp(this.camPitch + drag.dy * 0.003, 0.08, 0.9);
    if (this.camPitch < 0.08) this.camPitch = 0.08;

    if (this.onFoot) this._updateFoot(dt, S);
    else this._updateCar(dt, S);

    // Keep Rook inside the city and out of the sea.
    this.pos.x = clamp(this.pos.x, -CITY_HALF, CITY_HALF);
    this.pos.z = clamp(this.pos.z, -CITY_HALF, CITY_HALF - 6);
    if (this.car) {
      this.car.mesh.position.x = clamp(this.car.mesh.position.x, -CITY_HALF, CITY_HALF);
      this.car.mesh.position.z = clamp(this.car.mesh.position.z, -CITY_HALF, CITY_HALF - 6);
    }
    this._updateCamera(dt, S.camera);
  }

  _updateFoot(dt, S) {
    const input = S.input;
    const axes = input.moveAxes();
    const targetSpeed = axes.y !== 0 || axes.x !== 0
      ? (input.run ? RUN_SPEED : WALK_SPEED) : 0;
    // Movement is relative to the camera yaw, so the camera leads.
    const moveAngle = this.camYaw + Math.atan2(-axes.x, axes.y);
    if (targetSpeed > 0) {
      this.heading = angleToward(this.heading, moveAngle, dt * 10);
      this.speed = lerp(this.speed, targetSpeed, dt * 8);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
    } else {
      this.speed = lerp(this.speed, 0, dt * 10);
    }
    // Walk bob + leg swing.
    this._bob += this.speed * dt * 1.6;
    const swing = Math.sin(this._bob * 2) * clamp(this.speed / RUN_SPEED, 0, 1) * 0.55;
    this._legL.rotation.x = swing;
    this._legR.rotation.x = -swing;
    // Collide with buildings.
    for (const box of S.world.colliders) {
      pushCircleOutOfAabb(this.pos, 0.55, box);
    }
    if (this._mesh) {
      this._mesh.position.copy(this.pos);
      this._mesh.rotation.y = this.heading;
    }
    // E near a car: get in / steal it.
    if (input.wasPressed('KeyE')) S.tryEnterNearestCar();
  }

  _updateCar(dt, S) {
    const input = S.input;
    const axes = input.moveAxes();
    const car = this.car;
    const m = car.mesh;
    // Throttle / brake / reverse.
    if (axes.y > 0) this.carSpeed += CAR_ACCEL * dt;
    else if (axes.y < 0) {
      if (this.carSpeed > 0.5) this.carSpeed -= CAR_BRAKE * dt;
      else this.carSpeed -= CAR_ACCEL * 0.6 * dt;
    } else {
      this.carSpeed = lerp(this.carSpeed, 0, dt * 0.9);
    }
    if (input.handbrake) {
      this.carSpeed = lerp(this.carSpeed, 0, dt * 2.2);
    }
    this.carSpeed = clamp(this.carSpeed, -CAR_REVERSE_MAX, CAR_MAX_SPEED);
    // Steering eases off with speed so the car stays drivable at full tilt.
    const steerTarget = -axes.x * (1 / (1 + Math.abs(this.carSpeed) * 0.055));
    const steerRate = input.handbrake ? 6.5 : 4.5;
    this.steer = lerp(this.steer, steerTarget, dt * steerRate);
    const turn = this.steer * this.carSpeed * 0.052 * (input.handbrake ? 1.7 : 1);
    this.heading += turn * dt;
    // Integrate.
    const nx = this.pos.x + Math.sin(this.heading) * this.carSpeed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.carSpeed * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = nx;
    this.pos.z = nz;
    // Buildings: push out and bleed speed; a hard hit hurts and thuds.
    let hit = false;
    for (const box of S.world.colliders) {
      if (pushCircleOutOfAabb(this.pos, CAR_RADIUS, box)) hit = true;
    }
    if (hit) {
      const impact = Math.abs(this.carSpeed);
      this.carSpeed *= 0.35;
      if (impact > 12) {
        S.audio.crash(impact / CAR_MAX_SPEED);
        if (this.hurt(impact * 0.35)) S.onBusted();
        S.addShake(impact * 0.02);
      }
    }
    // Other cars: soft circle push.
    for (const other of S.traffic.collidables()) {
      const d = dist2D(this.pos.x, this.pos.z, other.x, other.z);
      const min = CAR_RADIUS + other.r;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const ux = (this.pos.x - other.x) / d, uz = (this.pos.z - other.z) / d;
        this.pos.x += ux * push;
        this.pos.z += uz * push;
        other.push(-ux * push, -uz * push);
        const rel = Math.abs(this.carSpeed);
        this.carSpeed *= 0.82;
        if (rel > 14) {
          S.audio.crash(rel / CAR_MAX_SPEED);
          if (other.isPolice) S.police.addWanted(1, 'rammed a police car');
        }
      }
    }
    // Keep the mesh on the car.
    m.position.set(this.pos.x, 0, this.pos.z);
    m.rotation.y = this.heading;
    m.rotation.z = -this.steer * 0.06; // body roll into corners
    // E: step out. R: reset a stuck car.
    if (input.wasPressed('KeyE')) S.tryExitCar();
    if (input.wasPressed('KeyR')) {
      if (this.resetCar()) S.toast('Car reset onto the road');
    }
    void before;
  }

  _updateCamera(dt, camera) {
    // Chase camera: behind the orbit yaw, eased; mouse drag orbits around it,
    // and while driving the orbit slowly re-centres behind the car.
    const yaw = this.camYaw;
    const dist = this.onFoot ? 10 : 13.5;
    const height = this.onFoot ? 4.4 : 5.6;
    const cx = this.pos.x - Math.sin(yaw) * dist;
    const cz = this.pos.z - Math.cos(yaw) * dist;
    const want = new THREE.Vector3(cx, height + this.camPitch * 4, cz);
    this._cameraPos.lerp(want, 1 - Math.exp(-dt * 5));
    // Never let the camera sink below the street.
    if (this._cameraPos.y < 1.6) this._cameraPos.y = 1.6;
    camera.position.copy(this._cameraPos);
    this._lookAt.set(this.pos.x, this.onFoot ? 1.6 : 1.4, this.pos.z);
    this._lookAt.x += Math.sin(yaw) * 4;
    this._lookAt.z += Math.cos(yaw) * 4;
    camera.lookAt(this._lookAt);
    // Slowly re-centre the orbit offset behind the car while driving.
    if (!this.onFoot) {
      const d = angleDelta(this.camYaw, this.heading);
      this.camYaw -= d * dt * 0.55;
    }
  }

  /** Teleport Rook (used by staging, busted respawn and save restore). */
  teleport(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.camYaw = heading;
    this.carSpeed = 0;
    this.speed = 0;
    if (this._mesh) this._mesh.position.copy(this.pos);
    this._cameraPos.set(x - Math.sin(heading) * 10, 5, z - Math.cos(heading) * 10);
  }
}

/** Make Rook's own red convertible and park it at a spot. */
export function makePlayerCar(scene, x, z, heading) {
  const mesh = makeCarMesh(0xd8382c, { convertible: true });
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return { mesh, color: 0xd8382c, name: 'Rook\u2019s Vesper GT', damage: 0, isPlayer: true, owned: true };
}
