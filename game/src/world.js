// world.js — builds Solmara: the ground, the sea, the road grid, towers downtown,
// low suburbs, the docks east, the beach south, palms, streetlights, and every
// collision box. Also owns the low-poly car and pedestrian meshes, so every vehicle
// and walker in the game looks like it belongs to the same city.

import * as THREE from 'three';
import { makeRng, range, rangeInt, pick, makeAabb } from './util.js';
import { PALETTE, BUILDING_FACES, makeWindowTexture, makeGroundTexture } from './palette.js';

export const CITY_HALF = 232;      // playable half-extent; walls beyond this
export const SEA_Z = 238;          // sea starts here; the beach runs z 190..238
export const ROAD_STEP = 40;       // avenues and streets every 40 units
export const ROAD_HALF = 5;        // half width of a road

/** True when (x, z) sits on a road (within the asphalt band). */
export function onRoad(x, z) {
  const nearLine = (v) => {
    const m = ((v % ROAD_STEP) + ROAD_STEP) % ROAD_STEP;
    const d = Math.min(m, ROAD_STEP - m);
    return d <= ROAD_HALF + 1.5;
  };
  return nearLine(x) || nearLine(z);
}

/** Snap a point onto the nearest road centreline. */
export function snapToRoad(x, z) {
  const snap = (v) => Math.round(v / ROAD_STEP) * ROAD_STEP;
  const dx = Math.abs(x - snap(x));
  const dz = Math.abs(z - snap(z));
  return dx < dz ? { x: snap(x), z } : { x, z: snap(z) };
}

/**
 * Build the whole city into the scene. Returns the world handle the sim uses:
 * colliders (building AABBs), traffic loops, named places and spawn points.
 */
export function buildWorld(scene, seed) {
  const rng = makeRng(seed);
  const world = {
    colliders: [],
    loops: [],
    places: {
      start: { x: 0, z: -24 },
      redCar: { x: 3.5, z: -28 },
      docks: { x: 196, z: 120 },
      marina: { x: 176, z: 202 },
      garage: { x: -160, z: -160 },
      hospital: { x: -200, z: 160 },
      delivery: { x: -160, z: 160 },
      plaza: { x: 0, z: 0 },
    },
    palms: 0,
    lamps: 0,
    buildings: 0,
  };

  // ---- sky, light, fog -------------------------------------------------
  scene.background = new THREE.Color(0x9fd4f2);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 520);
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, PALETTE.hemiIntensity));

  // ---- ground + sea ----------------------------------------------------
  const groundTex = new THREE.CanvasTexture(makeGroundTexture());
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(480, 480),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(480, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, SEA_Z + 130);
  scene.add(sea);
  const seaDeep = new THREE.Mesh(
    new THREE.PlaneGeometry(480, 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.seaDeep }),
  );
  seaDeep.rotation.x = -Math.PI / 2;
  seaDeep.position.set(0, -0.7, SEA_Z + 330);
  scene.add(seaDeep);

  // ---- buildings -------------------------------------------------------
  const texVariants = [];
  for (let i = 0; i < 5; i++) {
    const tex = new THREE.CanvasTexture(makeWindowTexture(rng, pick(rng, BUILDING_FACES), 6, 12));
    tex.colorSpace = THREE.SRGBColorSpace;
    texVariants.push(tex);
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.roof });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const addBuilding = (cx, cz, w, d, h, mat) => {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    scene.add(mesh);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w * 0.92, 0.8, d * 0.92);
    roof.position.set(cx, h + 0.4, cz);
    scene.add(roof);
    world.colliders.push(makeAabb(cx, cz, w / 2 + 0.4, d / 2 + 0.4));
    world.buildings++;
  };

  for (let bx = -200; bx <= 200; bx += ROAD_STEP) {
    for (let bz = -200; bz <= 200; bz += ROAD_STEP) {
      const cx = bx + 20, cz = bz + 20;
      if (cz > 168) continue; // beach strip stays open
      const downtown = Math.abs(cx) < 90 && Math.abs(cz) < 90;
      const docks = cx > 150;
      if (downtown) {
        const h = range(rng, 34, 78);
        const w = range(rng, 18, 26), d = range(rng, 18, 26);
        const mat = new THREE.MeshLambertMaterial({ map: pick(rng, texVariants) });
        addBuilding(cx, cz, w, d, h, mat);
      } else if (docks) {
        const mat = new THREE.MeshLambertMaterial({ color: pick(rng, [0xb08d5f, 0x7a8a99, 0x9a7a5f]) });
        addBuilding(cx, cz, range(rng, 22, 28), range(rng, 14, 20), range(rng, 8, 13), mat);
      } else {
        // Suburbs: two or three low houses per block.
        const n = rangeInt(rng, 2, 3);
        for (let i = 0; i < n; i++) {
          const hx = cx + (i === 0 ? -7 : 7) + range(rng, -2, 2);
          const hz = cz + (i === 2 ? 8 : -6) + range(rng, -2, 2);
          const mat = new THREE.MeshLambertMaterial({ color: pick(rng, BUILDING_FACES) });
          addBuilding(hx, hz, range(rng, 9, 13), range(rng, 9, 13), range(rng, 6, 12), mat);
        }
      }
    }
  }

  // Docks cranes: two simple gantry cranes east, for the skyline.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a03c });
  for (const cz of [96, 144]) {
    const legA = new THREE.Mesh(boxGeo, craneMat);
    legA.scale.set(2, 26, 2); legA.position.set(212, 13, cz - 6); scene.add(legA);
    const legB = new THREE.Mesh(boxGeo, craneMat);
    legB.scale.set(2, 26, 2); legB.position.set(212, 13, cz + 6); scene.add(legB);
    const beam = new THREE.Mesh(boxGeo, craneMat);
    beam.scale.set(2, 2, 30); beam.position.set(212, 26, cz); scene.add(beam);
    const jib = new THREE.Mesh(boxGeo, craneMat);
    jib.scale.set(26, 2, 2); jib.position.set(200, 26, cz); scene.add(jib);
  }

  // ---- palms and streetlights ------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeafDark });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const leafGeo = new THREE.ConeGeometry(1.5, 4.5, 4);
  const addPalm = (x, z) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = range(rng, -0.08, 0.08);
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(leafGeo, i % 2 ? leafMat : leafMat2);
      leaf.position.y = 7.2;
      leaf.rotation.z = Math.PI / 2.4;
      leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.scale.set(1, 1, 0.35);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    world.palms++;
  };
  // Beach row + boulevard rows (palms sit well onto the sidewalk so the
  // chase camera never clips through a trunk).
  for (let x = -210; x <= 210; x += 18) addPalm(x + range(rng, -3, 3), 196 + range(rng, -2, 4));
  for (let z = -180; z <= 160; z += 36) {
    addPalm(10.5, z); addPalm(-10.5, z + 18);
  }

  const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.lampPole });
  const bulbMat = new THREE.MeshLambertMaterial({ color: PALETTE.lampGlow, emissive: 0xcc9900 });
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6);
  const bulbGeo = new THREE.SphereGeometry(0.42, 8, 6);
  for (let x = -200; x <= 200; x += ROAD_STEP) {
    for (let z = -200; z <= 200; z += ROAD_STEP) {
      if (rng() < 0.55) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x + 6.5, 3.25, z + 6.5);
      scene.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x + 6.5, 6.7, z + 6.5);
      scene.add(bulb);
      world.lamps++;
    }
  }

  // ---- traffic loops: rectangles around blocks, clockwise ---------------
  for (let i = 0; i < 14; i++) {
    const bx = rangeInt(rng, -4, 4) * ROAD_STEP + 20;
    const bz = rangeInt(rng, -4, 4) * ROAD_STEP + 20;
    if (bz > 160) continue;
    const r = 25; // half side of the loop, on road centrelines
    const loop = [
      { x: bx - r, z: bz - r }, { x: bx + r, z: bz - r },
      { x: bx + r, z: bz + r }, { x: bx - r, z: bz + r },
    ];
    world.loops.push(loop);
  }
  return world;
}

/**
 * Build one low-poly car. Options: color, convertible (open top), taxi sign,
 * police (light bar). Returns a THREE.Group whose forward is +X when rotation.y = 0.
 * The group gets .userData = { length, width } for collision.
 */
export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.75, 2.0), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  if (opts.convertible) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.8), darkMat);
    dash.position.set(0.7, 1.0, 0);
    g.add(dash);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 1.6), darkMat);
    seat.position.set(-0.5, 1.0, 0);
    g.add(seat);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 1.8), glassMat);
    cabin.position.set(-0.2, 1.2, 0);
    g.add(cabin);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  wheelGeo.rotateX(Math.PI / 2);
  for (const [wx, wz] of [[1.45, 1.0], [1.45, -1.0], [-1.45, 1.0], [-1.45, -1.0]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  // Headlights + taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8800 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd21f1f, emissive: 0x660000 });
  for (const wz of [0.7, -0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.5), headMat);
    h.position.set(2.22, 0.6, wz);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.5), tailMat);
    t.position.set(-2.22, 0.6, wz);
    g.add(t);
  }
  if (opts.police) {
    const barMat = new THREE.MeshLambertMaterial({ color: 0x2233ff, emissive: 0x1122aa });
    const barMat2 = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa1111 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), barMat);
    b1.position.set(-0.2, 1.62, -0.45);
    g.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), barMat2);
    b2.position.set(-0.2, 1.62, 0.45);
    g.add(b2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.3, 2.02),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.75;
    g.add(stripe);
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xf2b705, emissive: 0x664400 }));
    sign.position.set(-0.2, 1.65, 0);
    g.add(sign);
  }
  g.userData.length = 4.4;
  g.userData.width = 2.0;
  return g;
}

/** Build one pedestrian: capsule-ish body, coloured shirt, skin head, walk bob. */
export function makePedMesh(shirtColor, skinColor) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2c3540 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 8), shirtMat);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skinMat);
  head.position.y = 1.85;
  g.add(head);
  const legGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.6, 6);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(0, 0.3, 0.16);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0, 0.3, -0.16);
  g.add(legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.body = body;
  return g;
}
