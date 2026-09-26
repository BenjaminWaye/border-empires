import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const source = () => readFileSync(fileURLToPath(new URL("./create-worktree.sh", import.meta.url)), "utf8");

test("create-worktree uses the remote feature branch as its default start point", () => {
  assert.match(source(), /start_point="\$\{2:-origin\/develop\}"/);
});
