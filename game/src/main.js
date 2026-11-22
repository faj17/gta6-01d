// main.js — SOLMARA entry point. Wires the renderer, the fixed-step 60 Hz sim,
// the title / playing / paused / busted states, the save, the ?shot= staging
// used for screenshots, and window.__game for probing. No game logic lives here
// that belongs in another file: this file only connects the modules.

import * as THREE from 'three';
import { buildWorld, makeCarMesh, CITY_HALF } from './world.js';
import { Input } from './input.js';
import { Player, makePlayerCar } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { clamp, dist2D } from './util.js';

const SAVE_KEY = 'solmara-save-v1';
const STEP = 1 / 60;

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = Number(params.get('seed') || '1') || 1;

// ---- renderer -----------------------------------------------------------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 8, -16);

// ---- shared game state ---------------------------------------------------
const S = {
  scene, camera, renderer,
  world: null, input: null, audio: null, hud: null,
  player: null, traffic: null, police: null, missions: null,
  missionCar: null, playerCar: null,
  looseCars: [],          // cars the player stole and left parked
  state: 'title',         // title | playing | paused | busted
  simTime: 0,
  shakeT: 0, shakeMag: 0,
  shot: SHOT,
  toast(msg) { S.hud.toast(msg); },
  addShake(m) { S.shakeMag = Math.max(S.shakeMag, m); S.shakeT = 0.35; },
  saveGame,
  tryEnterNearestCar,
  tryExitCar,
  onBusted,
};

S.world = buildWorld(scene, 1337 + SEED);
S.input = new Input(renderer.domElement);
S.audio = new GameAudio();
S.hud = new Hud();
S.player = new Player(scene, S.world.places.start);
S.traffic = new Traffic(scene, S.world, 1337 + SEED);
S.police = new Police(scene, 1337 + SEED);

// Rook's own red convertible, parked on the boulevard near the start.
S.playerCar = makePlayerCar(scene, S.world.places.redCar.x, S.world.places.redCar.z, Math.PI);
S.missions = new Missions(S);

// The yellow sports car at the marina — the Hot Wheels target.
{
  const P = S.world.places.marina;
  const mesh = makeCarMesh(0xf2b705);
  mesh.position.set(P.x, 0, P.z);
  mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);
  const car = { mesh, color: 0xf2b705, name: 'Marina Vesper GT', damage: 0, isMissionCar: true, stolen: false };
  S.missionCar = car;
  S.traffic.parked.push(car);
}

// The mission beacon: a tall glowing pillar + floating diamond over the active
// marker, so the objective is visible in the world, not just on the minimap.
const beacon = new THREE.Group();
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.1, 1.1, 70, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
);
beam.position.y = 35;
const gem = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.7),
  new THREE.MeshBasicMaterial({ color: 0xffd23e }),
);
gem.position.y = 9;
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(4.5, 0.28, 8, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd23e }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.3;
beacon.add(beam, gem, ring);
beacon.visible = false;
scene.add(beacon);

function updateBeacon() {
  const mk = S.missions.marker();
  if (!mk || S.state === 'title') { beacon.visible = false; return; }
  beacon.visible = true;
  beacon.position.set(mk.x, 0, mk.z);
  gem.position.y = 9 + Math.sin(S.simTime * 2.2) * 1.1;
  gem.rotation.y = S.simTime * 1.4;
  const s = 1 + Math.sin(S.simTime * 2.2) * 0.12;
  ring.scale.set(s, s, 1);
}

// ---- car enter / exit ----------------------------------------------------
function nearestCar(maxD) {
  const p = S.player.pos;
  let best = null, bestD = maxD;
  const consider = (car) => {
    const m = car.mesh.position;
    const d = dist2D(p.x, p.z, m.x, m.z);
    if (d < bestD) { best = car; bestD = d; }
  };
  consider(S.playerCar);
  for (const c of S.traffic.stealables()) consider(c);
  for (const c of S.looseCars) consider(c);
  return best;
}

function tryEnterNearestCar() {
  if (!S.player.onFoot) return;
  const car = nearestCar(4.6);
  if (!car) { S.toast('No car close enough — walk up to one and press E'); return; }
  const wasTraffic = S.traffic.cars.includes(car) && !car.stolen;
  const wasParked = S.traffic.parked.includes(car) && !car.stolen;
  const wasLoose = S.looseCars.includes(car);
  const own = car === S.playerCar;
  if (wasTraffic) S.traffic.steal(car);
  if (wasParked) car.stolen = true;
  if (wasLoose) S.looseCars.splice(S.looseCars.indexOf(car), 1);
  S.player.enterCar(car);
  S.audio.ensure(); S.audio.resume(); S.audio.click();
  if (own) {
    S.toast('Your Vesper GT — let\u2019s drive');
  } else if (car === S.missionCar && S.missions.index === 1) {
    S.missions.onEnterCar(car);
  } else if (wasTraffic || wasParked) {
    // Stealing in view of a pedestrian or a police car raises the heat.
    let witnessed = false;
    for (const p of S.traffic.peds) {
      if (dist2D(p.x, p.z, S.player.pos.x, S.player.pos.z) < 28) { witnessed = true; break; }
    }
    if (!witnessed) {
      for (const d of S.police.dots()) {
        if (dist2D(d.x, d.z, S.player.pos.x, S.player.pos.z) < 45) { witnessed = true; break; }
      }
    }
    if (witnessed) {
      S.police.addWanted(1, 'stole a car in view');
      S.audio.wantedUp();
      S.toast('Stolen in view — 1 star of heat!');
    } else {
      S.toast(`Stole the ${car.name} — nobody saw`);
    }
  } else {
    S.toast(`Driving the ${car.name}`);
  }
}

function tryExitCar() {
  const car = S.player.exitCar();
  if (!car) return;
  if (car !== S.playerCar && !S.looseCars.includes(car)) S.looseCars.push(car);
  S.audio.click();
}

// ---- busted / save -------------------------------------------------------
function onBusted() {
  if (S.state !== 'playing') return;
  S.state = 'busted';
  S.player.health = 100;
  S.missions.cash = Math.max(0, S.missions.cash - 500);
  S.police.clearWanted();
  S.missions.onBusted();
  const H = S.world.places.hospital;
  if (!S.player.onFoot && S.player.car) {
    const car = S.player.car;
    S.player.exitCar();
    if (car !== S.playerCar && !S.looseCars.includes(car)) S.looseCars.push(car);
  }
  S.player.teleport(H.x, H.z, Math.PI);
  S.hud.showBusted(true);
  S.hud.showHud(false);
  saveGame();
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      x: S.player.pos.x, z: S.player.pos.z, heading: S.player.heading,
      health: S.player.health,
      cash: S.missions.cash, debt: S.missions.debt,
      mission: S.missions.serialize(),
      wanted: S.police.wanted,
    }));
  } catch { /* storage unavailable: the game still plays */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function restoreSave(d) {
  if (!d) return false;
  S.missions.restore(d.mission);
  S.missions.cash = d.cash || 0;
  S.missions.debt = d.debt ?? 12000;
  S.player.health = d.health ?? 100;
  S.player.teleport(d.x || 0, d.z || 0, d.heading || 0);
  S.police.wanted = 0;
  return true;
}

// ---- menus ---------------------------------------------------------------
function startPlaying(fromSave) {
  S.audio.ensure(); S.audio.resume();
  if (fromSave) restoreSave(loadSave());
  S.state = 'playing';
  S.hud.showTitle(false);
  S.hud.showPause(false);
  S.hud.showBusted(false);
  S.hud.showHud(true);
  const m = S.missions.current;
  if (m) S.hud.banner(`MISSION ${m.id}: ${m.title}`, m.story);
}

document.getElementById('btnNew').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  S.missions = new Missions(S);
  S.player.health = 100;
  S.police.clearWanted();
  S.player.teleport(S.world.places.start.x, S.world.places.start.z, Math.PI);
  startPlaying(false);
});
document.getElementById('btnContinue').addEventListener('click', () => startPlaying(true));
document.getElementById('btnResume').addEventListener('click', () => {
  S.state = 'playing';
  S.hud.showPause(false);
  S.hud.showHud(true);
});
document.getElementById('btnQuit').addEventListener('click', () => {
  saveGame();
  S.state = 'title';
  S.hud.showPause(false);
  S.hud.showHud(false);
  S.hud.showTitle(true);
});
document.getElementById('btnBusted').addEventListener('click', () => {
  S.state = 'playing';
  S.hud.showBusted(false);
  S.hud.showHud(true);
  S.hud.toast('Back on the streets — $500 lighter');
});
document.getElementById('btnContinue').style.display = loadSave() ? '' : 'none';

window.addEventListener('keydown', (e) => {
  S.audio.ensure(); S.audio.resume();
  if (e.code === 'KeyM') {
    S.audio.setMuted(!S.audio.muted);
    S.toast(S.audio.muted ? 'Sound muted (M)' : 'Sound on (M)');
  }
  if (e.code === 'Escape' && S.state === 'playing') {
    S.state = 'paused';
    S.hud.showPause(true);
    S.hud.showHud(false);
    saveGame();
  } else if (e.code === 'Escape' && S.state === 'paused') {
    S.state = 'playing';
    S.hud.showPause(false);
    S.hud.showHud(true);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- staging: ?shot=drive|chase|mission|roam|start &seed=1 ---------------
function applyStaging() {
  const P = S.world.places;
  S.hud.showTitle(false);
  S.hud.showHud(true);
  S.state = 'playing';
  if (SHOT === 'drive') {
    // Rook driving the boulevard in his red convertible, traffic around,
    // heading south into downtown so the towers fill the frame.
    S.player.enterCar(S.playerCar);
    S.player.teleport(4, -140, 0);
    S.player.car.mesh.position.set(4, 0, -140);
    S.player.car.mesh.rotation.y = 0;
    S.input.inject('KeyW');
    S.player.carSpeed = 16;
    S.missions.index = 0;
  } else if (SHOT === 'chase') {
    // Two stars, two police cars closing in behind Rook on the avenue.
    S.player.enterCar(S.playerCar);
    S.player.teleport(0, -120, 0);
    S.player.car.mesh.position.set(0, 0, -120);
    S.player.car.mesh.rotation.y = 0;
    S.player.carSpeed = 16;
    S.police.wanted = 2;
    S.police.cleanT = 0;
    S.missions.index = 2;
  } else if (SHOT === 'mission') {
    // On foot on the docks avenue, the beacon and the package marker ahead.
    S.player.teleport(196, 96, 0);
    S.player.camYaw = 0;
    S.missions.index = 0;
  } else if (SHOT === 'roam') {
    // On-foot street level in the suburbs, pedestrians around.
    S.player.teleport(20, 44, Math.PI * 0.9);
    S.player.camYaw = Math.PI * 0.9;
    S.missions.index = 4; // free roam: debt paid line on the HUD
    S.missions.cash = 12500;
    S.missions.debt = 0;
    // Pull three pedestrians into the frame for the shot.
    const spots = [[28, 54], [12, 58], [30, 38]];
    S.traffic.peds.slice(0, 3).forEach((p, i) => {
      p.x = spots[i][0]; p.z = spots[i][1];
      p.heading = Math.atan2(S.player.pos.x - p.x, S.player.pos.z - p.z);
      p.state = 'walk';
    });
  } else if (SHOT === 'start') {
    S.state = 'title';
    S.hud.showTitle(true);
    S.hud.showHud(false);
  }
  if (SHOT) {
    // Let the sim settle before any screenshot is taken.
    for (let i = 0; i < 90; i++) stepSim(STEP);
    // Frame the shot: the chase camera looks forward, so a pursuer behind the
    // player is invisible — stage the police ahead, converging on Rook, and
    // stage two traffic cars ahead on the boulevard for the cover drive.
    const fwd = { x: Math.sin(S.player.heading), z: Math.cos(S.player.heading) };
    if (SHOT === 'chase') {
      S.police.cars.forEach((c, i) => {
        const ahead = 30 + i * 14;
        const side = i % 2 === 0 ? 10 : -10;
        c.mesh.position.set(
          S.player.pos.x + fwd.x * ahead - fwd.z * side,
          0,
          S.player.pos.z + fwd.z * ahead + fwd.x * side,
        );
        c.mesh.rotation.y = Math.atan2(S.player.pos.x - c.mesh.position.x, S.player.pos.z - c.mesh.position.z);
        c.speed = 18;
      });
    }
    if (SHOT === 'drive') {
      const movers = S.traffic.cars.filter((c) => !c.stolen).slice(0, 2);
      const spots = [[8, -52], [-4, -24]];
      movers.forEach((c, i) => {
        c.mesh.position.set(spots[i][0], 0, spots[i][1]);
        c.mesh.rotation.y = 0;
        c.speed = 9;
      });
    }
  }
}

// ---- fixed-step sim ------------------------------------------------------
function stepSim(dt) {
  S.simTime += dt;
  if (S.state === 'playing') {
    S.player.update(dt, S);
    S.traffic.update(dt, S);
    S.police.update(dt, S);
    S.missions.update(dt);
    const speedNorm = clamp(Math.abs(S.player.carSpeed) / 36, 0, 1);
    S.audio.update(dt, speedNorm, S.police.wanted, !S.player.onFoot);
  }
  S.input.endStep();
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  titleDrift(dt);
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    stepSim(STEP);
    acc -= STEP;
    n++;
  }
  if (S.state !== 'title' || SHOT === 'start') {
    // The title screen still renders the city behind it.
    S.hud.update(Math.min(dt, 0.05), S);
  }
  updateBeacon();
  // Screen shake decays and jitters the camera.
  if (S.shakeT > 0) {
    S.shakeT -= dt;
    const m = S.shakeMag * (S.shakeT / 0.35);
    camera.position.x += (Math.random() - 0.5) * m;
    camera.position.y += (Math.random() - 0.5) * m * 0.6;
    if (S.shakeT <= 0) S.shakeMag = 0;
  }
  renderer.render(scene, camera);
}

// Slow camera drift over the city while the title is up.
function titleDrift(dt) {
  if (S.state !== 'title') return;
  const t = performance.now() / 1000;
  const cx = Math.sin(t * 0.05) * 120;
  const cz = Math.cos(t * 0.04) * 120 - 20;
  camera.position.set(cx, 55, cz);
  camera.lookAt(0, 0, 0);
}

if (SHOT) applyStaging();
requestAnimationFrame(frame);

// ---- probe handle --------------------------------------------------------
window.__game = {
  version: 'solmara-1.0',
  state: S,
  shot: SHOT,
  seed: SEED,
  get simTime() { return S.simTime; },
  get playing() { return S.state === 'playing'; },
  get wanted() { return S.police.wanted; },
  get cash() { return S.missions.cash; },
  get missionIndex() { return S.missions.index; },
  get playerSpeed() { return S.player.speedMph; },
  get onFoot() { return S.player.onFoot; },
  step(n = 1) { for (let i = 0; i < n; i++) stepSim(STEP); },
};
