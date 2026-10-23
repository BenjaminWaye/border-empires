// GREAT_CITY and METROPOLIS layouts: ever taller rings of clockwork
// skyscrapers round skybridged inner towers -- and, for the metropolis, an
// octagonal brass-banded megatower with cog clock faces, a brass spire,
// floating brass halos and an aether crystal -- with airships overhead and
// the running lights of courier gyros circling between the rings.
import type { TownColor } from "./town-mesh-builder.js";
import { flowerBed } from "./town-flourishes.js";
import { beacon, circlingAirship, gear, lampPost, octagonPlate, polar, skyBridge, spinning, type TownBuilders } from "./town-parts.js";
import { orrery, skyscraper, towerRing, type Crown } from "./town-skyscraper.js";

/** Skybridged inner ring of tall towers. */
const innerTowers = (
  t: TownBuilders, count: number, radius: number, startDeg: number, w: number,
  h: readonly [number, number], crowns: readonly Crown[], bridgeYs: readonly number[]
): void => {
  const points = Array.from({ length: count }, (_, i) => polar(radius, startDeg + (i * 360) / count));
  points.forEach(([x, z], i) => {
    skyscraper(t, {
      x, z, w, d: w,
      h: h[0] + t.random() * (h[1] - h[0]),
      ry: Math.PI / 4 + i * 0.7,
      crown: crowns[i % crowns.length]!,
      shell: i % 2 === 0 ? "stoneLight" : "stone",
      glass: i % 3 !== 1
    });
  });
  for (let i = 0; i < points.length; i += 1) {
    const [x0, z0] = points[i]!;
    const [x1, z1] = points[(i + 1) % points.length]!;
    for (const y of bridgeYs) skyBridge(t, x0, y, z0, x1, y, z1);
  }
};

type GyroLane = { readonly radius: number; readonly y: number; readonly gyros: number; readonly speed: number; readonly light: TownColor };

/** Courier gyros -- plain combustion rotorcraft, seen as their running
 * lights -- circling the city in lanes, each at its own height and pace
 * (neighbouring lanes in opposite directions). */
const gyroLanes = (t: TownBuilders, lanes: readonly GyroLane[]): void => {
  for (const lane of lanes) {
    spinning(t, 0, lane.y, 0, [0, 1, 0], lane.speed, () => {
      const offset = t.random() * 360;
      for (let i = 0; i < lane.gyros; i += 1) {
        const [x, z] = polar(lane.radius, offset + (i * 360) / lane.gyros + (t.random() - 0.5) * (180 / lane.gyros));
        t.glow.gem(x, lane.y, z, 0.0042, 0.0042, lane.light);
      }
    });
  }
};

export const buildGreatCity = (t: TownBuilders): void => {
  octagonPlate(t, 0.46);
  towerRing(t, {
    count: 10, radius: 0.35, startDeg: 18, w: 0.072, h: [0.24, 0.36],
    crowns: ["flat", "dome", "clock", "flat", "pod", "dome", "spire", "flat", "fins", "dome"], annexH: [0.11, 0.17]
  });
  innerTowers(t, 4, 0.16, 45, 0.08, [0.5, 0.6], ["clock", "spire", "fins", "pod"], [0.22, 0.36]);
  orrery(t, 0, 0, 0.8);
  flowerBed(t, 0, 0, 0.068, 8, 0.011);
  lampPost(t, 0.0, 0.25);
  lampPost(t, 0.0, -0.25);
  lampPost(t, 0.25, 0.0);
  lampPost(t, -0.25, 0.0);
  gyroLanes(t, [
    { radius: 0.262, y: 0.15, gyros: 7, speed: 0.32, light: "lamp" },
    { radius: 0.27, y: 0.27, gyros: 6, speed: -0.26, light: "lampWarm" }
  ]);
  circlingAirship(t, -0.14, 0.74, 0.2, 0.22, 0.07);
};

/** Octagonal megatower: stacked stone drums in brass bands, lamplit rings,
 * cog clock faces, a brass spire, brass halos and an aether crystal. */
const megatower = (t: TownBuilders): void => {
  t.body.cylinder(0, 0, 0, 0.09, 0.096, 0.02, "graphite", 8, Math.PI / 8);
  let y = 0.02;
  const drums = [
    { r: 0.072, h: 0.3, shell: "stone" },
    { r: 0.06, h: 0.25, shell: "stoneLight" },
    { r: 0.047, h: 0.18, shell: "stone" }
  ] as const;
  for (const drum of drums) {
    t.body.cylinder(0, y, 0, drum.r, drum.r, drum.h, drum.shell, 8, Math.PI / 8);
    for (let band = 0.18; band < 0.95; band += 0.2) {
      t.glow.cylinder(0, y + drum.h * band, 0, drum.r * 1.01, drum.r * 1.01, drum.h * 0.05, "lamp", 8, Math.PI / 8);
    }
    t.body.cylinder(0, y + drum.h - 0.008, 0, drum.r * 1.08, drum.r * 1.08, 0.01, "brass", 8, Math.PI / 8);
    y += drum.h;
  }
  // Cog clock faces on the middle drum.
  for (const quarter of [0, 1, 2, 3]) {
    const angle = (quarter * Math.PI) / 2;
    gear(t, Math.sin(angle) * 0.062, 0.02 + 0.3 + 0.2, Math.cos(angle) * 0.062, 0.03, angle);
  }
  t.body.cone(0, y, 0, 0.034, 0.18, "brass", 8);
  // Warning lights round the top drum's brass rim, outside the spire's foot.
  for (const quarter of [0, 1, 2, 3]) {
    const angle = Math.PI / 4 + (quarter * Math.PI) / 2;
    beacon(t, Math.sin(angle) * 0.044, y + 0.006, Math.cos(angle) * 0.044, 0.006);
  }
  // Halos turning opposite ways round the spire, the crystal slowly spinning.
  spinning(t, 0, 0, 0, [0, 1, 0], 0.25, () => {
    t.body.ring(0, y + 0.06, 0, 0.11, "brass", 0.05);
    t.body.blob(0.11, y + 0.06, 0, 0.008, "brass");
  });
  spinning(t, 0, 0, 0, [0, 1, 0], -0.4, () => {
    t.body.ring(0, y + 0.13, 0, 0.08, "brassDark", 0.06);
    t.body.blob(-0.08, y + 0.13, 0, 0.007, "brassDark");
  });
  spinning(t, 0, 0, 0, [0, 1, 0], 0.8, () => t.glow.gem(0, y + 0.22, 0, 0.022, 0.05, "aether"));
};

export const buildMetropolis = (t: TownBuilders): void => {
  octagonPlate(t, 0.47);
  towerRing(t, {
    count: 12, radius: 0.37, startDeg: 15, w: 0.066, h: [0.3, 0.44],
    crowns: ["flat", "dome", "clock", "pod", "flat", "spire", "dome", "fins", "flat", "clock", "dome", "pod"], annexH: [0.13, 0.2]
  });
  innerTowers(t, 6, 0.2, 0, 0.07, [0.5, 0.64], ["clock", "pod", "spire", "fins", "dome", "clock"], [0.24]);
  megatower(t);
  for (let i = 0; i < 6; i += 1) {
    const [x, z] = polar(0.2, i * 60);
    skyBridge(t, x * 0.4, 0.36, z * 0.4, x * 0.82, 0.34, z * 0.82);
  }
  for (const degrees of [45, 135, 225, 315]) {
    const [x, z] = polar(0.3, degrees);
    lampPost(t, x, z);
  }
  gyroLanes(t, [
    { radius: 0.3, y: 0.18, gyros: 8, speed: 0.3, light: "lamp" },
    { radius: 0.305, y: 0.3, gyros: 7, speed: -0.24, light: "lampWarm" },
    { radius: 0.31, y: 0.42, gyros: 6, speed: 0.2, light: "lamp" }
  ]);
  // Above the inner towers' crowns, at separate heights so the two never meet.
  circlingAirship(t, -0.15, 0.88, 0.2, 0.22, 0.06);
  circlingAirship(t, 0.25, 1.0, -0.1, 0.2, -0.05);
};
