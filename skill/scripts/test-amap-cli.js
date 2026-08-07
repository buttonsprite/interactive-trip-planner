#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const { probeAmapCapability } = await import("./check-amap-cli.js");
const secrets = {
  AMAP_KEY: "never-print-web-key",
  AMAP_SECURITY_KEY: "never-print-security-key",
};
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-trip-planner-amap-cli-"));
const fakeBinDir = path.join(tempDir, "bin");
const contextPath = path.join(tempDir, "search.json");
fs.mkdirSync(fakeBinDir);
fs.writeFileSync(contextPath, JSON.stringify({
  action: "search-poi",
  keyword: "菜市场",
  city: "大理",
  center: { lng: 100.1602, lat: 25.7001 },
  radiusMeters: 1500,
  pageSize: 10,
  pageIndex: 1,
}));
fs.writeFileSync(path.join(fakeBinDir, "amap-gui"), `#!/usr/bin/env node
const secret = process.env.AMAP_SECURITY_KEY || "";
const webKey = process.env.AMAP_KEY || "";
const behavior = process.env.FAKE_AMAP_BEHAVIOR || "success";
if (behavior === "stderr-secret") {
  process.stderr.write("provider failed: " + secret);
  process.exit(1);
}
if (behavior === "malformed") {
  process.stdout.write("{malformed-provider-json");
  process.exit(0);
}
process.stdout.write(JSON.stringify({
  success: true,
  data: {
    keyword: "菜市场",
    city: "大理",
    total: 1,
    pageSize: 10,
    pageIndex: 1,
    pois: [{
      id: behavior === "missing-identity" ? "" : "B0FFTEST01",
      name: behavior === "echo-secret" ? webKey + " 北门市场 " + secret : "北门市场",
      type: "购物服务;综合市场",
      address: behavior === "encoded-markup" ? "&lt;script&gt;encoded" : "云南省大理白族自治州大理市",
      tel: "0872-0000000",
      distance: 680,
      location: [100.1602, 25.7001],
      province: "云南省",
      city: "大理白族自治州",
      district: "大理市"
    }]
  },
  error: null
}));
`);
fs.chmodSync(path.join(fakeBinDir, "amap-gui"), 0o755);

function runExecutionCli(args, input = "", extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(scriptDir, "amap-cli.js"), ...args], {
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      ...secrets,
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ""}`,
      ...extraEnv,
    },
  });
}

function assertSanitizedCliFailure(result) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^(?:Invalid AMap (?:action|search request|route request)\.|Context must contain valid JSON\.|Context must be a JSON object\.|Context path must be a readable file\.|Provide exactly one of --context <file> or --stdin\.)\n$/);
  assert.doesNotMatch(result.stderr, /never-print|invalid-source-secret/);
}

const missingCli = probeAmapCapability({ env: { ...secrets }, commandExists: () => false });
assert.equal(missingCli.status, "unavailable");
assert.equal(missingCli.cliAvailable, false);
assert.equal(missingCli.credentialsConfigured, true);
assert.equal(missingCli.routePlanningAvailable, false);
assert.equal(missingCli.routeVerification, "not-performed");
assert.equal(missingCli.mustNotSynthesizeRoutes, true);
assert.ok(missingCli.fallback.length >= 2);
for (const item of missingCli.fallback) {
  assert.match(item, /[\u4e00-\u9fff]/);
  assert.match(item, /[A-Za-z]/);
}
assert.doesNotMatch(JSON.stringify(missingCli), /never-print/);

const missingCredentials = probeAmapCapability({ env: {}, commandExists: () => true });
assert.equal(missingCredentials.status, "missing-credentials");
assert.equal(missingCredentials.cliAvailable, true);
assert.equal(missingCredentials.credentialsConfigured, false);
assert.equal(missingCredentials.routePlanningAvailable, false);
assert.deepEqual(missingCredentials.missingRequirements, ["AMAP_KEY", "AMAP_SECURITY_KEY"]);

const emptyCredential = probeAmapCapability({
  env: { AMAP_KEY: "", AMAP_SECURITY_KEY: "configured" },
  commandExists: () => true,
});
assert.equal(emptyCredential.status, "missing-credentials");
assert.equal(emptyCredential.credentialsConfigured, false);
assert.deepEqual(emptyCredential.missingRequirements, ["AMAP_KEY"]);

const whitespaceCredentials = probeAmapCapability({
  env: { AMAP_KEY: "   ", AMAP_SECURITY_KEY: "\t\n" },
  commandExists: () => true,
});
assert.equal(whitespaceCredentials.status, "missing-credentials");
assert.equal(whitespaceCredentials.credentialsConfigured, false);
assert.deepEqual(whitespaceCredentials.missingRequirements, ["AMAP_KEY", "AMAP_SECURITY_KEY"]);

const capabilityReady = probeAmapCapability({ env: { ...secrets }, commandExists: () => true });
assert.equal(capabilityReady.status, "available");
assert.equal(capabilityReady.routePlanningAvailable, true);
assert.equal(capabilityReady.routeVerification, "not-performed");
assert.ok(!("route" in capabilityReady), "capability probe must not invent a route result");
assert.doesNotMatch(JSON.stringify(capabilityReady), /never-print/);

const cli = spawnSync(process.execPath, [path.join(scriptDir, "check-amap-cli.js")], {
  encoding: "utf8",
  env: { ...process.env, ...secrets, PATH: "/definitely/missing" },
});
assert.equal(cli.status, 0, cli.stdout + cli.stderr);
const output = JSON.parse(cli.stdout);
assert.equal(output.status, "unavailable");
assert.doesNotMatch(cli.stdout + cli.stderr, /never-print/);

try {
  const help = runExecutionCli(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.deepEqual(JSON.parse(help.stdout), {
    status: "usage",
    usage: "Usage: amap-cli.js (--context <file> | --stdin)",
  });
  assert.equal(help.stderr, "");

  const contextRun = runExecutionCli(["--context", contextPath]);
  assert.equal(contextRun.status, 0, contextRun.stderr);
  assert.equal(contextRun.stderr, "");
  const contextOutput = JSON.parse(contextRun.stdout);
  assert.equal(contextOutput.status, "ok");
  assert.equal(contextOutput.items[0].poiId, "B0FFTEST01");
  assert.deepEqual(contextOutput.items[0].position, { lng: 100.1602, lat: 25.7001, system: "gcj02" });
  assert.doesNotMatch(contextRun.stdout + contextRun.stderr, /never-print/);

  const stdinRun = runExecutionCli(["--stdin"], fs.readFileSync(contextPath, "utf8"));
  assert.equal(stdinRun.status, 0, stdinRun.stderr);
  assert.equal(JSON.parse(stdinRun.stdout).status, "ok");
  assert.equal(stdinRun.stderr, "");

  for (const behavior of ["stderr-secret", "malformed"]) {
    const providerFailure = runExecutionCli(["--context", contextPath], "", { FAKE_AMAP_BEHAVIOR: behavior });
    assert.equal(providerFailure.status, 0, providerFailure.stderr);
    assert.equal(providerFailure.stderr, "");
    assert.equal(JSON.parse(providerFailure.stdout).status, "provider-error");
    assert.match(JSON.parse(providerFailure.stdout).message, /[\u4e00-\u9fff].*[A-Za-z]/);
    assert.doesNotMatch(providerFailure.stdout + providerFailure.stderr, /never-print|malformed-provider-json/);
  }

  const echoedSecret = runExecutionCli(["--context", contextPath], "", { FAKE_AMAP_BEHAVIOR: "echo-secret" });
  assert.equal(echoedSecret.status, 0, echoedSecret.stderr);
  assert.equal(echoedSecret.stderr, "");
  assert.equal(JSON.parse(echoedSecret.stdout).items[0].name, "[REDACTED] 北门市场 [REDACTED]");
  assert.doesNotMatch(echoedSecret.stdout, /never-print/);

  const encodedMarkup = runExecutionCli(["--context", contextPath], "", { FAKE_AMAP_BEHAVIOR: "encoded-markup" });
  assert.equal(encodedMarkup.status, 0, encodedMarkup.stderr);
  assert.equal(JSON.parse(encodedMarkup.stdout).items[0].address, "");
  assert.doesNotMatch(encodedMarkup.stdout, /&lt;|&gt;|<|>/i);

  const missingIdentity = runExecutionCli(["--context", contextPath], "", { FAKE_AMAP_BEHAVIOR: "missing-identity" });
  assert.equal(missingIdentity.status, 0, missingIdentity.stderr);
  assert.equal(JSON.parse(missingIdentity.stdout).status, "provider-error");
  assert.equal(missingIdentity.stderr, "");

  const unavailable = runExecutionCli(["--context", contextPath], "", { PATH: "/definitely/missing" });
  assert.equal(unavailable.status, 0, unavailable.stderr);
  assert.equal(JSON.parse(unavailable.stdout).status, "unavailable");
  for (const item of JSON.parse(unavailable.stdout).fallback) {
    assert.match(item, /[\u4e00-\u9fff]/);
    assert.match(item, /[A-Za-z]/);
  }
  assert.equal(unavailable.stderr, "");

  assertSanitizedCliFailure(runExecutionCli(["--stdin"], JSON.stringify({
    action: "search-poi",
    keyword: "   ",
    invalidSource: "invalid-source-secret",
  })));
  assertSanitizedCliFailure(runExecutionCli(["--stdin"], "{invalid-source-secret"));
  assertSanitizedCliFailure(runExecutionCli([]));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log("Amap capability and downgrade contract passed");
