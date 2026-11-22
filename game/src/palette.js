// palette.js — the whole look of Solmara in one place: one warm afternoon sun,
// teal sea, pale sand, cream towers and loud car paint. Every module that colours
// anything imports from here so the city stays coherent.

export const PALETTE = {
  skyTop: 0x7ec8f2,
  skyHorizon: 0xffe3b3,
  fog: 0xf2d9a8,
  sun: 0xffe9c4,
  sunIntensity: 2.6,
  hemiSky: 0xbfd9ff,
  hemiGround: 0x8a6f4d,
  hemiIntensity: 0.85,
  sea: 0x1f8fa8,
  seaDeep: 0x0d5f7a,
  sand: 0xe8d29a,
  sandDark: 0xd9bd7f,
  grass: 0x7fae5a,
  asphalt: 0x3a3f46,
  asphaltEdge: 0x2c3036,
  laneMark: 0xf5e9c8,
  sidewalk: 0xb8b0a0,
  buildingCream: 0xf2e3c8,
  buildingSand: 0xe0c49a,
  buildingGlass: 0x2f6f8f,
  buildingCoral: 0xe8907a,
  buildingWhite: 0xf7f4ec,
  buildingTeal: 0x4fa8a0,
  roof: 0x8a7a68,
  palmTrunk: 0x7a5a38,
  palmLeaf: 0x2f9e5f,
  palmLeafDark: 0x1f7a45,
  lampPole: 0x2e3438,
  lampGlow: 0xffe9a8,
};

export const CAR_COLORS = [
  0xd8382c, // Rook's red convertible
  0xf2b705, // marina yellow sports car
  0x2e6fd8, 0x38b24a, 0xe8e8e8, 0x22262c, 0x7a4fd0, 0xe07a2c,
  0x39c2d7, 0xb8c4cc, 0x8a2f5e, 0x3d9970,
];

export const CAR_NAMES = [
  'Vesper GT', 'Cortez Coupe', 'Marlin Sedan', 'Palmera Van', 'Solstice Hatch',
  'Dune Buggy', 'Harbor Taxi', 'Coral Roadster', 'Tide Runner', 'Sunset Cruiser',
];

export const PED_SHIRTS = [
  0xe84a5f, 0x2e86de, 0xf2b705, 0x38b24a, 0x7a4fd0, 0xe07a2c,
  0x39c2d7, 0xf7f4ec, 0xff8fb3, 0x5ad1a0, 0xff6b35, 0x4a6fa5,
];

export const PED_SKINS = [0xc98d64, 0x8a5a3b, 0xe8b88a, 0x6e4423, 0xf0c8a0];

export const BUILDING_FACES = [
  PALETTE.buildingCream, PALETTE.buildingSand, PALETTE.buildingWhite,
  PALETTE.buildingCoral, PALETTE.buildingTeal, PALETTE.buildingGlass,
];

/** A canvas texture of lit windows for a tower face. Seeded so every replay matches. */
export function makeWindowTexture(rng, baseColor, cols, rows) {
  const w = 128, h = 256;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  g.fillRect(0, 0, w, h);
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.42;
      const shade = 0.55 + rng() * 0.45;
      if (lit) {
        g.fillStyle = `rgba(255, 214, 130, ${0.85 * shade})`;
      } else {
        g.fillStyle = `rgba(20, 42, 60, ${0.55 + 0.35 * shade})`;
      }
      g.fillRect(c * cw + 3, r * ch + 4, cw - 6, ch - 8);
    }
  }
  return cv;
}

/** A canvas texture for the ground: asphalt roads, pale sidewalks, sand beach. */
export function makeGroundTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  // City tile spans [-240, 240] in world units; the texture maps it 1:1.
  const toPx = (v) => ((v + 240) / 480) * S;
  g.fillStyle = '#b8b0a0'; // sidewalk base
  g.fillRect(0, 0, S, S);
  // Beach band along the south edge (z > 190).
  g.fillStyle = '#e8d29a';
  g.fillRect(0, toPx(190), S, S - toPx(190));
  // Roads: vertical and horizontal bands every 40 units from -200 to 200.
  g.fillStyle = '#3a3f46';
  for (let v = -200; v <= 200; v += 40) {
    g.fillRect(toPx(v - 5), 0, toPx(v + 5) - toPx(v - 5), S);
    g.fillRect(0, toPx(v - 5), S, toPx(v + 5) - toPx(v - 5));
  }
  // Centre dashes.
  g.fillStyle = '#f5e9c8';
  for (let v = -200; v <= 200; v += 40) {
    for (let t = -200; t <= 200; t += 16) {
      g.fillRect(toPx(v) - 1.5, toPx(t), 3, 7);
      g.fillRect(toPx(t), toPx(v) - 1.5, 7, 3);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(245, 233, 200, 0.85)';
  for (let x = -200; x <= 200; x += 40) {
    for (let z = -200; z <= 200; z += 40) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(toPx(x + i * 2) - 1, toPx(z - 7), 2, 4);
        g.fillRect(toPx(x + i * 2) - 1, toPx(z + 3), 2, 4);
      }
    }
  }
  return cv;
}
