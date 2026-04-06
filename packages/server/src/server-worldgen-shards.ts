type WorldgenDeps = Record<string, any>;

export const createServerWorldgenShards = (deps: WorldgenDeps) => {
  const {
    terrainAt,
    key,
    docksByTile,
    clusterByTile,
    townsByTile,
    shardSitesByTile,
    now,
    INITIAL_SHARD_SCATTER_COUNT,
    seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    currentShardRainNotice,
    SHARD_RAIN_TTL_MS,
    nextShardRainStartAt,
    getLastShardRainWarningSlotKey,
    setLastShardRainWarningSlotKey,
    broadcast,
    hasOnlinePlayers,
    SHARD_RAIN_SITE_MIN,
    SHARD_RAIN_SITE_MAX,
    broadcastLocalVisionDelta,
    SHARD_RAIN_SCHEDULE_HOURS,
    getLastShardRainSlotKey,
    setLastShardRainSlotKey,
    parseKey,
    markSummaryChunkDirtyAtTile,
    visible,
    getOrInitStrategicStocks
  } = deps;

  const canHostShardSiteAt = (x: number, y: number): boolean => terrainAt(x, y) === "LAND" && !docksByTile.has(key(x, y)) && !clusterByTile.has(key(x, y)) && !townsByTile.has(key(x, y)) && !shardSitesByTile.has(key(x, y));

  const shardSiteViewAt = (tileKey: string) => {
    const site = shardSitesByTile.get(tileKey);
    if (!site) return undefined;
    if (typeof site.expiresAt === "number" && site.expiresAt <= now()) return undefined;
    return { kind: site.kind, amount: site.amount, ...(typeof site.expiresAt === "number" ? { expiresAt: site.expiresAt } : {}) };
  };

  const seedInitialShardScatter = (seed: number): void => {
    shardSitesByTile.clear();
    let placed = 0;
    for (let index = 0; index < 200_000 && placed < INITIAL_SHARD_SCATTER_COUNT; index += 1) {
      const x = Math.floor(seeded01(index * 41, index * 59, seed + 11_101) * WORLD_WIDTH);
      const y = Math.floor(seeded01(index * 67, index * 71, seed + 11_171) * WORLD_HEIGHT);
      if (!canHostShardSiteAt(x, y)) continue;
      shardSitesByTile.set(key(x, y), { tileKey: key(x, y), kind: "CACHE", amount: seeded01(x, y, seed + 11_221) > 0.84 ? 2 : 1 });
      placed += 1;
    }
  };

  const activeShardRainSummary = (): { siteCount: number; expiresAt: number | undefined } => {
    let siteCount = 0;
    let expiresAt: number | undefined;
    for (const site of shardSitesByTile.values()) {
      if (site.kind !== "FALL" || typeof site.expiresAt !== "number" || site.expiresAt <= now()) continue;
      siteCount += 1;
      expiresAt = Math.max(expiresAt ?? 0, site.expiresAt);
    }
    return { siteCount, expiresAt };
  };

  const shardRainNoticePayload = () => {
    const active = activeShardRainSummary();
    return currentShardRainNotice(now(), active.expiresAt, active.siteCount, SHARD_RAIN_TTL_MS);
  };

  const maybeBroadcastShardRainWarning = (): void => {
    const currentMs = now();
    const current = new Date(currentMs);
    if (current.getMinutes() !== 0) return;
    const nextStart = nextShardRainStartAt(currentMs);
    const remaining = nextStart - currentMs;
    if (remaining > 60 * 60 * 1000 || remaining <= 59 * 60 * 1000) return;
    const slot = new Date(nextStart);
    const slotKey = `${slot.getFullYear()}-${slot.getMonth() + 1}-${slot.getDate()}-${slot.getHours()}`;
    if (getLastShardRainWarningSlotKey() === slotKey) return;
    setLastShardRainWarningSlotKey(slotKey);
    broadcast({ type: "SHARD_RAIN_EVENT", phase: "upcoming", startsAt: nextStart });
  };

  const spawnShardRain = (): void => {
    if (!hasOnlinePlayers()) return;
    const count = SHARD_RAIN_SITE_MIN + Math.floor(Math.random() * (SHARD_RAIN_SITE_MAX - SHARD_RAIN_SITE_MIN + 1));
    const touched: Array<{ x: number; y: number }> = [];
    let placed = 0;
    let latestExpiresAt = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 300) {
      attempts += 1;
      const x = Math.floor(Math.random() * WORLD_WIDTH);
      const y = Math.floor(Math.random() * WORLD_HEIGHT);
      if (!canHostShardSiteAt(x, y)) continue;
      const tileKey = key(x, y);
      shardSitesByTile.set(tileKey, { tileKey, kind: "FALL", amount: 1 + (Math.random() > 0.8 ? 1 : 0), expiresAt: now() + SHARD_RAIN_TTL_MS });
      latestExpiresAt = Math.max(latestExpiresAt, shardSitesByTile.get(tileKey)?.expiresAt ?? 0);
      touched.push({ x, y });
      placed += 1;
    }
    if (touched.length === 0) return;
    broadcast({ type: "SHARD_RAIN_EVENT", phase: "started", startsAt: latestExpiresAt - SHARD_RAIN_TTL_MS, siteCount: touched.length, expiresAt: latestExpiresAt });
    broadcastLocalVisionDelta(touched);
  };

  const maybeSpawnScheduledShardRain = (): void => {
    const current = new Date(now());
    const hour = current.getHours();
    if (current.getMinutes() !== 0) return;
    if (!SHARD_RAIN_SCHEDULE_HOURS.includes(hour)) return;
    const slotKey = `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}-${hour}`;
    if (getLastShardRainSlotKey() === slotKey) return;
    setLastShardRainSlotKey(slotKey);
    spawnShardRain();
  };

  const expireShardSites = (): void => {
    const touched: Array<{ x: number; y: number }> = [];
    for (const [tileKey, site] of shardSitesByTile) {
      if (site.kind !== "FALL" || typeof site.expiresAt !== "number" || site.expiresAt > now()) continue;
      shardSitesByTile.delete(tileKey);
      const [x, y] = parseKey(tileKey);
      touched.push({ x, y });
      markSummaryChunkDirtyAtTile(x, y);
    }
    if (touched.length > 0) broadcastLocalVisionDelta(touched);
  };

  const collectShardSite = (player: any, x: number, y: number): { ok: boolean; amount?: number; reason?: string } => {
    if (!visible(player, x, y)) return { ok: false, reason: "tile is not visible" };
    const tileKey = key(x, y);
    const site = shardSitesByTile.get(tileKey);
    if (!site) return { ok: false, reason: "no shard cache on this tile" };
    if (typeof site.expiresAt === "number" && site.expiresAt <= now()) {
      shardSitesByTile.delete(tileKey);
      return { ok: false, reason: "the shardfall has already faded" };
    }
    shardSitesByTile.delete(tileKey);
    getOrInitStrategicStocks(player.id).SHARD += site.amount;
    markSummaryChunkDirtyAtTile(x, y);
    broadcastLocalVisionDelta([{ x, y }]);
    return { ok: true, amount: site.amount };
  };

  return {
    shardSiteViewAt,
    seedInitialShardScatter,
    activeShardRainSummary,
    shardRainNoticePayload,
    maybeBroadcastShardRainWarning,
    spawnShardRain,
    maybeSpawnScheduledShardRain,
    expireShardSites,
    collectShardSite
  };
};
