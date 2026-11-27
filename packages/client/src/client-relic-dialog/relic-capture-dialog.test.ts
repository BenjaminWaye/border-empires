// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { worldSeed } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createRelicCaptureDialog, notifyRelicCapture } from "./relic-capture-dialog.js";

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
});

it.each([
  { remainingUses: 0, ownershipState: "FRONTIER", message: "Depleted." },
  { remainingUses: 12, ownershipState: "FRONTIER", message: "Garrison to activate." },
  { remainingUses: 12, ownershipState: "SETTLED", message: "12/30 charges remaining." }
] as const)("describes a recaptured relic with $remainingUses charges on $ownershipState land", async ({ remainingUses, ownershipState, message }) => {
  vi.useFakeTimers();
  localStorage.setItem("be-relic-reveals-v1", JSON.stringify({ namespace: `${worldSeed()}:me`, keys: ["1,2"] }));
  const tile: Tile = {
    x: 1, y: 2, terrain: "LAND", ownerId: "me", ownershipState,
    naturalWonder: { type: "BASTION_FRAME", relicVersion: 1, remainingUses }
  };
  notifyRelicCapture({ ...tile, ownerId: "rival" }, tile, "me");
  await Promise.resolve();
  expect(document.querySelector(".relic-recapture-notice")?.firstChild?.textContent?.trim()).toBe(`Ancient Field Generator secured. ${message}`);
});

// Regression (playtest 2026-11-27): on the "Relic secured" splash a dormant relic's effect panel held
// only "Garrison to activate", boxed in the button chip style, so it read as a button that did nothing.
it.each([
  { remainingUses: 12, garrisoned: false, plain: true },
  { remainingUses: 12, garrisoned: true, plain: false },
  { remainingUses: 0, garrisoned: false, plain: false }
] as const)("styles the status as plain text only when it stands alone ($remainingUses charges, garrisoned $garrisoned)", ({ remainingUses, garrisoned, plain }) => {
  const dialog = createRelicCaptureDialog({ type: "BASTION_FRAME", relicVersion: 1, remainingUses }, garrisoned);
  const effect = dialog.querySelector(".relic-effect");
  expect(effect?.classList.contains("relic-effect--status-only")).toBe(plain);
  expect(effect?.querySelector("button, [role=button]")).toBeNull();
  if (plain) expect(dialog.querySelector(".relic-status")?.textContent).toBe("Garrison to activate");
});
