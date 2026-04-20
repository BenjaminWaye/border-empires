import { describe, expect, it } from "vitest";
import { DurableCommandTypeSchema } from "../../client-protocol/src/index.ts";

import {
  ACCEPTANCE_RESOLUTION_COMMAND_TYPES,
  RECONNECT_COMMAND_TYPES,
  RESTART_PARITY_COMMAND_TYPES
} from "./command-coverage-sets.js";

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort();

describe("durable command coverage rails", () => {
  const durable = sortedUnique(DurableCommandTypeSchema.options);

  it("keeps restart-parity coverage synchronized with durable command types", () => {
    expect(sortedUnique(RESTART_PARITY_COMMAND_TYPES)).toEqual(durable);
  });

  it("keeps acceptance-resolution coverage synchronized with durable command types", () => {
    expect(sortedUnique(ACCEPTANCE_RESOLUTION_COMMAND_TYPES)).toEqual(durable);
  });

  it("keeps reconnect coverage synchronized with durable command types", () => {
    expect(sortedUnique(RECONNECT_COMMAND_TYPES)).toEqual(durable);
  });
});
