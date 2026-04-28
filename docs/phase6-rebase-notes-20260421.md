# Phase 6 rebase notes — 2026-04-21

Branch: `codex/phase6-review-redo` → `codex/phase6-review-redo-rebased`
Base: current `origin/main` (as of 2026-04-21, head `724e253`)

## Why this doc exists

The sandbox cannot do `git checkout` of another branch against a FUSE-mounted
repo (the OS blocks unlinking of working-tree files). The rebase must be
completed by Benjamin from his local terminal. This doc spells out every
conflict resolution decision so it can be executed without guesswork.

---

## Branch summary

Two commits ahead of `67eb7b5` (the revert-merge):

| SHA | Message |
|---|---|
| `170dc98` | `phase6: add cutover health and runtime provenance checks` |
| `ad53ba7` | `phase6: fix prod provisioning db creation and cutover target wiring` |

Files touched by these 2 commits (relative to main-at-time-of-branch):

- `apps/realtime-gateway/src/gateway-app.ts`
- `apps/realtime-gateway/src/http-routes.ts`
- `apps/realtime-gateway/src/http-routes.test.ts`
- `apps/realtime-gateway/src/main.ts`
- `apps/realtime-gateway/src/runtime-env.ts`
- `apps/realtime-gateway/src/runtime-env.test.ts`
- `apps/simulation/src/main.ts`
- `apps/simulation/src/runtime-env.ts`
- `apps/simulation/src/runtime-env.test.ts`
- `apps/simulation/src/simulation-service.ts`
- `provision-fly-prod.command` ← MAJOR CONFLICT (rewritten in Task 3)
- `scripts/rewrite-phase6-cutover-check.mjs` ← NEW FILE, no conflict

---

## Step-by-step rebase procedure

Run these commands from your local `border-empires` checkout:

```bash
cd ~/Sites/border-empires-container/border-empires

# 1. Fetch latest
git fetch --all --prune

# 2. Create the rebased branch from current main
git checkout -b codex/phase6-review-redo-rebased origin/main

# 3. Cherry-pick the 2 phase6 commits (expect conflicts)
git cherry-pick 170dc98
# Resolve conflicts per §A below, then:
git add -A && git cherry-pick --continue

git cherry-pick ad53ba7
# Resolve conflicts per §B below, then:
git add -A && git cherry-pick --continue

# 4. Build and test
pnpm install
pnpm -r build
pnpm -r test

# 5. Push (do NOT force-push the original branch name)
git push origin codex/phase6-review-redo-rebased
```

---

## §A. Conflict resolutions for commit `170dc98`

### `apps/realtime-gateway/src/runtime-env.ts`

**Conflict:** Main's version has no `runtimeIdentity` field. Branch adds env-var
parsing for it.

**Resolution: port the branch's full `runtimeIdentity` parsing block.**

In `RealtimeGatewayRuntimeEnv` type, add after `simulationSeedProfile`:

```typescript
  runtimeIdentity?: {
    sourceType: "legacy-snapshot" | "seed-profile";
    seasonId: string;
    worldSeed: number;
    fingerprint: string;
    snapshotLabel?: string;
    seedProfile?: string;
    playerCount: number;
    seededTileCount: number;
  };
```

After the existing production validation checks (and before the `return`),
add the env-var parsing block from the branch. The branch's full diff is:

```typescript
type RuntimeSourceType = "legacy-snapshot" | "seed-profile";

// (add before the return statement in parseRealtimeGatewayRuntimeEnv)
  const runtimeSeasonId = env.GATEWAY_RUNTIME_SEASON_ID;
  const runtimeSourceType = env.GATEWAY_RUNTIME_SOURCE_TYPE;
  const runtimeWorldSeed = env.GATEWAY_RUNTIME_WORLD_SEED;
  const runtimeFingerprint = env.GATEWAY_RUNTIME_FINGERPRINT;
  const runtimePlayerCount = env.GATEWAY_RUNTIME_PLAYER_COUNT;
  const runtimeSeededTileCount = env.GATEWAY_RUNTIME_SEEDED_TILE_COUNT;
  const parseRuntimeSourceType = (value: string): RuntimeSourceType => {
    if (value === "legacy-snapshot" || value === "seed-profile") return value;
    throw new Error(`invalid gateway runtime source type: ${value}`);
  };
  const parsePositiveNumber = (value: string | undefined, fallback: number, label: string): number => {
    const parsed = Number(value ?? String(fallback));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`invalid ${label}: ${value ?? ""}`);
    }
    return parsed;
  };
  const runtimeIdentity =
    runtimeSeasonId && runtimeSourceType && runtimeWorldSeed &&
    runtimeFingerprint && runtimePlayerCount && runtimeSeededTileCount
      ? {
          sourceType: parseRuntimeSourceType(runtimeSourceType),
          seasonId: runtimeSeasonId,
          worldSeed: parsePositiveNumber(runtimeWorldSeed, 0, "gateway runtime world seed"),
          fingerprint: runtimeFingerprint,
          playerCount: parsePositiveNumber(runtimePlayerCount, 0, "gateway runtime player count"),
          seededTileCount: parsePositiveNumber(runtimeSeededTileCount, 0, "gateway runtime seeded tile count"),
          ...(env.GATEWAY_RUNTIME_SNAPSHOT_LABEL ? { snapshotLabel: env.GATEWAY_RUNTIME_SNAPSHOT_LABEL } : {}),
          ...(env.GATEWAY_RUNTIME_SEED_PROFILE ? { seedProfile: env.GATEWAY_RUNTIME_SEED_PROFILE } : {})
        }
      : undefined;
```

In the `return` block, add at the end:

```typescript
    ...(runtimeIdentity ? { runtimeIdentity } : {})
```

### `apps/realtime-gateway/src/runtime-env.test.ts`

**Conflict:** Main has existing tests. Branch adds `runtimeIdentity` env-var test.

**Resolution: keep all of main's tests, append the branch's new `it(...)` block
as a new case in the existing `describe` block.** The branch adds:

```typescript
  it("parses full runtimeIdentity from env vars", () => {
    expect(
      parseRealtimeGatewayRuntimeEnv({
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "8080",
        SIMULATION_ADDRESS: "border-empires-simulation.internal:50051",
        DATABASE_URL: "postgres://gateway",
        GATEWAY_DB_APPLY_SCHEMA: "1",
        GATEWAY_RUNTIME_SOURCE_TYPE: "legacy-snapshot",
        GATEWAY_RUNTIME_SEASON_ID: "season-prod-1",
        GATEWAY_RUNTIME_WORLD_SEED: "12345",
        GATEWAY_RUNTIME_FINGERPRINT: "snap-abc123",
        GATEWAY_RUNTIME_SNAPSHOT_LABEL: "snapshot-2026-04-20",
        GATEWAY_RUNTIME_PLAYER_COUNT: "21",
        GATEWAY_RUNTIME_SEEDED_TILE_COUNT: "640",
        GATEWAY_RUNTIME_SEED_PROFILE: "season-20ai"
      })
    ).toEqual({
      host: "0.0.0.0",
      port: 8080,
      simulationAddress: "border-empires-simulation.internal:50051",
      databaseUrl: "postgres://gateway",
      applySchema: true,
      runtimeIdentity: {
        sourceType: "legacy-snapshot",
        seasonId: "season-prod-1",
        worldSeed: 12345,
        fingerprint: "snap-abc123",
        snapshotLabel: "snapshot-2026-04-20",
        playerCount: 21,
        seededTileCount: 640,
        seedProfile: "season-20ai"
      }
    });
  });
```

### `apps/realtime-gateway/src/http-routes.ts`

**Conflict:** Main uses `readHealth()` helper with explicit statusCode. Branch uses
`healthHandler` shared function. Both output `{ ok, simulation, runtimeIdentity }`.

**Resolution: keep main's version entirely.** Main already has `runtimeIdentity`
wired into the response. The branch's version is functionally equivalent but
uses a slightly different internal structure. Main's structure is cleaner
(explicit statusCode vs implicit 503 from `reply.code`). No content change needed.

### `apps/realtime-gateway/src/http-routes.test.ts`

**Conflict:** Main has tests for `/health`, `/healthz`, `/admin/runtime/debug-bundle`,
`/metrics`. Branch adds `runtimeIdentity` assertion in the healthz response check.

**Resolution: keep main's tests, add the branch's `runtimeIdentity` assertion as
a new `describe("runtimeIdentity")` block.** Specifically, add after the existing
`it("serves health and debug bundle")` test:

```typescript
  describe("runtimeIdentity in healthz response", () => {
    it("includes runtimeIdentity when provided", async () => {
      const app = Fastify();
      const identity = {
        sourceType: "legacy-snapshot" as const,
        seasonId: "season-prod-1",
        worldSeed: 12345,
        fingerprint: "snap-abc123",
        snapshotLabel: "snapshot-2026-04-20",
        playerCount: 21,
        seededTileCount: 640
      };
      registerGatewayHttpRoutes(app, {
        startupStartedAt: 1_000,
        simulationAddress: "127.0.0.1:50051",
        simulationSeedProfile: "default",
        health: () => ({ ok: true, simulation: { connected: true } }),
        supportedMessageTypes: ["ATTACK"],
        recentEvents: () => [],
        metrics: () => "",
        runtimeIdentity: identity
      });
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
      expect(res.json().runtimeIdentity).toEqual(identity);
      await app.close();
    });

    it("omits runtimeIdentity when not provided", async () => {
      const app = Fastify();
      registerGatewayHttpRoutes(app, {
        startupStartedAt: 1_000,
        simulationAddress: "127.0.0.1:50051",
        simulationSeedProfile: "default",
        health: () => ({ ok: true, simulation: { connected: true } }),
        supportedMessageTypes: ["ATTACK"],
        recentEvents: () => [],
        metrics: () => ""
      });
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.json().runtimeIdentity).toBeUndefined();
      await app.close();
    });
  });
```

### `apps/realtime-gateway/src/gateway-app.ts`

**Conflict:** Main already has `runtimeIdentity` passed from `legacySnapshotBootstrap`
in `registerGatewayHttpRoutes(...)`. Branch passes it from both bootstrap AND the
parsed `runtimeIdentity` from env options.

**Resolution:** Keep main's wiring (`legacySnapshotBootstrap.runtimeIdentity`). Add
the branch's fallback to `options.runtimeIdentity` (from env vars parsed by runtime-env):

In the `registerGatewayHttpRoutes(app, { ... })` call, change:
```typescript
    ...(legacySnapshotBootstrap ? { runtimeIdentity: legacySnapshotBootstrap.runtimeIdentity } : {}),
```
to:
```typescript
    runtimeIdentity: legacySnapshotBootstrap?.runtimeIdentity ?? options.runtimeIdentity,
```

### `apps/simulation/src/runtime-env.ts` and `runtime-env.test.ts`

**Same pattern as gateway.** Port the `runtimeIdentity` env-var parsing block
(uses `SIMULATION_RUNTIME_*` env vars instead of `GATEWAY_RUNTIME_*`). Keep
main's version and append the new test case.

### `scripts/rewrite-phase6-cutover-check.mjs`

**New file, no conflict.** Cherry-pick brings it in cleanly.

---

## §B. Conflict resolutions for commit `ad53ba7`

### `provision-fly-prod.command`

**MAJOR CONFLICT.** Task 3 (this session) completely rewrote `provision-fly-prod.command`
for Supabase. The branch's `ad53ba7` made minor fixes to the old Fly Postgres version.

**Resolution: keep main's Supabase version entirely.** The branch's changes to
this file are superseded by the Supabase rewrite. Use `git checkout HEAD -- provision-fly-prod.command`
during the cherry-pick conflict resolution step:

```bash
# During cherry-pick ad53ba7 conflict resolution:
git checkout HEAD -- provision-fly-prod.command
git add provision-fly-prod.command
```

### `scripts/rewrite-phase6-cutover-check.mjs`

The `ad53ba7` commit adds minor fixes to the cutover check script. Since the
script was introduced cleanly in `170dc98` (which was cherry-picked first),
the `ad53ba7` changes to it should apply cleanly as well. If conflict:
**take the branch's version** — it's a pure fix to the new script, no main overlap.

---

## Commit messages for conflict-resolution commits

```
rebase: resolve runtime-env.ts conflict — port runtimeIdentity env-var parsing from phase6, keep main's return shape

rebase: resolve http-routes conflict — keep main's readHealth() wiring, add phase6 runtimeIdentity test describe block

rebase: resolve provision-fly-prod.command conflict — keep main's Supabase version (Task 3 rewrite supersedes branch's Fly Postgres fixes)
```

---

## After rebase: verify no semantic conflicts

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Expected: all tests green. If `runtime-env.test.ts` fails on the new
`runtimeIdentity` test case, check that the `parseRealtimeGatewayRuntimeEnv`
return block includes `...(runtimeIdentity ? { runtimeIdentity } : {})`.

---

## Next step

Once pushed to `codex/phase6-review-redo-rebased`, leave a comment on the
existing Phase 6 PR linking the new branch so Benjamin can decide whether to
close-and-reopen or force-push the existing PR.

*No changes applied to `main` by this document. No force-push to
`codex/phase6-review-redo` intended.*
