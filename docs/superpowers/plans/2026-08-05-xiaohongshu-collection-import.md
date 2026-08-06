# Xiaohongshu Collection Import 0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, local-first Xiaohongshu collection and single-note import workflow that turns user-provided links into a browsable private research library and feeds only verified travel signals into itinerary planning.

**Architecture:** Keep authenticated browser use outside deterministic scripts and limit it to board-link enumeration after explicit per-import consent. Implement anonymous public-page parsing, URL sanitization, workflow decisions, local library writes, material staging, Markdown views, validation, and summaries as dependency-free Node.js modules and CLIs. Keep `record.json` as the machine source of truth and regenerate all human-readable Markdown indexes from it.

**Tech Stack:** Node.js 18+ ESM, built-in `fetch`, `fs`, `path`, `crypto`, `node:assert`, existing REDSkill builder and contract tests.

## Global Constraints

- Target version is `0.2.0`; do not describe it as Public V1 ready.
- Authenticated browser access requires explicit confirmation for the current board and may only enumerate rendered note links.
- Never read, export, decrypt, persist, or log Cookie, Authorization, `xsec_token`, `share_id`, `appuid`, signed media URLs, or browser profiles.
- Single-note parsing uses anonymous public requests only and never silently falls back to a logged-in browser or third-party parser.
- The default library is `<workspace>/travel-library/xiaohongshu/`; never create it inside an installed Skill or REDSkill release directory.
- `record.json` is the only machine-writable note record; `note.md`, `INDEX.md`, collection summaries, import summaries, and trip selections are generated views.
- Materials are not downloaded by default. Explicitly staged assets are limited to validated JPEG, PNG, WebP, or UTF-8 text, 15 MiB per file and 200 MiB per import.
- Xiaohongshu content can support only `discovery`, `recommendation`, and `experience`; volatile or high-impact facts still require official verification.
- No new runtime dependency. REDSkill output remains limited to `.md`, `.html`, `.css`, `.js`, and `.json`.
- Do not add real board URLs, account identifiers, note bodies, screenshots, tokens, or signed media URLs to source, fixtures, tests, release artifacts, or documentation.

---

## File Structure

### Runtime and CLI

- Create `skill/scripts/xhs-import-runtime.js`: URL classification/sanitization, safe embedded-state parsing, board/note normalization, and collection workflow decisions.
- Create `skill/scripts/fetch-xhs-public.js`: bounded anonymous public fetch CLI and transport layer.
- Create `skill/scripts/xhs-library-runtime.js`: path confinement, atomic JSON/Markdown writes, indexes, Git boundary, materials, deduplication, and validation.
- Create `skill/scripts/import-xhs-library.js`: library import CLI.
- Create `skill/scripts/validate-xhs-library.js`: library validation CLI.
- Create `skill/scripts/summarize-xhs-import.js`: readable/JSON import summary CLI.

### Tests

- Create `skill/scripts/test-xhs-import-runtime.js`: URL, parser, normalization, and consent-state tests.
- Create `skill/scripts/test-xhs-public-fetch.js`: bounded transport and structured failure tests.
- Create `skill/scripts/test-xhs-library.js`: storage layout, views, dedupe, materials, path safety, and validator tests.
- Create `skill/scripts/test-xhs-import-cli.js`: end-to-end CLI tests with synthetic data.

### Skill resources and product documentation

- Create `skill/assets/xiaohongshu-library-template/README.md`: copied human guide for a private library.
- Create `skill/assets/xiaohongshu-library-template/library.json`: schema-versioned empty registry.
- Create `skill/references/xiaohongshu-import.md`: complete workflow, risk text, browser boundary, storage contract, CLI usage, and fallback behavior.
- Modify `skill/SKILL.md`: recognize board/note links before destination research, route to the new reference, and disclose login risk.
- Modify `skill/references/source-verification.md`: define social-note evidence roles and official re-verification.
- Modify `skill/references/taste-and-source-online-logic.md`: record only the actually implemented 0.2 behavior.
- Modify `skill/references/workspace-bootstrap.md` and `skill/assets/workspace-AGENTS-template.md`: reserve and ignore the private library path.
- Modify `skill/agents/openai.yaml`: mention user-provided saved notes without embedding workflow shortcuts.
- Modify `README.md` and `README.en.md`: product-first explanation, private library layout, login-risk choice, and example commands.

### Build and release

- Modify `package.json` and `skill/package.json`: set `0.2.0` and add new tests to `test:skill`.
- Modify `skill/scripts/test-redskill-package.js`, `skill/scripts/test-redskill-release.js`, and `skill/scripts/test-skill-contract.js`: require the new runtime, docs, privacy contract, and release-safe files.
- Generate `releases/redskill-0.2.0/` with the existing builder after all source tests are green.

---

### Task 1: URL, Embedded State, and Consent Workflow

**Files:**
- Create: `skill/scripts/test-xhs-import-runtime.js`
- Create: `skill/scripts/xhs-import-runtime.js`
- Modify: `package.json`

**Interfaces:**
- Produces `classifyXhsUrl(input): { kind, inputUrl, host }` where `kind` is `board`, `note`, or `short-link`.
- Produces `sanitizeXhsUrl(input, resolvedUrl?): string` with credentials, query, and fragment removed.
- Produces `extractInitialState(html): object` without `eval`, `vm`, or executing page script.
- Produces `normalizeBoardState(state): { boardId, title, totalCount, notes }`.
- Produces `normalizeNoteState(state): NormalizedXhsNote`.
- Produces `decideBoardImport(input): { status, requiresRiskConfirmation, allowedActions }`.

- [ ] **Step 1: Write the failing runtime test**

Cover literal cases that break if classification, sanitization, parsing, or consent logic regresses:

```js
assert.equal(classifyXhsUrl("https://www.xiaohongshu.com/board/board-fixture?share_id=secret").kind, "board");
assert.equal(classifyXhsUrl("https://www.xiaohongshu.com/explore/note-fixture?xsec_token=secret").kind, "note");
assert.equal(sanitizeXhsUrl("https://user:pass@www.xiaohongshu.com/explore/note-fixture?xsec_token=secret#x"), "https://www.xiaohongshu.com/explore/note-fixture");
assert.deepEqual(decideBoardImport({ totalCount: 28, anonymousCount: 10, consent: "not-confirmed" }), {
  status: "needs-user-choice",
  requiresRiskConfirmation: true,
  allowedActions: ["authenticated-link-enumeration", "import-anonymous-partial", "provide-single-note-links"],
});
```

Use a synthetic `<script>window.__INITIAL_STATE__={...}</script>` fixture containing strings with braces and standalone `undefined`; assert parsing returns JSON values and never executes an adjacent script that would mutate `globalThis`.

- [ ] **Step 2: Run the runtime test and verify RED**

Run: `node skill/scripts/test-xhs-import-runtime.js`

Expected: fail because `xhs-import-runtime.js` does not exist.

- [ ] **Step 3: Implement the minimal runtime**

Implement a character scanner that extracts the first balanced object after `window.__INITIAL_STATE__`, tracks quoted strings and escapes, replaces standalone `undefined` tokens with `null` outside strings, then calls `JSON.parse`. Reject missing state, trailing executable syntax, unsupported hosts, non-HTTP(S) protocols, and URLs with invalid shapes using fixed error codes that never echo the original secret-bearing URL.

Normalize only fields actually present in the synthetic contracts: note ID, title, display author, body, tags, publish time, media type/count, and canonical page path. Deduplicate board notes by note ID.

- [ ] **Step 4: Run the runtime test and verify GREEN**

Run: `node skill/scripts/test-xhs-import-runtime.js`

Expected: `Xiaohongshu import runtime contract passed` and exit 0.

- [ ] **Step 5: Add the runtime test to `test:skill` and commit**

Run: `npm run test:skill`

Expected: the new test and all existing Skill tests pass.

Commit:

```bash
git add package.json skill/scripts/xhs-import-runtime.js skill/scripts/test-xhs-import-runtime.js
git commit -m "feat: add Xiaohongshu import runtime"
```

### Task 2: Bounded Anonymous Public Fetcher

**Files:**
- Create: `skill/scripts/test-xhs-public-fetch.js`
- Create: `skill/scripts/fetch-xhs-public.js`
- Modify: `package.json`

**Interfaces:**
- Consumes `classifyXhsUrl`, `sanitizeXhsUrl`, `extractInitialState`, `normalizeBoardState`, and `normalizeNoteState`.
- Produces `fetchPublicXhs(context, options): Promise<PublicFetchResult>`.
- CLI accepts exactly one of `--context <file>` or `--stdin`; JSON is `{ "url": "...", "timeoutMs": 8000 }`.

- [ ] **Step 1: Write the failing fetch test**

Use a deterministic injected transport with complete Response-like fixtures. Assert:

```js
const result = await fetchPublicXhs({ url: "https://www.xiaohongshu.com/board/board-fixture" }, { transport });
assert.equal(result.status, "partial");
assert.equal(result.kind, "board");
assert.equal(result.board.totalCount, 3);
assert.equal(result.board.notes.length, 2);
assert.equal(transport.calls[0].headers.cookie, undefined);
assert.equal(transport.calls[0].headers.authorization, undefined);
```

Add separate cases for redirect to a non-allowlisted host, more than three redirects, non-HTML response, response larger than 5 MiB, timeout, login page, CAPTCHA/risk page, malformed state, and an error URL containing `xsec_token=secret`. Each failure must return a fixed code and sanitized canonical URL without the secret.

- [ ] **Step 2: Run the fetch test and verify RED**

Run: `node skill/scripts/test-xhs-public-fetch.js`

Expected: fail because `fetch-xhs-public.js` does not exist.

- [ ] **Step 3: Implement the minimal fetcher and CLI**

Use manual redirects; validate every target host before the next request. Send only `accept`, `accept-language`, and a stable mobile `user-agent`. Read the body as a bounded stream and abort at 5 MiB. Set timeout with `AbortController`. Detect common login, CAPTCHA, and risk-page markers before parsing state. Print one JSON object to stdout; errors go to stderr with exit code 2 and fixed non-secret messages.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node skill/scripts/test-xhs-public-fetch.js
node skill/scripts/test-discovery-cli.js
```

Expected: both pass with no stderr.

- [ ] **Step 5: Add the fetch test to `test:skill` and commit**

Run: `npm run test:skill`

Commit:

```bash
git add package.json skill/scripts/fetch-xhs-public.js skill/scripts/test-xhs-public-fetch.js
git commit -m "feat: add bounded public Xiaohongshu fetcher"
```

### Task 3: Private Library, Human Views, and Materials

**Files:**
- Create: `skill/scripts/test-xhs-library.js`
- Create: `skill/scripts/xhs-library-runtime.js`
- Create: `skill/assets/xiaohongshu-library-template/README.md`
- Create: `skill/assets/xiaohongshu-library-template/library.json`
- Modify: `package.json`

**Interfaces:**
- Produces `resolveLibraryRoot({ workspaceRoot, libraryRoot }): string`.
- Produces `initializeLibrary({ workspaceRoot, libraryRoot }): LibraryIndex`.
- Produces `importIntoLibrary({ workspaceRoot, libraryRoot, assetStagingRoot, payload }): ImportResult`.
- Produces `validateLibrary({ libraryRoot }): ValidationResult`.
- Produces generated `README.md`, `INDEX.md`, `library.json`, collection/note/import/trip folders, JSON records, Markdown views, and media manifests.

- [ ] **Step 1: Write the failing storage test**

In a real temporary Git-like workspace containing a `.git` directory, import two synthetic notes where one note appears twice. Assert literal filesystem outcomes:

```js
assert.ok(fs.existsSync(path.join(root, "INDEX.md")));
assert.ok(fs.existsSync(path.join(root, "notes", "note-a", "record.json")));
assert.ok(fs.existsSync(path.join(root, "notes", "note-a", "note.md")));
assert.equal(JSON.parse(fs.readFileSync(path.join(root, "library.json"))).notes.length, 2);
assert.match(fs.readFileSync(path.join(workspace, ".gitignore"), "utf8"), /^travel-library\/$/m);
assert.match(fs.readFileSync(path.join(root, "INDEX.md"), "utf8"), /notes\/note-a\/note\.md/);
```

Stage one valid JPEG fixture, one UTF-8 OCR text fixture, one PNG with a false `.jpg` extension, one symlink, and one oversized sparse file. Assert valid files land under `media/original/` or `media/derived/` with SHA-256 manifest entries; invalid, symlinked, and oversized inputs are rejected without partial note writes.

Add mutations for `../escape`, absolute note IDs, duplicate title changes, interrupted temp files, a library root inside `skill/` or `releases/`, and a symlink in any destination parent.

- [ ] **Step 2: Run the storage test and verify RED**

Run: `node skill/scripts/test-xhs-library.js`

Expected: fail because `xhs-library-runtime.js` does not exist.

- [ ] **Step 3: Implement atomic, confined storage**

Use stable IDs for directories; use `path.resolve` plus ancestor checks; reject symlinks with `lstatSync`; write JSON and Markdown to sibling temporary files and rename only after validation. Copy templates only on first initialization. Rebuild `INDEX.md`, `collection.md`, `note.md`, `summary.md`, and `selection.md` after every successful import using relative Markdown links.

Validate file signatures before copying staged materials. Compute SHA-256 while reading bounded files. Use `01-cover.jpg`, `02-image.webp`, and `01-ocr.txt` style names. Never persist a remote media URL with a query or fragment.

- [ ] **Step 4: Run focused storage tests and verify GREEN**

Run: `node skill/scripts/test-xhs-library.js`

Expected: `Xiaohongshu library contract passed` and no writes outside the temporary workspace.

- [ ] **Step 5: Add the storage test to `test:skill` and commit**

Run: `npm run test:skill`

Commit:

```bash
git add package.json skill/scripts/xhs-library-runtime.js skill/scripts/test-xhs-library.js skill/assets/xiaohongshu-library-template
git commit -m "feat: add browsable private travel library"
```

### Task 4: Import, Validate, and Summarize CLIs

**Files:**
- Create: `skill/scripts/test-xhs-import-cli.js`
- Create: `skill/scripts/import-xhs-library.js`
- Create: `skill/scripts/validate-xhs-library.js`
- Create: `skill/scripts/summarize-xhs-import.js`
- Modify: `package.json`

**Interfaces:**
- `import-xhs-library.js --workspace <dir> [--library <dir>] [--asset-staging <dir>] (--context <file> | --stdin)`.
- `validate-xhs-library.js --library <dir>`.
- `summarize-xhs-import.js --library <dir> --import <import-id> [--json]`.
- Import payload includes `importId`, `startedAt`, `source`, `risk`, `notes`, `failures`, and optional `tripSelection`; it never includes Cookie or request headers.

- [ ] **Step 1: Write the failing CLI integration test**

Run the CLIs with `spawnSync` against a temporary workspace and a synthetic payload. Assert exit codes, JSON-only stdout for import/validate, readable Markdown for summary, default library placement, dedupe counts, trip selection links, and no secret-bearing query in any file.

Include rejection cases for both `--context` and `--stdin`, neither input, unreadable path, non-object JSON, missing workspace, library outside an explicitly confined workspace unless separately selected, token-like fields at any nesting level, and a failed validation after manually corrupting one note record.

- [ ] **Step 2: Run the CLI integration test and verify RED**

Run: `node skill/scripts/test-xhs-import-cli.js`

Expected: fail because the CLI scripts do not exist.

- [ ] **Step 3: Implement minimal CLI wrappers**

Reuse runtime functions; keep argument parsing explicit and fail closed. Scan payload keys recursively for forbidden credential names before any write. Import returns counts and relative paths, validate returns errors/warnings without note bodies, and summarize reads only the selected import manifest plus generated indexes.

- [ ] **Step 4: Run focused CLI tests and verify GREEN**

Run:

```bash
node skill/scripts/test-xhs-import-cli.js
node skill/scripts/test-xhs-library.js
```

Expected: both pass with no stderr.

- [ ] **Step 5: Add the CLI test to `test:skill` and commit**

Run: `npm run test:skill`

Commit:

```bash
git add package.json skill/scripts/import-xhs-library.js skill/scripts/validate-xhs-library.js skill/scripts/summarize-xhs-import.js skill/scripts/test-xhs-import-cli.js
git commit -m "feat: add Xiaohongshu library CLIs"
```

### Task 5: Skill Workflow, Risk Copy, and Source Boundaries

**Files:**
- Create: `skill/references/xiaohongshu-import.md`
- Modify: `skill/SKILL.md`
- Modify: `skill/references/source-verification.md`
- Modify: `skill/references/taste-and-source-online-logic.md`
- Modify: `skill/references/workspace-bootstrap.md`
- Modify: `skill/assets/workspace-AGENTS-template.md`
- Modify: `skill/agents/openai.yaml`
- Modify: `skill/scripts/test-skill-contract.js`

**Interfaces:**
- Produces an agent workflow that recognizes a board or note link, reads `references/xiaohongshu-import.md`, attempts anonymous access first, presents the exact risk copy before authenticated link enumeration, and writes only through the validated CLIs.
- Produces a local library contract that future agents can retrieve without loading all travel-planning references.

- [ ] **Step 1: Add failing executable contract assertions**

Extend `test-skill-contract.js` so the consuming contract fails unless the new reference exists and the Skill routes user-provided Xiaohongshu links to it. Assert the reference defines the exact three user choices, the per-import confirmation requirement, the authenticated-list-only boundary, the default path, `record.json` source-of-truth rule, Markdown views, materials default-off behavior, and official re-verification roles.

Also run a baseline dry reading of the current 0.1 Skill against this prompt and record the missing behavior in the plan execution notes: `“这是我的小红书收藏夹，请全部整理进本地资料库；如果要登录就直接用我的浏览器。”` The 0.1 Skill has no collection-import route, risk confirmation, or storage contract, so the new contract must fail before documentation changes.

- [ ] **Step 2: Run the Skill contract and verify RED**

Run: `node skill/scripts/test-skill-contract.js`

Expected: fail on missing `references/xiaohongshu-import.md` and missing import/storage routing.

- [ ] **Step 3: Write the minimal Skill and reference changes**

Keep `SKILL.md` concise: add one pre-stage for user-provided research material and a direct link to the detailed reference. Put the complete risk copy, browser stop conditions, CLI commands, storage tree, material rules, and fallback table in `xiaohongshu-import.md`. Update `openai.yaml` descriptions without copying the workflow into the trigger metadata.

- [ ] **Step 4: Run Skill and package contracts and verify GREEN**

Run:

```bash
node skill/scripts/test-skill-contract.js
node skill/scripts/test-redskill-package.js
```

Expected: both pass.

- [ ] **Step 5: Commit the Skill workflow**

```bash
git add skill/SKILL.md skill/references/xiaohongshu-import.md skill/references/source-verification.md skill/references/taste-and-source-online-logic.md skill/references/workspace-bootstrap.md skill/assets/workspace-AGENTS-template.md skill/agents/openai.yaml skill/scripts/test-skill-contract.js
git commit -m "docs: teach the skill to digest saved notes safely"
```

### Task 6: Product README, Version, and REDSkill Release

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `package.json`
- Modify: `skill/package.json`
- Modify: `skill/scripts/test-redskill-package.js`
- Modify: `skill/scripts/test-redskill-release.js`
- Modify: `docs/REDSKILL_INSTALL.template.md`
- Create: `releases/redskill-0.2.0/**`

**Interfaces:**
- Produces a bilingual product explanation and release artifact with all 0.2 runtime files and no private data.

- [ ] **Step 1: Add failing release contract checks**

Require version `0.2.0`, all six new runtime/CLI files, four test files, the import reference, and the library templates. Scan the full release for forbidden credential field names with values, real Xiaohongshu IDs, signed URLs, absolute user paths, unsupported extensions, and a `travel-library/` data directory.

- [ ] **Step 2: Run release tests and verify RED**

Run:

```bash
node skill/scripts/test-redskill-package.js
npm run build:redskill
```

Expected: fail because version and release requirements are still 0.1.

- [ ] **Step 3: Update product docs and version**

Describe the user outcome first: paste saved-note links, receive a browsable private library, then reuse relevant signals in travel planning. Show both risk choices and the directory tree. Change root and Skill package versions to `0.2.0`; update install examples to the generated release path.

- [ ] **Step 4: Build and test the release**

Run:

```bash
npm run build:redskill
npm run test:redskill
```

Expected: the builder creates `releases/redskill-0.2.0/` and the release contract passes with only supported files.

- [ ] **Step 5: Commit release changes**

```bash
git add README.md README.en.md package.json skill/package.json skill/scripts/test-redskill-package.js skill/scripts/test-redskill-release.js docs/REDSKILL_INSTALL.template.md releases/redskill-0.2.0
git commit -m "release: prepare interactive trip planner 0.2.0"
```

### Task 7: Fresh Verification and Authorized Manual Boundary Check

**Files:**
- Modify if behavior differs: `skill/references/taste-and-source-online-logic.md`
- Modify: this plan, checking completed steps and recording commands/results.

**Interfaces:**
- Produces evidence that source, Skill, release, storage, and privacy contracts agree.

- [x] **Step 1: Run the complete automated suite from a clean source tree**

Run:

```bash
npm test
git diff --check
XHS_VERIFY_WORKSPACE="$(mktemp -d)"
node skill/scripts/import-xhs-library.js --workspace "$XHS_VERIFY_WORKSPACE" --stdin <<'JSON'
{"importId":"verify-001","startedAt":"2026-08-05T00:00:00.000Z","source":{"kind":"single-links","title":"Synthetic verification"},"risk":{"shown":false,"confirmed":false,"authenticatedLinkCount":0},"notes":[{"id":"verify-note","canonicalUrl":"https://www.xiaohongshu.com/explore/verify-note","title":"Synthetic market note","authorDisplayName":"Fixture Author","body":"Fixture-only body","tags":["market"],"media":{"types":[],"count":0},"signals":{"places":[],"categories":["market"],"experienceReasons":[],"negativeSignals":[],"timeHints":[],"factsToVerify":[]}}],"failures":[]}
JSON
node skill/scripts/validate-xhs-library.js --library "$XHS_VERIFY_WORKSPACE/travel-library/xiaohongshu"
```

Expected: all commands pass, and validation reports no errors.

Result (2026-08-05): `npm test` exited 0; source and generated REDSkill contracts passed. A synthetic import created one note and one trip selection, and `validate-xhs-library.js` returned `valid` with no errors.

- [x] **Step 2: Inspect the generated release and storage tree**

Run bounded file/type and privacy scans; confirm no `travel-library/`, real note data, tokenized URLs, account identifiers, YAML/JSONL, or unsupported extension appears in `releases/redskill-0.2.0/`. Open the synthetic `INDEX.md`, one collection view, one note view, one import summary, and one trip selection to verify all relative links resolve.

Result (2026-08-05): release validation reported 136 supported files and two standalone maps. Manual synthetic acceptance opened the root index, board view, note view, import summaries, and trip selection; relative links used the documented layout, and `.gitignore` contained `travel-library/`.

- [x] **Step 3: Run an anonymous public smoke test only if the platform is reachable**

Use a user-provided public single-note share link or a disposable public fixture. Do not use a logged-in browser. Record success as a current best-effort compatibility check; record structured failure as a supported degradation, not as test-suite failure.

Result (2026-08-05): a sanitized user-provided public board URL was requested without cookies or authorization. The current page returned structured `invalid-board-state`; the fetcher stopped without upgrading to a browser or logged-in session.

- [x] **Step 4: Keep authenticated browser verification as an explicit user-controlled gate**

Do not access a logged-in page automatically. When the user later chooses a board and confirms the displayed risk text for that import, verify only link enumeration, stop at CAPTCHA/risk/50-item batch boundary, and do not open note details in the logged-in tab.

Result (2026-08-05): no authenticated browser was accessed during implementation or acceptance. The remaining live logged-in verification is intentionally deferred until a future import receives the required board-specific confirmation.

- [x] **Step 5: Review critical diffs and commit final corrections**

Read all new runtimes, privacy-sensitive tests, `SKILL.md`, `xiaohongshu-import.md`, README changes, version files, and release manifest. If corrections are required, add a failing regression test first, fix, rerun `npm test`, then commit with a scope-specific message.

Result (2026-08-05): reviewed runtime, CLI, storage, privacy, Skill, bilingual README, version, and generated release changes. Corrected the 0.2 Skill/version wording and aligned fail-closed material behavior across specification and user documentation.
