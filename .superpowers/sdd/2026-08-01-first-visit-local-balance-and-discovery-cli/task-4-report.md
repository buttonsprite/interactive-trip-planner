# Task 4: Safe Source Access Probe Report

## Scope

- Base commit verified before work: `db9ff0148916cfb9545a2cc08c00fbf0118ee2a6` with a clean worktree.
- Added `probe-source-access.js` and its local-server black-box contract test.
- Updated only the Task 4 command documentation and `test:skill` wiring.

## TDD evidence

RED command (run before the production module existed):

```bash
node skill/scripts/test-source-access-probe.js
```

Result: exit 1 with `ERR_MODULE_NOT_FOUND` for `skill/scripts/probe-source-access.js`.

GREEN command:

```bash
node skill/scripts/test-source-access-probe.js
```

Result: exit 0, `Source access probe contract passed`.

Approved design extension RED command:

```bash
node skill/scripts/test-source-access-probe.js
```

Result: exit 1 because the earlier result did not include `httpStatus` (`undefined !== 200`).

Extension GREEN command:

```bash
node skill/scripts/test-source-access-probe.js
```

Result: exit 0, `Source access probe contract passed`.

The test uses only a local `http.createServer`, closes it in `finally`, and covers reachable, redirect, not-found, access-blocked, rate-limited, server-error, timeout/network-error, HTTP status/null network code, HEAD 405 to bounded GET fallback, body/header secrecy, unsafe URLs, bounded concurrency, fallback non-access and `fallback-required`, raw request query preservation with sanitized output, and CLI file/stdin/help/failure JSON behavior. The timeout test uses 100ms against a 200ms slow route so it measures timeout behavior without treating first-use local fetch setup as a timeout.

## Fresh verification

```bash
node skill/scripts/test-source-access-probe.js && npm test
PYTHONPATH=/tmp/interactive-trip-planner-quick-validate-deps python3 /Users/cyx/.codex/skills/.system/skill-creator/scripts/quick_validate.py skill
probe_release_root=$(mktemp -d /tmp/interactive-trip-planner-source-probe-release.XXXXXX)
node skill/scripts/build-redskill-release.js "$probe_release_root" 0.1.0
node "$probe_release_root/interactive-trip-planner/scripts/test-source-access-probe.js"
node skill/scripts/test-redskill-release.js "$probe_release_root" 0.1.0
```

Results: all commands exited 0; `npm test` ran the wired probe test, full Skill suite, REDSkill build, and release contract; quick validation printed `Skill is valid!`; the isolated release copy also passed the probe test and release contract.

## Boundary

The probe only reports bounded HTTP access. It preserves the validated original URL for the request but sanitizes emitted URLs; it never automatically probes fallback URLs and never emits response headers, body, or credentials. A successful result cannot establish a POI's existence, opening status, bookability, route suitability, or safety.
