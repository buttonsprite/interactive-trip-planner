#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import {
  createPlatformCredentialBackend,
  platformCredentialPaths,
} from "./amap-credential-backends.js";

const fakePair = {
  AMAP_KEY: "fake-amap-key-secret",
  AMAP_SECURITY_KEY: "fake-amap-security-secret",
};

function assertNoSecretInArgs(calls) {
  const args = JSON.stringify(calls.map(({ command, args }) => ({ command, args })));
  assert.doesNotMatch(args, /fake-amap-(?:key|security)-secret/);
}

{
  const calls = [];
  let stored = 0;
  const runCommand = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (args[0] === "help") return { status: 0, stdout: "", stderr: "" };
    if (args[0] === "add-generic-password") {
      stored += 1;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "find-generic-password") {
      const account = args[args.indexOf("-a") + 1];
      return {
        status: 0,
        stdout: account.endsWith(":key") ? `${fakePair.AMAP_KEY}\n` : `${fakePair.AMAP_SECURITY_KEY}\n`,
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const backend = createPlatformCredentialBackend({ platform: "darwin", env: {}, runCommand });
  assert.deepEqual(backend.availability(), { status: "available" });
  backend.capturePair("11111111-1111-4111-8111-111111111111");
  assert.equal(stored, 2);
  const addCalls = calls.filter(({ args }) => args[0] === "add-generic-password");
  assert.equal(addCalls.length, 2);
  assert.deepEqual(addCalls[0].args.slice(-1), ["-w"]);
  assert.deepEqual(addCalls[0].options.stdio, ["inherit", "pipe", "pipe"]);
  assert.deepEqual(backend.readPair("11111111-1111-4111-8111-111111111111"), fakePair);
  backend.deletePair("11111111-1111-4111-8111-111111111111");
  assert.equal(calls.filter(({ args }) => args[0] === "delete-generic-password").length, 2);
  assertNoSecretInArgs(calls);
}

{
  const calls = [];
  let addCount = 0;
  const runCommand = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (args[0] === "help") return { status: 0, stdout: "", stderr: "" };
    if (args[0] === "add-generic-password") {
      addCount += 1;
      return addCount === 1
        ? { status: 0, stdout: "", stderr: "" }
        : { status: 1, stdout: "", stderr: fakePair.AMAP_SECURITY_KEY };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const backend = createPlatformCredentialBackend({ platform: "darwin", env: {}, runCommand });
  assert.throws(
    () => backend.capturePair("22222222-2222-4222-8222-222222222222"),
    /^Error: AMap credential store failed\.$/,
  );
  assert.equal(calls.filter(({ args }) => args[0] === "delete-generic-password").length, 2);
  assertNoSecretInArgs(calls);
}

{
  const calls = [];
  const prompts = [fakePair.AMAP_KEY, fakePair.AMAP_SECURITY_KEY];
  const runCommand = (command, args, options = {}) => {
    calls.push({ command, args, options });
    const input = JSON.parse(options.input || "{}");
    if (input.operation === "probe") return { status: 0, stdout: '{"status":"ok"}', stderr: "" };
    if (input.operation === "read") {
      return { status: 0, stdout: JSON.stringify({ status: "ok", credentials: fakePair }), stderr: "" };
    }
    return { status: 0, stdout: '{"status":"ok"}', stderr: "" };
  };
  const backend = createPlatformCredentialBackend({
    platform: "win32",
    env: { APPDATA: "C:\\Users\\traveler\\AppData\\Roaming" },
    runCommand,
    promptSecret: () => prompts.shift(),
  });
  assert.deepEqual(backend.availability(), { status: "available" });
  backend.capturePair("33333333-3333-4333-8333-333333333333");
  const writeCall = calls.find(({ options }) => JSON.parse(options.input || "{}").operation === "write");
  assert.ok(writeCall.options.input.includes(fakePair.AMAP_KEY));
  assert.ok(writeCall.options.input.includes(fakePair.AMAP_SECURITY_KEY));
  assert.equal(writeCall.options.shell, false);
  assertNoSecretInArgs(calls);
  assert.deepEqual(backend.readPair("33333333-3333-4333-8333-333333333333"), fakePair);
  backend.deletePair("33333333-3333-4333-8333-333333333333");
}

{
  const calls = [];
  const prompts = [fakePair.AMAP_KEY, fakePair.AMAP_SECURITY_KEY];
  const runCommand = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (args[0] === "search") return { status: 0, stdout: "", stderr: "" };
    if (args[0] === "lookup") {
      const kind = args[args.indexOf("kind") + 1];
      return {
        status: 0,
        stdout: kind === "key" ? `${fakePair.AMAP_KEY}\n` : `${fakePair.AMAP_SECURITY_KEY}\n`,
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const backend = createPlatformCredentialBackend({
    platform: "linux",
    env: { DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus" },
    runCommand,
    promptSecret: () => prompts.shift(),
  });
  assert.deepEqual(backend.availability(), { status: "available" });
  backend.capturePair("44444444-4444-4444-8444-444444444444");
  const stores = calls.filter(({ args }) => args[0] === "store");
  assert.equal(stores.length, 2);
  assert.equal(stores[0].command, "secret-tool");
  assert.equal(stores[0].options.input, fakePair.AMAP_KEY);
  assert.equal(stores[1].options.input, fakePair.AMAP_SECURITY_KEY);
  assert.equal(stores[0].options.shell, false);
  assertNoSecretInArgs(calls);
  assert.deepEqual(backend.readPair("44444444-4444-4444-8444-444444444444"), fakePair);
  backend.deletePair("44444444-4444-4444-8444-444444444444");
  assert.equal(calls.filter(({ args }) => args[0] === "clear").length, 2);
}

{
  const missingDbus = createPlatformCredentialBackend({
    platform: "linux",
    env: {},
    runCommand: () => ({ status: 0, stdout: "", stderr: "" }),
    promptSecret: () => "unused",
  });
  assert.deepEqual(missingDbus.availability(), { status: "store-unavailable" });

  const missingCommand = createPlatformCredentialBackend({
    platform: "linux",
    env: { DBUS_SESSION_BUS_ADDRESS: "available" },
    runCommand: () => {
      const error = new Error("spawn secret-tool ENOENT");
      error.code = "ENOENT";
      throw error;
    },
    promptSecret: () => "unused",
  });
  assert.deepEqual(missingCommand.availability(), { status: "store-unavailable" });
}

{
  const cancelled = createPlatformCredentialBackend({
    platform: "linux",
    env: { DBUS_SESSION_BUS_ADDRESS: "available" },
    runCommand: () => ({ status: 0, stdout: "", stderr: "" }),
    promptSecret: () => null,
  });
  assert.throws(
    () => cancelled.capturePair("55555555-5555-4555-8555-555555555555"),
    /^Error: AMap credential store failed\.$/,
  );
}

{
  assert.deepEqual(
    platformCredentialPaths({
      platform: "darwin",
      env: {},
      homedir: "/Users/traveler",
    }),
    {
      configRoot: "/Users/traveler/Library/Application Support/interactive-trip-planner",
      pointerFile: "/Users/traveler/Library/Application Support/interactive-trip-planner/amap-profile.json",
    },
  );
  assert.deepEqual(
    platformCredentialPaths({
      platform: "linux",
      env: { XDG_CONFIG_HOME: "/home/traveler/.config-custom" },
      homedir: "/home/traveler",
    }),
    {
      configRoot: "/home/traveler/.config-custom/interactive-trip-planner",
      pointerFile: "/home/traveler/.config-custom/interactive-trip-planner/amap-profile.json",
    },
  );
  assert.deepEqual(
    platformCredentialPaths({
      platform: "win32",
      env: { APPDATA: "C:\\Users\\traveler\\AppData\\Roaming" },
      homedir: "C:\\Users\\traveler",
      pathApi: path.win32,
    }),
    {
      configRoot: "C:\\Users\\traveler\\AppData\\Roaming\\interactive-trip-planner",
      pointerFile: "C:\\Users\\traveler\\AppData\\Roaming\\interactive-trip-planner\\amap-profile.json",
    },
  );
}

assert.throws(
  () => createPlatformCredentialBackend({ platform: "aix", env: {}, runCommand: () => ({ status: 0 }) }),
  /^Error: AMap credential store failed\.$/,
);

console.log("AMap cross-platform credential backend contract passed");
