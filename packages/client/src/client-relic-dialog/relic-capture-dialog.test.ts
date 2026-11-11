// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { worldSeed } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { notifyRelicCapture } from "./relic-capture-dialog.js";

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
