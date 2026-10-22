// Lays a name out over an arbitrary set of tiles (an island's explored
// garrisons), the same way player names are laid over their territory
// (client-territory-name-layout.ts): flood the tiles connected to the seed
// points, find the core (tiles two or more steps from the edge), and run the
// name along the core's long axis. A thin region with no core uses all of
// its tiles instead, so a narrow garrisoned strip still carries a name.
import { labelForCore, type CorePoint } from "./client-territory-name-layout.js";

export type RegionNameLayout = {
  readonly points: ReadonlyArray<{ x: number; y: number }>;
  readonly heightTiles: number;
  readonly spanTiles: number;
};

const NEIGHBOURS = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ dx, dy }))).filter(({ dx, dy }) => dx !== 0 || dy !== 0);

export const layoutNameInRegion = (
  seeds: ReadonlyArray<{ x: number; y: number }>,
  inside: (x: number, y: number) => boolean,
  maxTiles = 20_000
): RegionNameLayout | undefined => {
  const key = (x: number, y: number): string => `${x},${y}`;
  const members = new Map<string, { x: number; y: number; depth: number }>();
  const queue: Array<{ x: number; y: number }> = [];
  for (const seed of seeds) {
    const x = Math.round(seed.x);
    const y = Math.round(seed.y);
    if (members.has(key(x, y)) || !inside(x, y)) continue;
    members.set(key(x, y), { x, y, depth: 0 });
    queue.push({ x, y });
  }
  for (let index = 0; index < queue.length && members.size < maxTiles; index += 1) {
    const current = queue[index]!;
    for (const { dx, dy } of NEIGHBOURS) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (members.has(key(x, y)) || !inside(x, y)) continue;
      members.set(key(x, y), { x, y, depth: 0 });
      queue.push({ x, y });
    }
  }
  if (members.size === 0) return undefined;
  // Chebyshev distance to the edge: 1 on the rim, +1 per ring inward.
  const frontier: Array<{ x: number; y: number; depth: number }> = [];
  for (const member of members.values()) {
    if (NEIGHBOURS.some(({ dx, dy }) => !members.has(key(member.x + dx, member.y + dy)))) {
      member.depth = 1;
      frontier.push(member);
    }
  }
  for (let index = 0; index < frontier.length; index += 1) {
    const current = frontier[index]!;
    for (const { dx, dy } of NEIGHBOURS) {
      const next = members.get(key(current.x + dx, current.y + dy));
      if (!next || next.depth !== 0) continue;
      next.depth = current.depth + 1;
      frontier.push(next);
    }
  }
  let core: CorePoint[] = [...members.values()].filter((member) => member.depth >= 2);
  if (core.length === 0) core = [...members.values()];
  const maxDepth = Math.max(...core.map((point) => point.depth));
  const label = labelForCore("", core, Math.max(2, maxDepth), members.size);
  return { points: label.points, heightTiles: label.heightTiles, spanTiles: label.spanTiles };
};
