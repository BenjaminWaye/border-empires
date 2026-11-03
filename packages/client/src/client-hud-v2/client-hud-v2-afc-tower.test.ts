import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { afcTowerSuppressionAction } from "../client-afc-upgrades/client-afc-tower-action.js";
import { splitTileActionsIntoTabs } from "../client-tile-action-support/client-tile-action-support.js";
import { aetherListHtml } from "./client-hud-v2-aether-list.js";
import { tileFactsFor } from "./client-hud-v2-tile-facts.js";

const now = 1_000_000;
const tower = (patch: Partial<NonNullable<Tile["observatory"]>>): Tile =>
  ({ x: 3, y: 4, terrain: "LAND", ownerId: "e", ownershipState: "SETTLED", observatory: { ownerId: "e", status: "active", ...patch } }) as Tile;

describe("AFC tower actions and state in HUD v2", () => {
  it("puts Suppress and Hijack in the Aether sidebar, castable from its rows", () => {
    const rows = afcTowerSuppressionAction(tower({ cooldownUntil: now + 60_000 }), { installed: true, hijackInstalled: true, hijackReadyInMs: 0, now, hostile: true, inRange: true, cooldownMs: 0 });
    const { crystal, actions } = splitTileActionsIntoTabs(rows, { techIds: [], localhostDevAetherWall: false });
    expect(crystal.map(row => row.id)).toEqual(["suppress_aether_tower", "hijack_aether_tower"]);
    expect(actions).toEqual([]);
    const html = aetherListHtml({ abilities: crystal, focusLabel: "(3, 4)" });
    expect(html).toContain('data-hud-v2-action="hijack_aether_tower"');
    expect(html).not.toMatch(/data-hud-v2-action="hijack_aether_tower"[^>]*disabled/);
  });

  it("shows a takeover countdown, then suppression, in the fact strip", () => {
    const view = { overviewLines: [] };
    const hijacked = tower({ suppressedUntil: now + 600_000, hijack: { byPlayerId: "p", casterX: 1, casterY: 1, startedAt: now, endsAt: now + 600_000 } });
    expect(tileFactsFor(hijacked, view, "me", now)).toContainEqual({ label: "State", value: "Being hijacked · 10 min", tone: "warn" });
    expect(tileFactsFor(tower({ suppressedUntil: now + 1 }), view, "me", now)).toContainEqual({ label: "State", value: "Suppressed", tone: "warn" });
  });
});
