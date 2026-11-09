import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const mobile = fileURLToPath(new URL("../", import.meta.url));
const res = `${mobile}android/app/src/main/res`;

// First pixel of an 8-bit RGBA PNG. Row 0 pixel 0 is unaffected by every PNG filter.
const firstPixel = (path) => {
  const png = readFileSync(path);
  const idat = [];
  let colorType = -1;
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") colorType = data[9];
    if (type === "IDAT") idat.push(data);
    at += length + 12;
  }
  assert.equal(colorType, 6, `${path} must be RGBA`);
  const raw = inflateSync(Buffer.concat(idat));
  return [...raw.subarray(1, 5)];
};

test("Android adaptive icon background fills the mask with the logo's own colour", () => {
  for (const density of ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const [r, g, b, a] = firstPixel(`${res}/mipmap-${density}/ic_launcher_background.png`);
    assert.equal(a, 255);
    // Was the near-black #060c16, which showed as a dark ring around a framed badge.
    assert.ok(Math.abs(r - 0x2a) <= 6 && Math.abs(g - 0x2f) <= 6 && Math.abs(b - 0x24) <= 6, `${density}: ${r},${g},${b}`);
  }
});

test("Android adaptive icon foreground is frameless artwork on transparency", () => {
  for (const density of ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    assert.equal(firstPixel(`${res}/mipmap-${density}/ic_launcher_foreground.png`)[3], 0, density);
  }
  assert.doesNotMatch(readFileSync(`${mobile}assets/icon-foreground.svg`, "utf8"), /<rect/);
});

test("icon generation uses full-bleed icon sources, not the framed favicon", () => {
  for (const name of ["icon-only.png", "icon-foreground.png", "icon-background.png"]) {
    assert.ok(existsSync(`${mobile}assets/${name}`), name);
  }
  const { scripts } = JSON.parse(readFileSync(`${mobile}package.json`, "utf8"));
  assert.doesNotMatch(scripts.assets, /iconBackgroundColor/);
});
