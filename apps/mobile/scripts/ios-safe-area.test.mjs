import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../ios/App/${path}`, import.meta.url), "utf8");

test("both iOS entry paths use the compiled safe-area controller", () => {
  // SceneDelegate overrides the storyboard on recent iOS. Checking only one
  // entry path would leave landscape fixed controls underneath the cutout.
  assert.match(read("App/SceneDelegate.swift"), /rootViewController = GameViewController\(\)/);
  assert.match(read("App/Base.lproj/Main.storyboard"), /customClass="GameViewController" customModule="App"/);
  assert.match(read("App.xcodeproj/project.pbxproj"), /GameViewController.swift in Sources/);
  const source = read("App/GameViewController.swift");
  assert.match(source, /container.safeAreaLayoutGuide/);
  for (const edge of ["leading", "trailing", "top", "bottom"]) {
    assert.ok(source.includes(`gameView.${edge}Anchor.constraint(equalTo: safe.${edge}Anchor)`));
  }
});
