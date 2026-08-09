#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAmapCredentialStore,
  resolveAmapCredentials,
} from "./amap-credential-store.js";

const secrets = {
  AMAP_KEY: "stored-key-secret",
  AMAP_SECURITY_KEY: "stored-security-secret",
};

function createFakeBackend({ availability = "available", initialPairs = {} } = {}) {
  const pairs = new Map(Object.entries(initialPairs));
  const deletedProfiles = [];
  let nextPair = { ...secrets };
  let captureError = null;
  let readError = null;
  return {
    pairs,
    deletedProfiles,
    setNextPair(pair) {
      nextPair = pair;
    },
    setCaptureError(error) {
      captureError = error;
    },
    setReadError(error) {
      readError = error;
    },
    availability() {
      return { status: availability };
    },
    capturePair(profileId) {
      if (captureError) throw captureError;
      pairs.set(profileId, { ...nextPair });
    },
    readPair(profileId) {
      if (readError) throw readError;
      return pairs.has(profileId) ? { ...pairs.get(profileId) } : null;
    },
    deletePair(profileId) {
      deletedProfiles.push(profileId);
      pairs.delete(profileId);
    },
  };
}

function makeStore(tempDir, backend, ids = ["11111111-1111-4111-8111-111111111111"]) {
  let index = 0;
  return createAmapCredentialStore({
    backend,
    pointerFile: path.join(tempDir, "amap-profile.json"),
    randomUUID: () => ids[index++] || "99999999-9999-4999-8999-999999999999",
  });
}

function publicStatus(value) {
  const { credentials, ...safe } = value;
  return safe;
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-trip-planner-amap-store-"));
try {
  const backend = createFakeBackend();
  const store = makeStore(path.join(tempRoot, "primary"), backend, [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);

  assert.deepEqual(store.status(), {
    status: "missing-credentials",
    source: "none",
    savedProfileAvailable: false,
  });

  const firstCandidate = store.beginCandidate();
  assert.equal(firstCandidate.profileId, "11111111-1111-4111-8111-111111111111");
  assert.equal(store.readActive().status, "missing-credentials");
  store.commitCandidate(firstCandidate.profileId);
  assert.deepEqual(store.readActive(), {
    status: "ready",
    source: "system-store",
    credentials: secrets,
    savedProfileAvailable: true,
  });
  assert.equal(fs.statSync(path.join(tempRoot, "primary", "amap-profile.json")).mode & 0o777, 0o600);

  const envReady = resolveAmapCredentials({
    env: { AMAP_KEY: " env-key ", AMAP_SECURITY_KEY: " env-security " },
    store,
  });
  assert.deepEqual(envReady, {
    status: "ready",
    source: "environment",
    credentials: { AMAP_KEY: "env-key", AMAP_SECURITY_KEY: "env-security" },
    savedProfileAvailable: true,
  });
  assert.deepEqual(resolveAmapCredentials({ env: { AMAP_KEY: "env-key" }, store }), {
    status: "partial-environment-credentials",
    source: "none",
    savedProfileAvailable: true,
  });
  assert.deepEqual(resolveAmapCredentials({ env: { AMAP_SECURITY_KEY: "env-security" }, store }), {
    status: "partial-environment-credentials",
    source: "none",
    savedProfileAvailable: true,
  });
  assert.equal(resolveAmapCredentials({ env: {}, store }).source, "system-store");

  backend.setNextPair({ AMAP_KEY: "new-key-secret", AMAP_SECURITY_KEY: "new-security-secret" });
  const secondCandidate = store.beginCandidate();
  assert.equal(store.readActive().credentials.AMAP_KEY, secrets.AMAP_KEY);
  store.discardCandidate(secondCandidate.profileId);
  assert.equal(store.readActive().credentials.AMAP_KEY, secrets.AMAP_KEY);
  assert.equal(backend.pairs.has(secondCandidate.profileId), false);

  const thirdCandidate = store.beginCandidate();
  store.commitCandidate(thirdCandidate.profileId);
  assert.equal(store.readActive().credentials.AMAP_KEY, "new-key-secret");
  assert.equal(backend.pairs.has(firstCandidate.profileId), false);
  assert.ok(backend.deletedProfiles.includes(firstCandidate.profileId));

  store.removeActive();
  assert.equal(store.status().status, "missing-credentials");
  assert.equal(backend.pairs.size, 0);

  const unavailableStore = makeStore(
    path.join(tempRoot, "unavailable"),
    createFakeBackend({ availability: "store-unavailable" }),
  );
  assert.deepEqual(resolveAmapCredentials({ env: {}, store: unavailableStore }), {
    status: "store-unavailable",
    source: "none",
    savedProfileAvailable: false,
  });

  const corruptDir = path.join(tempRoot, "corrupt");
  fs.mkdirSync(corruptDir);
  fs.writeFileSync(path.join(corruptDir, "amap-profile.json"), "{broken", { mode: 0o600 });
  const corruptStore = makeStore(corruptDir, createFakeBackend());
  assert.deepEqual(publicStatus(corruptStore.readActive()), {
    status: "store-corrupt",
    source: "none",
    savedProfileAvailable: true,
  });

  const missingPairDir = path.join(tempRoot, "missing-pair");
  const missingPairBackend = createFakeBackend();
  const missingPairStore = makeStore(missingPairDir, missingPairBackend);
  const missingCandidate = missingPairStore.beginCandidate();
  missingPairStore.commitCandidate(missingCandidate.profileId);
  missingPairBackend.pairs.clear();
  assert.equal(missingPairStore.readActive().status, "store-corrupt");

  const captureFailureDir = path.join(tempRoot, "capture-failure");
  const captureFailureBackend = createFakeBackend();
  captureFailureBackend.setCaptureError(new Error("native stderr stored-key-secret"));
  const captureFailureStore = makeStore(captureFailureDir, captureFailureBackend);
  assert.throws(() => captureFailureStore.beginCandidate(), /AMap credential store failed\./);
  assert.equal(captureFailureBackend.pairs.size, 0);
  assert.doesNotMatch(JSON.stringify(captureFailureStore.status()), /stored-key-secret/);

  const staleDir = path.join(tempRoot, "stale");
  const staleBackend = createFakeBackend();
  const staleStore = makeStore(staleDir, staleBackend, [
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
  ]);
  const staleCandidate = staleStore.beginCandidate();
  assert.equal(staleBackend.pairs.has(staleCandidate.profileId), true);
  const resumedStore = makeStore(staleDir, staleBackend, ["44444444-4444-4444-8444-444444444444"]);
  resumedStore.beginCandidate();
  assert.equal(staleBackend.pairs.has(staleCandidate.profileId), false);

  const interruptedCommitDir = path.join(tempRoot, "interrupted-commit");
  fs.mkdirSync(interruptedCommitDir);
  const interruptedProfileId = "55555555-5555-4555-8555-555555555555";
  fs.writeFileSync(
    path.join(interruptedCommitDir, "amap-profile.json"),
    JSON.stringify({ version: 1, profileId: interruptedProfileId }),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(interruptedCommitDir, "amap-profile.json.candidates"),
    JSON.stringify({ version: 1, profileIds: [interruptedProfileId] }),
    { mode: 0o600 },
  );
  const interruptedBackend = createFakeBackend({
    initialPairs: { [interruptedProfileId]: secrets },
  });
  const interruptedStore = makeStore(interruptedCommitDir, interruptedBackend, [
    "66666666-6666-4666-8666-666666666666",
  ]);
  interruptedStore.beginCandidate();
  assert.equal(interruptedBackend.pairs.has(interruptedProfileId), true);
  assert.equal(interruptedStore.readActive().status, "ready");

  const symlinkTarget = path.join(tempRoot, "real-config");
  const symlinkRoot = path.join(tempRoot, "linked-config");
  fs.mkdirSync(symlinkTarget);
  fs.symlinkSync(symlinkTarget, symlinkRoot);
  const symlinkStore = makeStore(symlinkRoot, createFakeBackend());
  assert.deepEqual(symlinkStore.status(), {
    status: "store-corrupt",
    source: "none",
    savedProfileAvailable: false,
  });

  const unrelatedDir = path.join(tempRoot, "unrelated");
  const unrelatedBackend = createFakeBackend();
  const unrelatedStore = makeStore(unrelatedDir, unrelatedBackend);
  fs.mkdirSync(unrelatedDir);
  fs.writeFileSync(path.join(unrelatedDir, "keep.txt"), "keep");
  const unrelatedCandidate = unrelatedStore.beginCandidate();
  unrelatedStore.commitCandidate(unrelatedCandidate.profileId);
  unrelatedStore.removeActive();
  assert.equal(fs.readFileSync(path.join(unrelatedDir, "keep.txt"), "utf8"), "keep");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("AMap credential profile store contract passed");
