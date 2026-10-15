// Client half of the simulation's AETHER_SHIELDS push
// (apps/simulation/src/aether-shield/aether-shield-broadcast.ts): the OTHER
// players' Aether Towers that are shielding land this player can see,
// including towers hidden in fog and with the server's own cooldown and
// dormancy verdict, neither of which the client can know for an enemy.
// client-aether-tower-protection.ts merges it with the player's own towers.

export type ServerShieldTower = { readonly x: number; readonly y: number; readonly ownerId: string };

export const createInitialAetherShieldState = () => ({
  // `undefined` until the first AETHER_SHIELDS arrives (or against a server
  // that never sends one): the field then falls back to visible towers only.
  aetherShieldTowers: undefined as readonly ServerShieldTower[] | undefined,
  aetherShieldRevision: 0
});

type AetherShieldState = ReturnType<typeof createInitialAetherShieldState>;

const isServerShieldTower = (value: unknown): value is ServerShieldTower => {
  if (!value || typeof value !== "object") return false;
  const tower = value as Record<string, unknown>;
  return Number.isInteger(tower.x) && Number.isInteger(tower.y) && typeof tower.ownerId === "string" && tower.ownerId.length > 0;
};

/** Applies one AETHER_SHIELDS message. Returns false (state untouched) for a malformed payload. */
export const applyAetherShieldsMessage = (state: AetherShieldState, msg: Record<string, unknown>): boolean => {
  if (!Array.isArray(msg.towers)) return false;
  state.aetherShieldTowers = msg.towers.filter(isServerShieldTower).map((tower) => ({ x: tower.x, y: tower.y, ownerId: tower.ownerId }));
  state.aetherShieldRevision += 1;
  return true;
};
