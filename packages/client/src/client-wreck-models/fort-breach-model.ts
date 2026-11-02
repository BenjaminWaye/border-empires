// Ground model laid under a fort breached in a capture (see
// client-map-3d-fort-breach.ts, which knocks down the fort's own walls and a
// tower): scorched earth at the breach and inside the walls, the attackers'
// broken ladders and spent arrows, embers in the rubble and smoke rising from
// the gap. Local frame: the breached wall is the one at +x.
import { ember, pipeBetween, scorch, smokeColumn, wreckRandom, type WreckBuilders } from "./wreck-kit.js";

export const buildFortBreachGround = (t: WreckBuilders, variant: number): void => {
  const random = wreckRandom(401 + variant);
  scorch(t, 0.36, 0.02, 0.22, random);
  scorch(t, 0.05, -0.05, 0.2, random);
  scorch(t, 0.6, 0.0, 0.16, random);
  // A siege ladder broken against the gap.
  for (const side of [-1, 1]) pipeBetween(t, [0.62, 0.004, 0.02 + side * 0.035], [0.4, 0.004, 0.05 + side * 0.035], 0.005, "trunk");
  for (let k = 0; k < 5; k += 1) {
    const x = 0.6 - k * 0.045;
    pipeBetween(t, [x, 0.006, 0.0], [x, 0.006, 0.09], 0.0035, "trunk");
  }
  for (let i = 0; i < 12; i += 1) {
    const x = 0.15 + random() * 0.5;
    const z = (random() - 0.5) * 0.5;
    const tail: [number, number] = [(random() - 0.5) * 0.04, (random() - 0.5) * 0.04];
    pipeBetween(t, [x, -0.004, z], [x + tail[0], 0.045, z + tail[1]], 0.0018, "trunk");
  }
  for (let i = 0; i < 6; i += 1) ember(t, 0.3 + random() * 0.15, 0.02, (random() - 0.5) * 0.25, 0.007 + random() * 0.005, random, i < 2);
  smokeColumn(t, 0.38, 0.12, 0.02, 6, 0.9, random, 0.05);
  smokeColumn(t, 0.05, 0.05, -0.08, 4, 0.55, random, 0.035);
};

/** A captured resource site still burning: scorched ground, embers and smoke. */
export const buildResourceFire = (t: WreckBuilders, variant: number): void => {
  const random = wreckRandom(503 + variant);
  scorch(t, 0.1, 0.12, 0.2, random);
  scorch(t, -0.15, -0.05, 0.14, random);
  for (let i = 0; i < 6; i += 1) ember(t, (random() - 0.5) * 0.5, 0.012, (random() - 0.5) * 0.5, 0.008 + random() * 0.006, random, i < 3);
  smokeColumn(t, 0.1, 0.05, 0.12, 6, 1.0, random, 0.055);
  smokeColumn(t, -0.15, 0.04, -0.05, 5, 0.75, random, 0.045);
};
