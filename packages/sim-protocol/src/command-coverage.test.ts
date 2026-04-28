import { describe, expect, it } from "vitest";
import { DurableCommandTypeSchema } from "../../client-protocol/src/index.ts";

import {
  ACCEPTANCE_RESOLUTION_COMMAND_TYPES,
  PHASE4_COMMAND_SURFACE_TYPES,
  RECONNECT_COMMAND_TYPES,
  RESTART_PARITY_COMMAND_TYPES
} from "./command-coverage-sets.js";

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort();

const phase4NonDurable = [
  "ATTACK_PREVIEW",
  "SET_TILE_COLOR",
  "SET_PROFILE",
  "ALLIANCE_REQUEST",
  "ALLIANCE_ACCEPT",
  "ALLIANCE_REJECT",
  "ALLIANCE_CANCEL",
  "ALLIANCE_BREAK",
  "TRUCE_REQUEST",
  "TRUCE_ACCEPT",
  "TRUCE_REJECT",
  "TRUCE_CANCEL",
  "TRUCE_BREAK"
];

describe("phase-4 command coverage rails", () => {
  const durable = sortedUnique(DurableCommandTypeSchema.options);
  const fullPhase4Surface = sortedUnique([...durable, ...phase4NonDurable]);

  it("keeps restart-parity coverage synchronized with durable command types", () => {
    expect(sortedUnique(RESTART_PARITY_COMMAND_TYPES)).toEqual(durable);
  });

  it("keeps acceptance-resolution coverage synchronized with durable command types", () => {
    expect(sortedUnique(ACCEPTANCE_RESOLUTION_COMMAND_TYPES)).toEqual(durable);
  });

  it("keeps the phase-4 action surface synchronized with durable + non-durable checklist actions", () => {
    expect(sortedUnique(PHASE4_COMMAND_SURFACE_TYPES)).toEqual(fullPhase4Surface);
  });

  it("keeps reconnect in-flight coverage synchronized with durable command types", () => {
    expect(sortedUnique(RECONNECT_COMMAND_TYPES)).toEqual(durable);
  });
});
