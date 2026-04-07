import test from "node:test";
import assert from "node:assert/strict";
import { aliasServesExpectedBundle, parseBundleAssetPath, parseDeploymentUrl } from "./client-deploy-verify.mjs";

test("parseBundleAssetPath extracts the client module bundle", () => {
  const html = `<!doctype html><html><head><script type="module" crossorigin src="/assets/index-ABC123.js"></script></head></html>`;
  assert.equal(parseBundleAssetPath(html), "/assets/index-ABC123.js");
});

test("parseDeploymentUrl reads Vercel JSON output", () => {
  const output = `{"status":"ok","deployment":{"id":"dpl_1","url":"https://border-empires-client-new.vercel.app"}}`;
  assert.equal(parseDeploymentUrl(output), "https://border-empires-client-new.vercel.app");
});

test("parseDeploymentUrl falls back to the Production line", () => {
  const output = "Production: https://border-empires-client-new.vercel.app [30s]";
  assert.equal(parseDeploymentUrl(output), "https://border-empires-client-new.vercel.app");
});

test("aliasServesExpectedBundle only passes on exact bundle match", () => {
  const html = `<!doctype html><html><head><script type="module" crossorigin src="/assets/index-NEW.js"></script></head></html>`;
  assert.equal(aliasServesExpectedBundle(html, "/assets/index-NEW.js"), true);
  assert.equal(aliasServesExpectedBundle(html, "/assets/index-OLD.js"), false);
});
