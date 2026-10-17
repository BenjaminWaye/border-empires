import type { ActiveAetherBridgeView, ActiveAetherWallView } from "../runtime-types.js";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export type AiTacticalView = {
  visibleTileKeys: string[];
  dormantObservatoryKeys: string[];
  castRange: number;
  omittedOriginCount?: number;
  bridgeLandingKeys?: string[];
  wallEdges?: string[];
};

/** Copies visibility from the existing bounded spatial front, never selects
 * concrete actions in a snapshot builder. At most 16 × 121 visibility reads, independent of empire size. */
export function buildAiTacticalView(input: {
  focusKeys: readonly string[];
  isVisible: (key: string) => boolean;
  crystalDormancy: ReadonlySet<string>;
  castRange: number;
  bridges?: readonly ActiveAetherBridgeView[];
  walls?: readonly ActiveAetherWallView[];
}): AiTacticalView {
  const visible = new Set<string>();
  const stride = Math.max(1, Math.ceil(input.focusKeys.length / 16));
  for (let index = 0; index < input.focusKeys.length; index += stride) {
    const key = input.focusKeys[index]!;
    const [x, y] = key.split(",").map(Number);
    if (x === undefined || y === undefined) continue;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const neighbor = `${wrapX(x + dx, WORLD_WIDTH)},${wrapY(y + dy, WORLD_HEIGHT)}`;
        if (!visible.has(neighbor) && input.isVisible(neighbor)) visible.add(neighbor);
      }
    }
  }
  return {
    visibleTileKeys: [...visible], castRange: input.castRange,
    omittedOriginCount: input.focusKeys.length - Math.ceil(input.focusKeys.length / stride),
    bridgeLandingKeys: (input.bridges ?? []).map(bridge => `${bridge.to.x},${bridge.to.y}`),
    wallEdges: (input.walls ?? []).flatMap(wall => Array.from({ length: wall.length }, (_, index) => {
      const x = wrapX(wall.origin.x + (wall.direction === "N" || wall.direction === "S" ? index : 0), WORLD_WIDTH);
      const y = wrapY(wall.origin.y + (wall.direction === "E" || wall.direction === "W" ? index : 0), WORLD_HEIGHT);
      return `${x},${y}:${wall.direction}`;
    })),
    dormantObservatoryKeys: [...input.crystalDormancy].filter(key => key.endsWith(":observatory")).map(key => key.slice(0, -12))
  };
}
