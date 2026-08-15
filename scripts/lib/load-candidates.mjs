// Candidate selection for the concurrent load harness: which action a
// simulated client should send next, given its current view of the world.
//
// Extracted from rewrite-concurrent-load.mjs (500-line source budget, see
// AGENTS.md). This module is the pure, unit-testable half of the harness —
// no sockets, no timers — and is exercised directly by
// rewrite-concurrent-load.test.mjs.

const CANDIDATE_VISION_RADIUS = 4;

export const tileKey = (x, y) => `${x},${y}`;

export const parseMuster = (musterJson) => {
  if (typeof musterJson !== "string" || musterJson.length === 0) return undefined;
  try {
    const parsed = JSON.parse(musterJson);
    return typeof parsed?.mode === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const normalizeTile = (tile) => ({
  x: Number(tile.x),
  y: Number(tile.y),
  ...(typeof tile.terrain === "string" ? { terrain: tile.terrain } : {}),
  ...(typeof tile.resource === "string" ? { resource: tile.resource } : {}),
  ...(typeof tile.ownerId === "string" ? { ownerId: tile.ownerId } : {}),
  ...(typeof tile.ownershipState === "string" ? { ownershipState: tile.ownershipState } : {}),
  // Settle-eligibility: owned LAND tile with neither field set has no town yet.
  ...(typeof tile.townPopulationTier === "string" ? { townPopulationTier: tile.townPopulationTier } : {}),
  ...(typeof tile.townJson === "string" && tile.townJson.length > 0 ? { hasTown: true } : {}),
  // Muster state: undefined = no flag (can SET_MUSTER HOLD); mode "HOLD" = flag
  // placed but not yet firing (can switch to ADVANCE); mode "ADVANCE" = already
  // auto-firing via the simulation's background muster tick (runtime-muster-tick.ts)
  // — nothing further to send for it, the load is server-side from here.
  ...(parseMuster(tile.musterJson) ? { muster: parseMuster(tile.musterJson) } : {})
});

const candidateScore = (tilesByKey, payload, playerId) => {
  const { toX, toY, type } = payload;
  let score = 0;
  for (let dy = -CANDIDATE_VISION_RADIUS; dy <= CANDIDATE_VISION_RADIUS; dy += 1) {
    for (let dx = -CANDIDATE_VISION_RADIUS; dx <= CANDIDATE_VISION_RADIUS; dx += 1) {
      const neighbor = tilesByKey.get(tileKey(toX + dx, toY + dy));
      if (!neighbor) { score += 4; continue; }
      if (neighbor.terrain !== "LAND") { score -= 8; continue; }
      if (!neighbor.ownerId) { score += 3; continue; }
      if (neighbor.ownerId !== playerId) { score += type === "ATTACK" ? 2 : 1; continue; }
      score -= 1;
    }
  }
  return score;
};

// Invalid-candidate learning is scoped by action type (not just tile
// coordinate) — a coordinate that failed as an EXPAND target (say, someone
// else claimed the neighbor) says nothing about whether that same
// coordinate is eligible for a completely different action, e.g. the
// player's own SETTLE on a tile that happens to sit at those coordinates.
// Sharing one unscoped set across all four action types was found live to
// make SETTLE/SET_MUSTER candidate pools silently empty out within the
// first few EXPAND/ATTACK rejections, well before their own tiles ever
// actually failed. SET_MUSTER's two modes (HOLD/ADVANCE) are scoped
// separately too — they have unrelated eligibility rules.
export const invalidationScope = (payload) => (payload.type === "SET_MUSTER" ? `SET_MUSTER_${payload.mode}` : payload.type);
export const scopedKey = (scope, x, y) => `${scope}:${tileKey(x, y)}`;
export const originKeyOf = (payload) =>
  scopedKey(invalidationScope(payload), payload.fromX ?? payload.x, payload.fromY ?? payload.y);
export const targetKeyOf = (payload) =>
  scopedKey(invalidationScope(payload), payload.toX ?? payload.x, payload.toY ?? payload.y);

const collectFrontierCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const expandPayloads = [];
  const attackPayloads = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    for (const [dx, dy] of directions) {
      const neighbor = tilesByKey.get(tileKey(tile.x + dx, tile.y + dy));
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      if (!neighbor.ownerId) {
        if (invalidOrigins.has(scopedKey("EXPAND", tile.x, tile.y)) || invalidTargets.has(scopedKey("EXPAND", neighbor.x, neighbor.y))) continue;
        expandPayloads.push({ type: "EXPAND", fromX: tile.x, fromY: tile.y, toX: neighbor.x, toY: neighbor.y });
        continue;
      }
      if (neighbor.ownerId !== playerId) {
        if (invalidOrigins.has(scopedKey("ATTACK", tile.x, tile.y)) || invalidTargets.has(scopedKey("ATTACK", neighbor.x, neighbor.y))) continue;
        attackPayloads.push({ type: "ATTACK", fromX: tile.x, fromY: tile.y, toX: neighbor.x, toY: neighbor.y });
      }
    }
  }

  const ranked = (list) =>
    list.map((p) => ({ payload: p, score: candidateScore(tilesByKey, p, playerId) }))
      .sort((a, b) => b.score - a.score)
      .map((e) => e.payload);

  return { expands: ranked(expandPayloads), attacks: ranked(attackPayloads) };
};

// SETTLE requires ownershipState === "FRONTIER" specifically (see
// handleSettleCommand in apps/simulation/src/runtime/runtime.ts) — an
// established interior ("SETTLED") tile is not eligible even though you own
// it. Owning-but-not-frontier is the common case for older territory, so
// this is a much narrower pool than "everything you own without a town".
export const collectSettleCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const payloads = [];
  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    if (tile.ownershipState !== "FRONTIER") continue;
    if (tile.townPopulationTier || tile.hasTown) continue;
    const key = scopedKey("SETTLE", tile.x, tile.y);
    if (invalidOrigins.has(key) || invalidTargets.has(key)) continue;
    payloads.push({ type: "SETTLE", x: tile.x, y: tile.y });
  }
  return payloads;
};

// Owned LAND tiles with no muster flag yet — candidates to place one (mode HOLD).
export const collectMusterHoldCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const payloads = [];
  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    if (tile.muster) continue;
    const key = scopedKey("SET_MUSTER_HOLD", tile.x, tile.y);
    if (invalidOrigins.has(key) || invalidTargets.has(key)) continue;
    payloads.push({ type: "SET_MUSTER", x: tile.x, y: tile.y, mode: "HOLD" });
  }
  return payloads;
};

// Owned tiles already holding a muster flag (mode HOLD) — candidates to activate
// it (mode ADVANCE). Once ADVANCE is set, the simulation's own background muster
// tick (runtime-muster-tick.ts) auto-fires attacks via BFS from that tile on its
// own cadence — the client sends this ONE command, not a stream of attacks, so
// the ongoing load from "100 players with active ADVANCE flags" is mostly
// server-side tick cost, not client-request volume. See the load-test plan.
// MUSTER_ATTACK_COST (packages/shared/src/config.ts) is 60 — the higher of the
// two mustered-manpower thresholds the server enforces (FRONTIER_ATTACK_MUSTER_COST
// is 15, for expand-via-muster). Requiring the full 60 before treating a flag as
// advance-ready keeps this conservative regardless of what auto-fire finds nearby.
// Accrual is MUSTER_BASE_RATE_PER_MIN=180/min, so a flag placed seconds ago in
// this same run won't clear this bar — ADVANCE candidates mostly come from
// flags that were already mustering before the test started (see the
// pre-seeding note in the load-test plan).
const MUSTER_ADVANCE_READY_AMOUNT = 60;

export const collectMusterAdvanceCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const payloads = [];
  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    if (tile.muster?.mode !== "HOLD") continue;
    if (!(Number(tile.muster.amount) >= MUSTER_ADVANCE_READY_AMOUNT)) continue;
    const key = scopedKey("SET_MUSTER_ADVANCE", tile.x, tile.y);
    if (invalidOrigins.has(key) || invalidTargets.has(key)) continue;
    payloads.push({ type: "SET_MUSTER", x: tile.x, y: tile.y, mode: "ADVANCE" });
  }
  return payloads;
};

// Weighted mix approximating a real player's action spread: expand and attack
// dominate, settling and mustering are less frequent. Configurable via env so
// a run can be skewed toward stressing one action type specifically.
const ACTION_WEIGHTS = {
  EXPAND: Math.max(0, Number(process.env.WEIGHT_EXPAND ?? "40")),
  ATTACK: Math.max(0, Number(process.env.WEIGHT_ATTACK ?? "25")),
  SETTLE: Math.max(0, Number(process.env.WEIGHT_SETTLE ?? "20")),
  MUSTER_HOLD: Math.max(0, Number(process.env.WEIGHT_MUSTER_HOLD ?? "8")),
  MUSTER_ADVANCE: Math.max(0, Number(process.env.WEIGHT_MUSTER_ADVANCE ?? "7"))
};

// Picks one candidate payload per call, weighted across the pools that
// currently have anything eligible. Falls back through EXPAND -> ATTACK when
// a pool is empty (matches the prior EXPAND-preferred behavior) rather than
// failing outright just because, say, everything is already settled.
export const pickCandidatePayload = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const { expands, attacks } = collectFrontierCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);
  const settles = collectSettleCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);
  const musterHolds = collectMusterHoldCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);
  const musterAdvances = collectMusterAdvanceCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);

  const pools = [
    { weight: ACTION_WEIGHTS.EXPAND, list: expands },
    { weight: ACTION_WEIGHTS.ATTACK, list: attacks },
    { weight: ACTION_WEIGHTS.SETTLE, list: settles },
    { weight: ACTION_WEIGHTS.MUSTER_HOLD, list: musterHolds },
    { weight: ACTION_WEIGHTS.MUSTER_ADVANCE, list: musterAdvances }
  ].filter((pool) => pool.list.length > 0 && pool.weight > 0);

  if (pools.length === 0) {
    // Nothing weighted is available — fall back to whatever exists at all,
    // preferring expand (matches the original script's behavior).
    if (expands.length > 0) return expands[0];
    if (attacks.length > 0) return attacks[0];
    if (settles.length > 0) return settles[0];
    if (musterHolds.length > 0) return musterHolds[0];
    if (musterAdvances.length > 0) return musterAdvances[0];
    return undefined;
  }

  const totalWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const pool of pools) {
    roll -= pool.weight;
    if (roll <= 0) return pool.list[0];
  }
  return pools.at(-1).list[0];
};
