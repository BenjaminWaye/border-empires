import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TILE_OVERLAY_WIRE_FIELDS } from "./tile-overlay-fields.js";

const proto = readFileSync(fileURLToPath(new URL("../simulation.proto", import.meta.url)), "utf8");

describe("TILE_OVERLAY_WIRE_FIELDS", () => {
  it("names each JSON wire field after its tile key", () => {
    for (const { key, camel } of TILE_OVERLAY_WIRE_FIELDS) expect(camel).toBe(`${key}Json`);
  });

  it("uses the snake_case form of the JSON wire field as the proto field", () => {
    for (const { camel, snake } of TILE_OVERLAY_WIRE_FIELDS) {
      expect(snake).toBe(camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
    }
  });

  it("only names proto fields that exist in simulation.proto", () => {
    for (const { snake } of TILE_OVERLAY_WIRE_FIELDS) {
      expect(proto, `simulation.proto is missing ${snake}`).toMatch(new RegExp(`\\bstring ${snake} = \\d+;`));
    }
  });

  it("has no duplicate rows", () => {
    expect(new Set(TILE_OVERLAY_WIRE_FIELDS.map((field) => field.key)).size).toBe(TILE_OVERLAY_WIRE_FIELDS.length);
  });
});
