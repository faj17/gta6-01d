// util.js — small shared helpers: seeded random numbers, clamping, angles, AABBs.
// Nothing here knows about three.js or the DOM; every other module imports from it.

/** Mulberry32: a tiny deterministic PRNG so ?seed=1 replays the same city. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with a seeded rng. */
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

/** Random number in [min, max). */
export function range(rng, min, max) { return min + rng() * (max - min); }

/** Random integer in [min, max]. */
export function rangeInt(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function lerp(a, b, t) { return a + (b - a) * t; }

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move angle a toward b by at most maxStep radians. */
export function angleToward(a, b, maxStep) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Format a dollar amount with commas, no decimals: 12345 -> "$12,345". */
export function money(n) {
  const s = String(Math.max(0, Math.round(n)));
  return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Axis-aligned box used for building collision. { minX, maxX, minZ, maxZ } */
export function makeAabb(cx, cz, hx, hz) {
  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz };
}

/**
 * Push a circle (x, z, radius) out of an AABB. Returns true when a push happened
 * and mutates pos in place. Used for the player, cars and pedestrians alike.
 */
export function pushCircleOutOfAabb(pos, radius, box) {
  const cx = clamp(pos.x, box.minX, box.maxX);
  const cz = clamp(pos.z, box.minZ, box.maxZ);
  const dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * radius;
    pos.z = cz + (dz / d) * radius;
  } else {
    // Centre is inside the box: push out along the smallest penetration axis.
    const pl = pos.x - box.minX, pr = box.maxX - pos.x;
    const pt = pos.z - box.minZ, pb = box.maxZ - pos.z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) pos.x = box.minX - radius;
    else if (m === pr) pos.x = box.maxX + radius;
    else if (m === pt) pos.z = box.minZ - radius;
    else pos.z = box.maxZ + radius;
  }
  return true;
}

/** True when point (x, z) is inside the box (with an optional margin). */
export function pointInAabb(x, z, box, margin = 0) {
  return x >= box.minX - margin && x <= box.maxX + margin
    && z >= box.minZ - margin && z <= box.maxZ + margin;
}
