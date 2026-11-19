#!/usr/bin/env node

import assert from "node:assert/strict";
import { withAmapProviderSession } from "./amap-provider-session.js";

const credentials = {
  AMAP_KEY: "session-key-secret",
  AMAP_SECURITY_KEY: "session-security-secret",
};

function lifecycleRunner(events, behavior = {}) {
  let stopCount = 0;
  return (command, args, options) => {
    const action = args[0];
    if (action === "stop") {
      stopCount += 1;
      events.push([stopCount === 1 ? "stop-old" : "stop-finally", command, args, options]);
      if (stopCount === 2 && behavior.finalStopFailure) {
        return { status: 1, stdout: "", stderr: credentials.AMAP_KEY };
      }
      return { status: 0, stdout: '{"success":true}', stderr: "" };
    }
    if (action === "start") {
      events.push(["start", command, args, options]);
      return behavior.startFailure
        ? { status: 1, stdout: "", stderr: credentials.AMAP_SECURITY_KEY }
        : { status: 0, stdout: '{"success":true}', stderr: "" };
    }
    if (action === "status") {
      events.push(["status", command, args, options]);
      return {
        status: 0,
        stdout: JSON.stringify({
          success: true,
          data: { status: behavior.mapReadyFalse ? "starting" : "running", mapReady: !behavior.mapReadyFalse },
          error: null,
        }),
        stderr: "",
      };
    }
    throw new Error("unexpected lifecycle action");
  };
}

{
  const events = [];
  const result = withAmapProviderSession({
    credentials,
    env: { PATH: "/test/bin" },
    runLifecycleCommand: lifecycleRunner(events),
  }, (providerEnv) => {
    events.push(["query", "amap-gui", [], { env: providerEnv }]);
    assert.equal(providerEnv.AMAP_KEY, credentials.AMAP_KEY);
    assert.equal(providerEnv.AMAP_SECURITY_KEY, credentials.AMAP_SECURITY_KEY);
    return { status: "ok" };
  });
  assert.deepEqual(events.map(([name]) => name), ["stop-old", "start", "status", "query", "stop-finally"]);
  assert.deepEqual(result, { status: "ok" });
  for (const [name, , args, options] of events.filter(([name]) => name !== "query")) {
    assert.equal(options.shell, false, name);
    assert.ok(options.timeout > 0 && options.timeout <= 35_000, name);
    assert.doesNotMatch(JSON.stringify(args), /session-(?:key|security)-secret/);
  }
  const start = events.find(([name]) => name === "start");
  assert.equal(start[3].env.AMAP_KEY, credentials.AMAP_KEY);
  assert.equal(start[3].env.AMAP_SECURITY_KEY, credentials.AMAP_SECURITY_KEY);
}

for (const behavior of [
  { startFailure: true },
  { mapReadyFalse: true },
  { finalStopFailure: true },
]) {
  const events = [];
  assert.throws(
    () => withAmapProviderSession({
      credentials,
      env: {},
      runLifecycleCommand: lifecycleRunner(events, behavior),
    }, () => ({ status: "ok" })),
    /^Error: AMap provider session failed\.$/,
  );
  assert.equal(events.at(-1)[0], "stop-finally");
  assert.doesNotMatch(JSON.stringify(events.map(([, command, args]) => ({ command, args }))), /session-(?:key|security)-secret/);
}

{
  const events = [];
  assert.throws(
    () => withAmapProviderSession({
      credentials,
      env: {},
      runLifecycleCommand: lifecycleRunner(events),
    }, () => {
      throw new Error(`query failed ${credentials.AMAP_KEY}`);
    }),
    /^Error: AMap provider session failed\.$/,
  );
  assert.equal(events.at(-1)[0], "stop-finally");
}

for (const invalid of [
  {},
  { AMAP_KEY: credentials.AMAP_KEY },
  { AMAP_SECURITY_KEY: credentials.AMAP_SECURITY_KEY },
  { AMAP_KEY: " ", AMAP_SECURITY_KEY: "value" },
]) {
  let calls = 0;
  assert.throws(
    () => withAmapProviderSession({
      credentials: invalid,
      runLifecycleCommand: () => {
        calls += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
    }, () => ({ status: "ok" })),
    /^Error: AMap provider session failed\.$/,
  );
  assert.equal(calls, 0);
}

console.log("AMap request-scoped provider session contract passed");
