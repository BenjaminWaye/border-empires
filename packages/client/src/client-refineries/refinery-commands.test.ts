import { describe, expect, it } from "vitest";
import { ClientMessageSchema } from "@border-empires/shared";
import { assignRefineryFieldPayload, refineryBuildPayload, refineryFieldOf, refineryRejectionMessage } from "./refinery-commands.js";
import { gatewayBuildWirePayload } from "../client-queue-logic/client-development-dispatch.js";
import { explainActionFailureFromServer } from "../client-player-actions.js";

describe("refinery commands", () => {
  it("builds through BUILD_ECONOMIC_STRUCTURE with the chosen field, accepted by the shared message schema", () => {
    const wire = gatewayBuildWirePayload(refineryBuildPayload("TITANIUM_REFINERY", { x: 101, y: 100 }, { x: 106, y: 99 }));
    expect(wire).toEqual({ type: "BUILD_ECONOMIC_STRUCTURE", x: 101, y: 100, structureType: "TITANIUM_REFINERY", fieldX: 106, fieldY: 99 });
    expect(ClientMessageSchema.safeParse(wire).success).toBe(true);
  });

  it("leaves every other build without a field", () => {
    expect(gatewayBuildWirePayload({ type: "BUILD_STRUCTURE", x: 1, y: 2, structureType: "MANUFACTORY" })).toEqual({ type: "BUILD_ECONOMIC_STRUCTURE", x: 1, y: 2, structureType: "MANUFACTORY" });
    expect(refineryFieldOf({ fieldX: 1 })).toEqual({});
    expect(refineryFieldOf({ fieldX: 1.5, fieldY: 2 })).toEqual({});
  });

  it("changes a field with ASSIGN_REFINERY_FIELD", () => {
    const payload = assignRefineryFieldPayload({ x: 101, y: 100 }, { x: 110, y: 100 });
    expect(payload).toEqual({ type: "ASSIGN_REFINERY_FIELD", x: 101, y: 100, fieldX: 110, fieldY: 100 });
    expect(ClientMessageSchema.safeParse(payload).success).toBe(true);
  });

  it("explains every refinery rejection code in plain words", () => {
    for (const code of ["REFINERY_NO_FIELD", "REFINERY_FIELD_INVALID", "REFINERY_FIELD_UNLINKED", "REFINERY_FIELD_TAKEN", "REFINERY_FIELD_UNCHANGED", "REFINERY_NO_TOWN", "REFINERY_INVALID"]) {
      const text = explainActionFailureFromServer(code, "you do not hold this refinery");
      expect(text).toMatch(/^Refinery blocked: /);
      expect(text).not.toContain(code);
    }
    expect(refineryRejectionMessage("REFINERY_FIELD_UNLINKED")).toMatch(/10 land tiles/);
    expect(refineryRejectionMessage("REFINERY_INVALID", "this refinery is being removed")).toBe("Refinery blocked: this refinery is being removed.");
    expect(refineryRejectionMessage("BUILD_INVALID")).toBeUndefined();
  });
});
