// Preload script passed to `new Worker(..., { execArgv: ["--import", <this
// file's URL>] })` by resolveWorkerExecArgv (resolve-worker-entry.ts)
// whenever a worker falls back to running its raw .ts source under tsx
// watch (local dev only — see the doc comment on resolveWorkerExecArgv for
// why this is needed at all).
//
// `--import tsx` (a bare package specifier) does NOT work here: tsx's
// package entry point (dist/loader.mjs) only exports the old-style loader
// hooks (resolve/load/globalPreload) meant for `--experimental-loader`.
// Merely `--import`ing it doesn't call `module.register()`, so it has no
// effect inside a worker thread — confirmed by reproducing the exact
// ERR_MODULE_NOT_FOUND crash in isolation with `--import tsx` alone.
// The officially supported way to activate tsx's loader from inside a
// specific thread's own code is the "tsx/esm/api" register() function
// (https://tsx.is/dev-api/node-options#tsx-esm-api); this file's only job
// is to call it, immediately, as this worker's --import preload.
import { register } from "tsx/esm/api";

register();
