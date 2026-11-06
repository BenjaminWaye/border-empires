// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectBarButtons } from "../client-hud-v2/client-hud-v2-action-bar.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { salvageToastFor } from "./client-salvage-ready-toasts.js";
import { salvageTributeActions } from "./client-salvage-tribute.js";
import { hideSalvageTributeSheet, installSalvageTributeSheet, isSalvageTributeSheetOpen, showSalvageTributeSheet } from "./client-salvage-tribute-sheet.js";

const works = (shipped = 0, status: "active" | "under_construction" = "active"): Tile => ({
  x: 20, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "PRECURSOR_SALVAGE",
  economicStructure: { ownerId: "me", type: "RECLAMATION_WORKS", status, ...(shipped ? { salvageLoadsShipped: shipped } : {}) }
} as Tile);
const player = (manpower = 0) => ({ me: "me", manpower, manpowerCap: 1000 });
const barView = (actions: TileActionDef[]) => ({ actions, buildings: [], crystal: [], tabs: [] as never[] });

describe("ship salvage button", () => {
  it("is the gold primary action while there is salvage to ship", () => {
    const [action] = salvageTributeActions(player(), works());
    expect(action).toMatchObject({ id: "ship_salvage_to_court", disabled: false, recommended: true, cost: "1 of 3 loads → +250 manpower" });
    const [primary] = selectBarButtons(barView([action!]));
    expect(primary).toMatchObject({ kind: "action", primary: true, action: { id: "ship_salvage_to_court" } });
  });

  it("drops out of the primary slot when it can't ship", () => {
    const [action] = salvageTributeActions(player(1000), works());
    expect(action).toMatchObject({ disabled: true, disabledReason: "Your manpower is already full" });
    expect(action?.recommended).toBeUndefined();
    expect(selectBarButtons(barView([action!])).some((b) => b.kind === "action" && b.primary)).toBe(false);
  });
});

describe("salvage toasts", () => {
  it("shows over a working field with loads, gold only when a load can ship", () => {
    expect(salvageToastFor(player(), "20,20", works(1))).toEqual({ key: "20,20", x: 20, y: 20, loads: 2, ready: true });
    expect(salvageToastFor(player(1000), "20,20", works())).toMatchObject({ loads: 3, ready: false });
  });

  it("is gone for an empty, unbuilt, foreign or depleted field", () => {
    expect(salvageToastFor(player(), "20,20", works(3))).toBeUndefined();
    expect(salvageToastFor(player(), "20,20", works(0, "under_construction"))).toBeUndefined();
    expect(salvageToastFor({ ...player(), me: "rival" }, "20,20", works())).toBeUndefined();
    // After the last load the server clears the resource and the Works.
    const { resource: _resource, economicStructure: _works, ...depleted } = works();
    expect(salvageToastFor(player(), "20,20", depleted as Tile)).toBeUndefined();
  });
});

describe("ship salvage popup", () => {
  afterEach(() => hideSalvageTributeSheet());

  const open = (manpower: number, tile: Tile = works()) => {
    const send = vi.fn(() => true);
    installSalvageTributeSheet({ ...player(manpower), tiles: new Map([["20,20", tile]]) }, send);
    return { send, shown: showSalvageTributeSheet({ x: 20, y: 20 }) };
  };

  it("sends the command only from its gold confirm button", () => {
    const { send, shown } = open(0, works(2));
    expect(shown).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector("[data-salvage-delivered]")?.textContent).toBe("+250 manpower");
    expect(document.querySelector("[data-salvage-note]")?.textContent).toContain("last load");
    document.querySelector<HTMLButtonElement>(".salvage-sheet-go")!.click();
    expect(send).toHaveBeenCalledWith({ type: "SHIP_SALVAGE_TO_COURT", x: 20, y: 20 }, expect.any(String));
    expect(isSalvageTributeSheetOpen()).toBe(false);
  });

  it("says why and disables the button when it can't ship", () => {
    const { send } = open(1000);
    const go = document.querySelector<HTMLButtonElement>(".salvage-sheet-go")!;
    expect(go.disabled).toBe(true);
    expect(document.querySelector("[data-salvage-note]")?.textContent).toBe("Your manpower is already full");
    document.querySelector<HTMLButtonElement>("[data-salvage-cancel]")!.click();
    expect(send).not.toHaveBeenCalled();
    expect(isSalvageTributeSheetOpen()).toBe(false);
  });

  it("doesn't open on a tile that isn't your salvage Works", () => {
    expect(open(0, { ...works(), ownerId: "rival" } as Tile).shown).toBe(false);
  });
});
