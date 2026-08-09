#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  runAmapCredentialAction,
  runAmapCredentialCli,
  validateAmapCredentials,
} from "./amap-credentials-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pair = { AMAP_KEY: "candidate-key-secret", AMAP_SECURITY_KEY: "candidate-security-secret" };

function createFakeStore({ active = null, candidate = pair, status = null } = {}) {
  let activePair = active;
  let candidatePair = candidate;
  let discarded = 0;
  let committed = 0;
  let began = 0;
  let removed = 0;
  return {
    get metrics() {
      return { discarded, committed, began, removed };
    },
    get activePair() {
      return activePair;
    },
    status() {
      if (status) return { status, source: "none", savedProfileAvailable: false };
      return activePair
        ? { status: "ready", source: "system-store", savedProfileAvailable: true }
        : { status: "missing-credentials", source: "none", savedProfileAvailable: false };
    },
    readActive() {
      const current = this.status();
      return current.status === "ready" ? { ...current, credentials: { ...activePair } } : current;
    },
    beginCandidate() {
      began += 1;
      return { profileId: "11111111-1111-4111-8111-111111111111" };
    },
    readCandidate(profileId) {
      assert.equal(profileId, "11111111-1111-4111-8111-111111111111");
      return { ...candidatePair };
    },
    commitCandidate(profileId) {
      assert.equal(profileId, "11111111-1111-4111-8111-111111111111");
      committed += 1;
      activePair = { ...candidatePair };
      candidatePair = null;
    },
    discardCandidate(profileId) {
      assert.equal(profileId, "11111111-1111-4111-8111-111111111111");
      discarded += 1;
      candidatePair = null;
    },
    removeActive() {
      removed += 1;
      activePair = null;
    },
  };
}

function baseDeps(store, overrides = {}) {
  return {
    platform: "darwin",
    env: {},
    store,
    cliAvailable: true,
    isTTY: true,
    validateCredentials: () => ({ searchStatus: "ok", routeStatus: "ok" }),
    stopProvider: () => {},
    ...overrides,
  };
}

{
  const store = createFakeStore();
  const result = runAmapCredentialAction("setup", baseDeps(store));
  assert.equal(result.status, "ready");
  assert.equal(result.source, "system-store");
  assert.equal(result.savedProfileAvailable, true);
  assert.equal(result.providerReady, false);
  assert.match(result.nextStep, /高德地图已连接/);
  assert.match(result.nextStep, /AMap is connected/);
  assert.deepEqual(store.metrics, { began: 1, committed: 1, discarded: 0, removed: 0 });
  assert.doesNotMatch(JSON.stringify(result), /candidate-(?:key|security)-secret/);
}

{
  const store = createFakeStore({ active: { AMAP_KEY: "old-key", AMAP_SECURITY_KEY: "old-security" } });
  const setup = runAmapCredentialAction("setup", baseDeps(store));
  assert.equal(setup.status, "ready");
  assert.match(setup.nextStep, /update/);
  assert.equal(store.metrics.began, 0);

  const update = runAmapCredentialAction("update", baseDeps(store, {
    validateCredentials: () => ({ searchStatus: "provider-error", routeStatus: "ok" }),
  }));
  assert.equal(update.status, "invalid-credentials");
  assert.deepEqual(store.metrics, { began: 1, committed: 0, discarded: 1, removed: 0 });
  assert.equal(store.activePair.AMAP_KEY, "old-key");
}

{
  const store = createFakeStore();
  const nonInteractive = runAmapCredentialAction("setup", baseDeps(store, { isTTY: false }));
  assert.equal(nonInteractive.status, "missing-credentials");
  assert.match(nonInteractive.nextStep, /交互式终端/);
  assert.match(nonInteractive.nextStep, /interactive terminal/);
  assert.equal(store.metrics.began, 0);
}

{
  const store = createFakeStore({ active: { AMAP_KEY: "stored-key", AMAP_SECURITY_KEY: "stored-security" } });
  const status = runAmapCredentialAction("status", baseDeps(store, {
    env: { AMAP_KEY: "environment-key", AMAP_SECURITY_KEY: "environment-security" },
  }));
  assert.equal(status.status, "ready");
  assert.equal(status.source, "environment");
  assert.equal(status.savedProfileAvailable, true);
  assert.doesNotMatch(JSON.stringify(status), /environment-(?:key|security)|stored-(?:key|security)/);

  const partial = runAmapCredentialAction("status", baseDeps(store, {
    env: { AMAP_KEY: "environment-key" },
  }));
  assert.equal(partial.status, "partial-environment-credentials");
  assert.equal(partial.source, "none");
}

{
  let stopped = 0;
  const store = createFakeStore({ active: { AMAP_KEY: "stored-key", AMAP_SECURITY_KEY: "stored-security" } });
  const removed = runAmapCredentialAction("remove", baseDeps(store, { stopProvider: () => { stopped += 1; } }));
  assert.equal(removed.status, "removed");
  assert.equal(stopped, 1);
  assert.equal(store.metrics.removed, 1);
  const removedAgain = runAmapCredentialAction("remove", baseDeps(store, { stopProvider: () => { stopped += 1; } }));
  assert.equal(removedAgain.status, "removed");
  assert.equal(stopped, 2);
}

{
  const missingCli = runAmapCredentialAction("status", baseDeps(createFakeStore(), { cliAvailable: false }));
  assert.equal(missingCli.status, "missing-cli");
  assert.equal(missingCli.providerReady, false);

  const unavailable = runAmapCredentialAction(
    "status",
    baseDeps(createFakeStore({ status: "store-unavailable" })),
  );
  assert.equal(unavailable.status, "store-unavailable");
}

{
  const help = runAmapCredentialCli(["--help"], {});
  assert.deepEqual(help, {
    exitCode: 0,
    stdout: JSON.stringify({
      status: "usage",
      usage: "Usage: amap-credentials.js <setup|status|update|remove>",
    }, null, 2) + "\n",
    stderr: "",
  });
  const forbidden = runAmapCredentialCli(["setup", "--key", "cli-key-secret"], {});
  assert.equal(forbidden.exitCode, 2);
  assert.equal(forbidden.stdout, "");
  assert.equal(forbidden.stderr, "Invalid AMap credential command.\n");
  assert.doesNotMatch(forbidden.stderr, /cli-key-secret/);
}

{
  const requests = [];
  const validation = validateAmapCredentials(pair, {
    executeRequest: (request, options) => {
      requests.push(request);
      assert.deepEqual(options.credentialResolution, {
        status: "ready",
        source: "system-store",
        credentials: pair,
        savedProfileAvailable: false,
      });
      return { status: request.action === "search-poi" ? "ok" : "provider-error" };
    },
  });
  assert.deepEqual(requests.map(({ action }) => action), ["search-poi", "route"]);
  assert.deepEqual(validation, { searchStatus: "ok", routeStatus: "provider-error" });
}

{
  const realHelp = spawnSync(process.execPath, [path.join(scriptDir, "amap-credentials.js"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(realHelp.status, 0, realHelp.stderr);
  assert.equal(JSON.parse(realHelp.stdout).status, "usage");
  assert.equal(realHelp.stderr, "");

  const forbidden = spawnSync(process.execPath, [
    path.join(scriptDir, "amap-credentials.js"), "setup", "--key", "process-key-secret",
  ], { encoding: "utf8" });
  assert.equal(forbidden.status, 2);
  assert.equal(forbidden.stdout, "");
  assert.equal(forbidden.stderr, "Invalid AMap credential command.\n");
  assert.doesNotMatch(forbidden.stderr, /process-key-secret/);
}

console.log("AMap credential setup CLI contract passed");
