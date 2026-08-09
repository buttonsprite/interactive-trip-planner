# AMap Cross-Platform Credential Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repeated manual AMap environment setup with a one-time, cross-platform secure credential flow while preserving environment overrides, provider truth boundaries, and release privacy.

**Architecture:** Add a synchronous credential resolver above the existing AMap runtime, backed by a small profile store and three native platform adapters: macOS Keychain, Windows CurrentUser DPAPI, and Linux Secret Service. A request-scoped provider-session wrapper restarts `amap-gui` with the resolved pair, executes the existing normalized request, and always stops in `finally`; existing POI/route input and output contracts remain unchanged.

**Tech Stack:** Node.js 18+ ESM, built-in `fs`/`os`/`path`/`crypto`/`child_process`, macOS `security`, Windows PowerShell + DPAPI, Linux `secret-tool`, existing Node assertion tests and REDSkill build scripts.

## Global Constraints

- Source changes live only in `skill/`, root product docs, tests, and build metadata; never edit generated `releases/redskill-*` directly.
- Do not add npm dependencies, native binaries, postinstall compilation, cloud credential storage, or plaintext `.env` persistence.
- The default saved store must support macOS, Windows, and Linux from the first release; Linux without Secret Service returns `store-unavailable` and offers only installation guidance or session environment variables.
- `AMAP_KEY` and `AMAP_SECURITY_KEY` are an atomic pair. Two non-empty environment values override the system store; one value alone returns `partial-environment-credentials` and never mixes sources.
- Secrets must never enter CLI arguments, user-visible stdout/stderr, logs, Git, trip data, maps, My Maps exports, screenshots, REDSkill packages, or test reports.
- Preserve the existing AMap request JSON, normalized provider output, request-binding checks, route verification states, AMap URI behavior, Google handoffs, and My Maps exports.
- `setup` and `update` require an interactive TTY and do not accept secret command-line flags or JSON secret input.
- Every production behavior starts with a focused failing test and observed expected failure before implementation.
- Any user-visible behavior, error state, credential data flow, or provider lifecycle change must update `skill/references/map-provider-delivery.md` and related user-facing documentation.

---

### Task 1: Credential resolution and atomic profile store

**Files:**
- Create: `skill/scripts/amap-credential-store.js`
- Create: `skill/scripts/test-amap-credential-store.js`
- Modify: `package.json`

**Interfaces:**
- Produces `resolveAmapCredentials({ env, store }) -> { status, source, credentials?, savedProfileAvailable }`.
- Produces `createAmapCredentialStore({ backend, pointerFile, fsApi?, randomUUID? })` with `beginCandidate()`, `commitCandidate(profileId)`, `discardCandidate(profileId)`, `readActive()`, `removeActive()`, and `status()`.
- Consumes a backend interface with `availability()`, `capturePair(profileId)`, `readPair(profileId)`, and `deletePair(profileId)`; Task 2 supplies real platform backends.
- Internal `credentials` is exactly `{ AMAP_KEY, AMAP_SECURITY_KEY }`; no public result or thrown error may include either value.

- [ ] **Step 1: Write the resolver RED tests**

Add test cases that define the exact precedence and no-mixing contract:

```js
const saved = { AMAP_KEY: "stored-key-secret", AMAP_SECURITY_KEY: "stored-security-secret" };
assert.deepEqual(
  resolveAmapCredentials({ env: { AMAP_KEY: "env-key", AMAP_SECURITY_KEY: "env-security" }, store: fakeStore(saved) }),
  { status: "ready", source: "environment", credentials: { AMAP_KEY: "env-key", AMAP_SECURITY_KEY: "env-security" }, savedProfileAvailable: true },
);
assert.deepEqual(
  resolveAmapCredentials({ env: { AMAP_KEY: "env-key" }, store: fakeStore(saved) }),
  { status: "partial-environment-credentials", source: "none", savedProfileAvailable: true },
);
assert.equal(resolveAmapCredentials({ env: {}, store: fakeStore(saved) }).source, "system-store");
```

Also cover empty/whitespace environment values, missing active profile, unavailable backend, corrupt pointer JSON, unreadable profile, and JSON serialization of public status never containing fake secrets.

- [ ] **Step 2: Run the resolver test and verify RED**

Run:

```bash
node skill/scripts/test-amap-credential-store.js
```

Expected: exit 1 because `amap-credential-store.js` or its named exports do not exist.

- [ ] **Step 3: Implement the minimal resolver and safe pointer helpers**

Implement a fixed status set and reject unsafe pointer locations:

```js
export const CREDENTIAL_STATUSES = new Set([
  "ready",
  "partial-environment-credentials",
  "missing-credentials",
  "store-unavailable",
  "store-corrupt",
]);

export function resolveAmapCredentials({ env = process.env, store }) {
  const envKey = typeof env.AMAP_KEY === "string" ? env.AMAP_KEY.trim() : "";
  const envSecurity = typeof env.AMAP_SECURITY_KEY === "string" ? env.AMAP_SECURITY_KEY.trim() : "";
  const savedProfileAvailable = store.status().savedProfileAvailable;
  if (Boolean(envKey) !== Boolean(envSecurity)) {
    return { status: "partial-environment-credentials", source: "none", savedProfileAvailable };
  }
  if (envKey && envSecurity) {
    return {
      status: "ready",
      source: "environment",
      credentials: { AMAP_KEY: envKey, AMAP_SECURITY_KEY: envSecurity },
      savedProfileAvailable,
    };
  }
  return store.readActive();
}
```

Use a versioned non-secret pointer `{ "version": 1, "profileId": "<uuid>" }`, same-directory temp write, mode `0600`, atomic rename, `lstat` rejection for a symlink config root/pointer, stable profile ID validation, and fixed sanitized errors.

- [ ] **Step 4: Add candidate-profile transaction tests and make them GREEN**

Cover:

```js
const candidate = store.beginCandidate();
assert.equal(store.readActive().status, "missing-credentials");
store.commitCandidate(candidate.profileId);
assert.equal(store.readActive().status, "ready");
assert.deepEqual(backend.deletedProfiles, [oldProfileId]);
```

Also prove failed capture deletes a partial candidate, failed validation can call `discardCandidate` without changing the active pointer, interrupted candidate profiles are cleaned on the next begin operation, `removeActive` deletes only the namespaced active pair, unrelated files remain unchanged, and symlink/permission failures return stable store errors.

- [ ] **Step 5: Register and run the focused test**

Add `node skill/scripts/test-amap-credential-store.js` before existing AMap tests in `package.json` `test:skill`, then run:

```bash
node skill/scripts/test-amap-credential-store.js
npm run test:skill
```

Expected: both exit 0 and no fake secret appears in output.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json skill/scripts/amap-credential-store.js skill/scripts/test-amap-credential-store.js
git commit -m "feat: add AMap credential profile store"
```

---

### Task 2: Native macOS, Windows, and Linux credential backends

**Files:**
- Create: `skill/scripts/amap-credential-backends.js`
- Create: `skill/scripts/test-amap-credential-backends.js`
- Modify: `skill/scripts/amap-credential-store.js`
- Modify: `package.json`

**Interfaces:**
- Produces `createPlatformCredentialBackend({ platform, env, runCommand, promptSecret })` implementing the Task 1 backend interface.
- Produces `platformCredentialPaths({ platform, env, homedir }) -> { configRoot, pointerFile }`.
- `runCommand(command, args, options)` always uses `shell: false`; secret values may be sent only through inherited child environment, controlled stdin, or native interactive prompt.

- [ ] **Step 1: Write platform command-contract RED tests**

Use injected runners and secret prompts to assert exact safe behavior:

```js
const mac = createPlatformCredentialBackend({ platform: "darwin", runCommand: captureRunner });
mac.capturePair("profile-uuid");
assert.deepEqual(calls[0].args.slice(-1), ["-w"]);
assert.doesNotMatch(JSON.stringify(calls[0].args), /fake-amap-secret/);

const windows = createPlatformCredentialBackend({ platform: "win32", runCommand: captureRunner, promptSecret });
assert.equal(calls[0].options.input.includes("fake-amap-secret"), true);
assert.doesNotMatch(JSON.stringify(calls[0].args), /fake-amap-secret/);

const linux = createPlatformCredentialBackend({ platform: "linux", runCommand: captureRunner, promptSecret });
assert.equal(calls[0].command, "secret-tool");
assert.equal(calls[0].options.input, "fake-amap-secret");
```

Test `security`, Windows PowerShell DPAPI, and `secret-tool` success, command missing, locked/unavailable store, cancellation, first-item success plus second-item failure cleanup, read, delete, and raw native stderr containing a fake secret.

- [ ] **Step 2: Run backend test and verify RED**

```bash
node skill/scripts/test-amap-credential-backends.js
```

Expected: exit 1 because the platform backend module is missing.

- [ ] **Step 3: Implement macOS Keychain backend**

Use the fixed namespace `com.pmacyx.interactive-trip-planner.amap`, accounts `<profileId>:key` and `<profileId>:security-key`, and native interactive storage:

```js
["add-generic-password", "-U", "-a", account, "-s", service, "-w"]
```

`-w` must be the final argument. Read with `find-generic-password ... -w`, capture stdout internally, trim only the final line ending, and never forward native stdout/stderr. Delete only the two exact namespaced accounts.

- [ ] **Step 4: Implement Windows CurrentUser DPAPI backend**

Use built-in Windows PowerShell and a constant script that reads JSON from stdin, calls `ProtectedData.Protect(..., CurrentUser)` / `Unprotect`, and emits only the bounded operation result. Store only base64 ciphertext in `%APPDATA%/interactive-trip-planner/profiles/<profileId>.json`; apply a current-user ACL with PowerShell using the current user SID, reject reparse points/symlinks, and never put plaintext or ciphertext in PowerShell arguments or errors.

- [ ] **Step 5: Implement Linux Secret Service backend**

Use:

```text
secret-tool store --label Interactive Trip Planner AMap service interactive-trip-planner profile <id> kind <key|security-key>
secret-tool lookup service interactive-trip-planner profile <id> kind <key|security-key>
secret-tool clear service interactive-trip-planner profile <id> kind <key|security-key>
```

Pass the secret only through stdin. Require the executable, `DBUS_SESSION_BUS_ADDRESS`, and a successful bounded availability probe. Missing/locked Keyring returns `store-unavailable`; it never writes a fallback file.

- [ ] **Step 6: Make all backend tests GREEN and register them**

```bash
node skill/scripts/test-amap-credential-backends.js
node skill/scripts/test-amap-credential-store.js
npm run test:skill
```

Expected: all exit 0; command-argument and output secret scans remain empty.

- [ ] **Step 7: Commit Task 2**

```bash
git add package.json skill/scripts/amap-credential-backends.js skill/scripts/amap-credential-store.js skill/scripts/test-amap-credential-backends.js
git commit -m "feat: add cross-platform AMap credential backends"
```

---

### Task 3: Setup/status/update/remove CLI and transactional live validation

**Files:**
- Create: `skill/scripts/amap-credentials.js`
- Create: `skill/scripts/amap-credentials-runtime.js`
- Create: `skill/scripts/test-amap-credentials-cli.js`
- Modify: `package.json`

**Interfaces:**
- Produces `runAmapCredentialAction(action, deps) -> publicStatus` for `setup`, `status`, `update`, `remove`.
- CLI accepts exactly one positional action and optional `--help`; it never accepts secret flags, context files, JSON, or stdin secret input.
- Consumes Task 1 store and Task 2 backend plus an injected `validateCredentials(credentials)` callback; Task 4 wires the real provider validator.

- [ ] **Step 1: Write CLI RED tests**

Define help and safe public statuses:

```js
assert.deepEqual(runCli(["--help"]), {
  status: "usage",
  usage: "Usage: amap-credentials.js <setup|status|update|remove>",
});
assert.equal(runCli(["setup", "--key", "secret"]).status, 2);
assert.doesNotMatch(runCli(["setup", "--key", "secret"]).stderr, /secret/);
```

Test non-TTY setup/update rejection, successful setup, setup when active exists, update success, update validation failure retaining old active profile, cancellation cleanup, remove idempotency, status with environment override plus saved profile, and fixed bilingual next steps. Spawn the real CLI with a fake backend hook only through dependency-injected runtime tests; never add a production test bypass environment variable.

- [ ] **Step 2: Run CLI test and verify RED**

```bash
node skill/scripts/test-amap-credentials-cli.js
```

Expected: exit 1 because CLI/runtime files do not exist.

- [ ] **Step 3: Implement command parsing and action runtime**

Use a strict action set:

```js
const ACTIONS = new Set(["setup", "status", "update", "remove"]);
```

`setup` refuses an existing active profile; `update` requires one or behaves as setup only with explicit stable copy; both create a candidate, call `validateCredentials`, commit only when `{ searchStatus: "ok", routeStatus: "ok" }`, and discard in every failure/cancel path. `remove` first invokes provider stop, then removes the active namespaced pair and pointer.

- [ ] **Step 4: Implement stable output and secret redaction**

Public output may contain only:

```js
{
  status: "ready|missing-cli|missing-credentials|partial-environment-credentials|store-unavailable|store-corrupt|invalid-credentials|removed",
  platform: "darwin|win32|linux",
  source: "environment|system-store|none",
  savedProfileAvailable: true,
  providerReady: false,
  nextStep: "fixed bilingual copy",
}
```

Catch all native/provider errors and map them to fixed statuses. Never include caught message, stack, path, account name, profile ID, ciphertext, Key length, prefix, suffix, or native stderr.

- [ ] **Step 5: Make focused tests GREEN and register them**

```bash
node skill/scripts/test-amap-credentials-cli.js
node --check skill/scripts/amap-credentials.js
node --check skill/scripts/amap-credentials-runtime.js
npm run test:skill
```

Expected: all exit 0.

- [ ] **Step 6: Commit Task 3**

```bash
git add package.json skill/scripts/amap-credentials.js skill/scripts/amap-credentials-runtime.js skill/scripts/test-amap-credentials-cli.js
git commit -m "feat: add one-time AMap credential setup"
```

---

### Task 4: Resolve saved credentials and manage request-scoped provider sessions

**Files:**
- Create: `skill/scripts/amap-provider-session.js`
- Create: `skill/scripts/test-amap-provider-session.js`
- Modify: `skill/scripts/check-amap-cli.js`
- Modify: `skill/scripts/amap-cli-runtime.js`
- Modify: `skill/scripts/amap-cli.js`
- Modify: `skill/scripts/amap-credentials-runtime.js`
- Modify: `skill/scripts/test-amap-cli.js`
- Modify: `skill/scripts/test-amap-cli-execution.js`
- Modify: `skill/scripts/test-amap-cli-live.js`
- Modify: `package.json`

**Interfaces:**
- Produces `withAmapProviderSession({ credentials, runLifecycleCommand }, operation)`; it stops any existing container, starts with the complete pair, confirms `mapReady: true`, runs `operation(providerEnv)`, and stops in `finally`.
- `probeAmapCapability` consumes `credentialResolution` or invokes the default resolver; it remains non-querying and returns no credentials.
- `executeAmapRequest` consumes resolved credentials and the request-scoped session, while normalized output remains byte-for-byte compatible apart from new capability failure statuses.

- [ ] **Step 1: Write provider-session RED tests**

Cover exact order and cleanup:

```js
const events = [];
const result = withAmapProviderSession(deps(events), (providerEnv) => {
  events.push(["query", providerEnv.AMAP_KEY]);
  return { status: "ok" };
});
assert.deepEqual(events.map(([name]) => name), ["stop-old", "start", "status", "query", "stop-finally"]);
assert.equal(result.status, "ok");
```

Also test start failure, `mapReady: false`, query throw, query timeout, stop failure after success, native stderr containing secrets, partial environment values, system-store success, and environment override. Assert lifecycle `spawnSync` uses `shell: false`, bounded timeouts, and secrets only in `options.env`.

- [ ] **Step 2: Run provider-session and modified execution tests to verify RED**

```bash
node skill/scripts/test-amap-provider-session.js
node skill/scripts/test-amap-cli-execution.js
```

Expected: the new focused test fails because the session module is missing; the modified execution assertions fail because current runtime does not load saved credentials or manage start/stop.

- [ ] **Step 3: Implement request-scoped lifecycle**

Use distinct injected runners for lifecycle and provider query. Always invoke:

```js
try {
  stopExisting();
  startWithCredentials();
  assertReady();
  return operation(providerEnv);
} finally {
  stopCurrent();
}
```

Do not reuse an existing container because its credential pair cannot be proven. A final stop failure cannot change an already failed request into success; a final stop failure after a successful provider result returns a stable `provider-error` so the public contract never claims a clean verified execution when cleanup is incomplete.

- [ ] **Step 4: Integrate credential resolution without changing provider facts**

Update capability and execution flow:

```js
const resolution = credentialResolution || resolveAmapCredentials({ env, store });
if (resolution.status !== "ready") return capabilityFallback(resolution.status);
const providerEnv = { ...env, ...resolution.credentials };
return withAmapProviderSession(sessionDeps(providerEnv), () => runNormalizedProviderRequest(providerEnv));
```

Keep credential redaction based on the effective pair, including system-store credentials. Preserve `shell: false`, the 35-second provider timeout, official response shape normalization, request binding, and no provider stderr exposure.

- [ ] **Step 5: Wire transactional setup validation**

`setup`/`update` validation receives the candidate pair explicitly and runs the existing stable live fixture: one bounded public POI search plus one walking route. It must require both normalized results to be `status: ok`; the candidate remains inactive until both pass, and the provider session stops after each request.

- [ ] **Step 6: Make focused and regression tests GREEN**

```bash
node skill/scripts/test-amap-provider-session.js
node skill/scripts/test-amap-credential-store.js
node skill/scripts/test-amap-credential-backends.js
node skill/scripts/test-amap-credentials-cli.js
node skill/scripts/test-amap-cli.js
node skill/scripts/test-amap-cli-execution.js
node skill/scripts/test-map-provider-contract.js
node skill/scripts/test-map-delivery-forward.js
npm run test:skill
```

Expected: all exit 0; ungated live test still reports `SKIP` unless explicitly enabled.

- [ ] **Step 7: Commit Task 4**

```bash
git add package.json skill/scripts/amap-provider-session.js skill/scripts/test-amap-provider-session.js skill/scripts/check-amap-cli.js skill/scripts/amap-cli-runtime.js skill/scripts/amap-cli.js skill/scripts/amap-credentials-runtime.js skill/scripts/test-amap-cli.js skill/scripts/test-amap-cli-execution.js skill/scripts/test-amap-cli-live.js
git commit -m "feat: automate AMap credential and provider lifecycle"
```

---

### Task 5: Skill workflow, bilingual docs, online logic, and release contracts

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/REDSKILL_INSTALL.template.md`
- Modify: `skill/SKILL.md`
- Modify: `skill/references/planning-workflow.md`
- Modify: `skill/references/regional-source-packs.md`
- Modify: `skill/references/taste-and-source-online-logic.md`
- Modify: `skill/references/user-facing-language.md`
- Modify: `skill/references/map-provider-delivery.md`
- Modify: `skill/scripts/test-skill-contract.js`
- Modify: `skill/scripts/test-redskill-package.js`

**Interfaces:**
- Documents the one-time setup as the normal China-only user path.
- Keeps manual environment variables as advanced/CI override and `amap-gui` commands as troubleshooting, not onboarding.
- Enforces exact first-use, success, and Linux-no-store Chinese/English copy plus no-plaintext/no-secret-args boundaries.

- [ ] **Step 1: Add document-contract RED assertions**

Require every user-facing install/workflow document to include:

```text
node skill/scripts/amap-credentials.js setup
node skill/scripts/amap-credentials.js status
node skill/scripts/amap-credentials.js update
node skill/scripts/amap-credentials.js remove
macOS Keychain
Windows DPAPI
Linux Secret Service
```

Require the install template and provider doc to say environment variables are an advanced/session override, Linux never silently writes plaintext, and setup performs real POI + route validation. Add negative assertions that reject active guidance requiring users to `export` on every use, manually start the provider for normal operation, paste keys in chat, or save a default `.env`.

- [ ] **Step 2: Run document tests and verify RED**

```bash
node skill/scripts/test-skill-contract.js
node skill/scripts/test-redskill-package.js
```

Expected: both fail because current docs describe environment-only setup and manual `amap-gui start`.

- [ ] **Step 3: Update concise Skill guidance and detailed references**

Keep `SKILL.md` concise: China-only trigger, run `status`, offer `setup` once when missing, never ask for secrets in chat, and use the saved credential path automatically. Put platform details, states, exact commands, lifecycle, privacy, and troubleshooting in `map-provider-delivery.md`; update the other references only where they route the workflow or define user-facing copy.

- [ ] **Step 4: Update README and REDSkill install copy**

Present:

```text
First use: amap-credentials.js setup
Later use: automatic
Advanced/CI: AMAP_KEY + AMAP_SECURITY_KEY
Linux without Secret Service: install Keyring support or use session environment values; no plaintext fallback
```

Do not claim Windows/Linux native live testing on the current macOS host; distinguish simulated command-contract coverage from real platform smoke evidence.

- [ ] **Step 5: Make document and package tests GREEN**

```bash
node skill/scripts/test-skill-contract.js
node skill/scripts/test-redskill-package.js
npm run test:skill
git diff --check
```

Expected: all exit 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add README.md README.en.md docs/REDSKILL_INSTALL.template.md skill/SKILL.md skill/references/planning-workflow.md skill/references/regional-source-packs.md skill/references/taste-and-source-online-logic.md skill/references/user-facing-language.md skill/references/map-provider-delivery.md skill/scripts/test-skill-contract.js skill/scripts/test-redskill-package.js
git commit -m "docs: make AMap setup one-time and cross-platform"
```

---

### Task 6: Forward verification, real macOS setup, and release readiness

**Files:**
- No tracked source modifications are planned in this task; any newly discovered defect starts a separate RED-GREEN fix cycle against its owning task before final verification resumes.
- Generate for verification only, then restore unless release integration is separately approved: `releases/redskill-0.2.0/`

**Interfaces:**
- Consumes all prior task contracts.
- Produces fresh source, packaged-skill, privacy, simulated cross-platform, real macOS Keychain, and real AMap evidence without publishing or merging.

- [ ] **Step 1: Run static and simulated cross-platform verification**

```bash
node skill/scripts/test-amap-credential-store.js
node skill/scripts/test-amap-credential-backends.js
node skill/scripts/test-amap-credentials-cli.js
node skill/scripts/test-amap-provider-session.js
npm run test:skill
```

Expected: all exit 0. Report Windows and Linux as simulated native-command contracts unless actually run on those operating systems.

- [ ] **Step 2: Perform real macOS Keychain setup without exposing secrets**

Run interactively:

```bash
node skill/scripts/amap-credentials.js setup
node skill/scripts/amap-credentials.js status
```

Expected: setup prompts through the safe path, performs real POI + route validation, returns `ready`, and status reports `source: system-store` without any credential value or fragment.

- [ ] **Step 3: Run the opt-in live gate from system storage**

Run with both AMap environment variables unset:

```bash
env -u AMAP_KEY -u AMAP_SECURITY_KEY RUN_AMAP_LIVE=1 node skill/scripts/test-amap-cli-live.js
```

Expected: `PASS`, `searchStatus: ok`, `routeStatus: ok`, one verified route, and no secret in stdout/stderr.

- [ ] **Step 4: Verify update failure preserves active credentials and remove is scoped**

Use a test-only synthetic backend for the failure path, not the user's real Keychain. Then, after the user approves cleanup of the real saved pair, run `remove`; otherwise retain the working saved configuration as the intended product state. In both cases confirm unrelated Keychain items are untouched.

- [ ] **Step 5: Build and test the REDSkill package**

```bash
npm run build:redskill
npm run test:redskill
if rg -n 'AMAP_KEY=|AMAP_SECURITY_KEY=|AIza[0-9A-Za-z_-]{20,}|Cookie:|stored-key-secret|fake-amap-secret' releases/redskill-0.2.0; then exit 1; fi
```

Expected: build/tests exit 0 and secret scan returns no match. Inspect that the new scripts and updated references are present; no platform pointer, ciphertext, Keychain state, or private fixture is packaged.

- [ ] **Step 6: Restore generated release and run final source verification**

Because version 0.3.0 release integration remains a separate Task 9 gate, restore the generated 0.2.0 directory exactly after verification:

```bash
git restore -- releases/redskill-0.2.0
git clean -fd -- releases/redskill-0.2.0
npm run test:skill
node --check skill/scripts/amap-credential-store.js
node --check skill/scripts/amap-credential-backends.js
node --check skill/scripts/amap-credentials-runtime.js
node --check skill/scripts/amap-credentials.js
node --check skill/scripts/amap-provider-session.js
git diff --check
git status --short
```

Expected: all checks exit 0; release directory has no diff; worktree is clean after the implementation commits.

- [ ] **Step 7: Request code review before release integration**

Use `superpowers:requesting-code-review` against the design spec and this plan. Resolve every Critical/Important finding with a new RED test, rerun the affected focused tests and full verification, then leave package version bump, generated `redskill-0.3.0`, push, PR, and merge for the existing release Task 9 and explicit user approval.

---

## Execution Order and Checkpoints

1. Tasks 1–2 establish the platform-independent contract and native adapters.
2. Task 3 creates the user-facing one-time setup without yet changing provider execution.
3. Task 4 switches runtime behavior and is the highest-risk checkpoint; do not begin docs until all provider truth tests pass.
4. Task 5 updates Skill guidance only after runtime behavior is real.
5. Task 6 performs forward, package, and live verification; it does not publish, merge, or bump the release version.
