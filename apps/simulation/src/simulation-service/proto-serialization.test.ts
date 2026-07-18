import { describe, expect, it } from "vitest";

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { toProtoEvent } from "./proto-serialization.js";

describe("toProtoEvent — ownershipClearOnly marker", () => {
  it("emits ownership_clear_only in BOTH the snake_case proto array and the camelCase array when set", () => {
    // Regression: the field type existed on ProtoSimulationEvent but the
    // toProtoEvent mapping never wrote it, so the sim silently stripped the
    // flag and the client never learned a delta was a broadcast-only clear.
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-1",
      playerId: "player-1",
      tileDeltas: [{ x: 49, y: 288, ownerId: undefined, ownershipState: undefined, ownershipClearOnly: true }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]?.ownership_clear_only).toBe(true);
    expect(proto.tileDeltas?.[0]?.ownershipClearOnly).toBe(true);
  });

  it("omits ownership_clear_only for a normal delta so proto3 default (false) applies", () => {
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-2",
      playerId: "player-1",
      tileDeltas: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]).not.toHaveProperty("ownership_clear_only");
    expect(proto.tileDeltas?.[0]).not.toHaveProperty("ownershipClearOnly");
  });
});

describe("toProtoEvent — town clear (razed settlement) propagation", () => {
  it("emits town_json/townJson as present-but-empty when townJson key is present but undefined", () => {
    // Regression: razing a captured SETTLEMENT sets tile.town = undefined,
    // which serialized as townJson: undefined. The old truthy check
    // (`tile.townJson ? ... : {}`) dropped the field entirely instead of
    // signaling a clear, so the client never removed the razed town.
    // Sibling structure fields (fortJson, observatoryJson, etc.) all use
    // "key in tile" presence checks for this reason — townJson now matches.
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-3",
      playerId: "player-1",
      tileDeltas: [{ x: 5, y: 5, townJson: undefined }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]).toHaveProperty("town_json", "");
    expect(proto.tileDeltas?.[0]).toHaveProperty("townJson", undefined);
    expect(Object.prototype.hasOwnProperty.call(proto.tileDeltas?.[0] ?? {}, "townJson")).toBe(true);
  });

  it("omits town_json/townJson entirely when the townJson key is absent (unrelated tile delta)", () => {
    const event = {
      eventType: "TILE_DELTA_BATCH",
      commandId: "cmd-4",
      playerId: "player-1",
      tileDeltas: [{ x: 6, y: 6, terrain: "LAND" }]
    } as unknown as SimulationEvent;

    const proto = toProtoEvent(event);

    expect(proto.tile_deltas?.[0]).not.toHaveProperty("town_json");
    expect(proto.tileDeltas?.[0]).not.toHaveProperty("townJson");
  });
});
