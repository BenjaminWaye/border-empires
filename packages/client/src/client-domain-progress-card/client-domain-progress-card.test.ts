import { describe, expect, it } from "vitest";
import { renderDomainProgressCardHtml } from "../client-domain-progress-card.js";

describe("renderDomainProgressCardHtml", () => {
  it("keeps the sharding summary focused on shard stock when no caches or shard rain are active", () => {
    const html = renderDomainProgressCardHtml({
      visibleShardCacheCount: 0,
      shardStock: 8.6,
      currentTier: 1,
      chosenDomainCount: 0,
      shardAlert: undefined,
      nowMs: Date.now()
    });

    expect(html).toContain("Shard stock");
    expect(html).toContain("8.6");
    expect(html).not.toContain("domain-progress-note");
    expect(html).not.toContain("Render FPS");
    expect(html).not.toContain("data-fps-readout");
    expect(html).not.toContain("Active shardfalls");
    expect(html).not.toContain("grab shardfalls before they fade");
  });

  it("shows the visible cache count when caches are scouted", () => {
    const html = renderDomainProgressCardHtml({
      visibleShardCacheCount: 3,
      shardStock: 12,
      currentTier: 1,
      chosenDomainCount: 0,
      shardAlert: undefined,
      nowMs: Date.now()
    });

    expect(html).toContain("3 shard caches visible in explored territory.");
  });

  it("shows an upcoming shard rain countdown", () => {
    const nowMs = Date.now();
    const html = renderDomainProgressCardHtml({
      visibleShardCacheCount: 0,
      shardStock: 0,
      currentTier: 1,
      chosenDomainCount: 0,
      shardAlert: { key: "a", phase: "upcoming", startsAt: nowMs + 90 * 60_000 },
      nowMs
    });

    expect(html).toContain("Next shard rain in 1 hour 30 minutes");
  });

  it("shows an active shard rain countdown with remaining site count", () => {
    const nowMs = Date.now();
    const html = renderDomainProgressCardHtml({
      visibleShardCacheCount: 0,
      shardStock: 0,
      currentTier: 1,
      chosenDomainCount: 0,
      shardAlert: { key: "a", phase: "started", startsAt: nowMs - 60_000, expiresAt: nowMs + 5 * 60_000, siteCount: 4 },
      nowMs
    });

    expect(html).toContain("Shard rain active — 4 sites — 5 minutes left");
  });

  it("omits the note entirely once an active shard rain has fully expired", () => {
    const nowMs = Date.now();
    const html = renderDomainProgressCardHtml({
      visibleShardCacheCount: 0,
      shardStock: 0,
      currentTier: 1,
      chosenDomainCount: 0,
      shardAlert: { key: "a", phase: "started", startsAt: nowMs - 30 * 60_000, expiresAt: nowMs - 1000, siteCount: 2 },
      nowMs
    });

    expect(html).not.toContain("domain-progress-note");
  });
});
