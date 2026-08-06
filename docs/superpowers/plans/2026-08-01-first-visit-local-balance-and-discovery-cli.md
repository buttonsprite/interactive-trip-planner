# First-Visit Balance and Discovery CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 0.1.0 在首次或普通游客语境中同时保留代表性景点与同方向当地生活，并为 Hybrid Taste 推荐、当地语言查询和来源访问探测提供可直接调用的安全 CLI。

**Architecture:** 保留现有 taste/source pure runtime，把游客平衡写成可执行 Skill 合同；在 Global Base 上增加受 validator 管理的语言 lexicon 与多语言 query variants；CLI 只做 JSON I/O 和错误边界，来源 probe 独立于 query runtime。所有新增脚本进入 REDSkill release，地图 Core 不变。

**Tech Stack:** Node.js 18+ ESM、内置 `assert`/`http`/`child_process`/`fs`、JSON/Markdown、现有 REDSkill builder 与 validators。

## Global Constraints

- 保持 package 与 REDSkill 版本为 `0.1.0`，因为当前 feature branch 尚未发布。
- Spain 只使用 Global Base 与内置 `es`/`ca` query lexicon，不新增 Spain/Iberia Regional Source Pack。
- Europe direct-copy map Core、状态、交互与两个 official taste model 的 owner/样本不变。
- 所有 CLI stdout 只输出 JSON；诊断写 stderr；不得输出 secret、cookie、authorization header 或响应正文。
- 来源 probe 仅接受 `http`/`https`，拒绝内嵌用户名密码，并从输出 URL 移除 query/fragment。
- 所有生产改动先写 RED，完成后 fresh 运行完整 `npm test`、Skill quick validation 与隔离 REDSkill release test。

---

## File Map

- `skill/SKILL.md`：面向 agent 的游客语境、代表性景点与当地生活组合规则，以及两个 discovery CLI 入口。
- `skill/references/planning-workflow.md`：阶段一游客语境与阶段三正式路线平衡合同。
- `skill/references/source-verification.md`：Global Base 当地语言词与来源探测的搜索边界。
- `skill/references/regional-source-packs.md`：多当地语言 query variants、缺词状态和 probe fallback。
- `skill/references/taste-and-source-online-logic.md`：记录当前实现的数据流、失败路径和隐私边界。
- `skill/assets/source-packs/global-base.json`：把自然语言占位符改为稳定 `{local:<token>}`。
- `skill/assets/source-packs/local-language-lexicons/es.json`：Spanish 的 10 类意图查询词。
- `skill/assets/source-packs/local-language-lexicons/ca.json`：Catalan 的 10 类意图查询词。
- `skill/scripts/source-pack-runtime.js`：lexicon 加载、token 解析、多语言 query variants 和缺词状态。
- `skill/scripts/validate-source-packs.js`：lexicon schema、token 完整性与隐私校验。
- `skill/scripts/taste-model-runtime.js`：公开合法输入词与 `unknownTerms`，不改变排序权责。
- `skill/scripts/recommend-taste-models.js`：taste 推荐 JSON CLI。
- `skill/scripts/build-source-query-matrix.js`：source/query matrix JSON CLI。
- `skill/scripts/probe-source-access.js`：有界网络能力探测。
- `skill/scripts/test-first-visit-balance.js`：规划文档合同测试。
- `skill/scripts/test-discovery-cli.js`：两个 JSON CLI 的黑盒测试。
- `skill/scripts/test-source-access-probe.js`：本地 HTTP server 黑盒测试。
- `skill/scripts/test-regional-source-packs.js`、`test-hybrid-taste-models.js`：runtime 回归。
- `skill/scripts/test-redskill-package.js`、`test-redskill-release.js`、`test-skill-contract.js`、`package.json`：发布副本和总测试入口。

---

### Task 1: Tourist Anchor and Local-Life Planning Contract

**Files:**
- Create: `skill/scripts/test-first-visit-balance.js`
- Modify: `skill/SKILL.md`
- Modify: `skill/references/planning-workflow.md`
- Modify: `skill/references/source-verification.md`
- Modify: `skill/references/taste-and-source-online-logic.md`
- Modify: `skill/scripts/test-skill-contract.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: current six-stage planning workflow and 1–3 anchor rule.
- Produces: documented visitor modes `first-visit|return-visit|landmark-light|local-only|balanced-visitor` and a tested planning contract.

- [ ] **Step 1: Write the failing contract test**

Create `test-first-visit-balance.js` that reads the four documentation files and asserts:

```js
for (const mode of ["first-visit", "return-visit", "landmark-light", "local-only", "balanced-visitor"]) {
  assert.match(planningWorkflow, new RegExp(mode));
}
assert.match(skill, /代表性景点/);
assert.match(planningWorkflow, /至少评估 3 个/);
assert.match(planningWorkflow, /2[–-]4 个代表性主锚点/);
assert.match(planningWorkflow, /重型景点[^\n]*每天最多 1 个/);
assert.match(planningWorkflow, /同方向[^\n]*(市场|居民广场|社区)/);
assert.match(sourceVerification, /著名景点[^\n]*不能[^\n]*游客多/);
assert.match(onlineLogic, /visitor mode/);
console.log("First-visit tourist/local balance contract passed");
```

- [ ] **Step 2: Run RED**

Run: `node skill/scripts/test-first-visit-balance.js`

Expected: exit 1 because current docs do not define visitor modes or the balance contract.

- [ ] **Step 3: Implement the documented behavior**

Update stage one to infer only `balanced-visitor` when visit history is unknown. Update stages two/three so a city with at least two full days evaluates three representative sights, normally includes 2–4 across the stay, caps heavyweight anchors at one per day, and connects each to a same-direction local-life role. Explicit `return-visit`, `landmark-light`, `local-only`, booking failure, or excessive detour may override with a written reason.

- [ ] **Step 4: Wire and run GREEN**

Append `node skill/scripts/test-first-visit-balance.js` to `test:skill` before taste/source runtime tests, and import the same contract from `test-skill-contract.js` via direct text assertions.

Run: `node skill/scripts/test-first-visit-balance.js && node skill/scripts/test-skill-contract.js`

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json skill/SKILL.md skill/references/planning-workflow.md skill/references/source-verification.md skill/references/taste-and-source-online-logic.md skill/scripts/test-first-visit-balance.js skill/scripts/test-skill-contract.js
git commit -m "feat: balance visitor anchors with local life"
```

---

### Task 2: Resolve Global Local-Language Queries

**Files:**
- Create: `skill/assets/source-packs/local-language-lexicons/es.json`
- Create: `skill/assets/source-packs/local-language-lexicons/ca.json`
- Modify: `skill/assets/source-packs/global-base.json`
- Modify: `skill/scripts/source-pack-runtime.js`
- Modify: `skill/scripts/validate-source-packs.js`
- Modify: `skill/scripts/test-regional-source-packs.js`
- Modify: `skill/references/regional-source-packs.md`
- Modify: `skill/references/taste-and-source-online-logic.md`

**Interfaces:**
- Consumes: `buildQueryMatrix(context, {skillRoot})` and existing `{destination}`, `{yearMonth}`, `{tasteTerms}` interpolation.
- Produces: `loadLocalLexicon(tag, {skillRoot})`, query `local` variants, `status: ready|needs-local-language-terms`, and `missingLocalTerms`.

- [ ] **Step 1: Add failing ES/CA and missing-term tests**

Extend `test-regional-source-packs.js` with:

```js
const spain = runtime.buildQueryMatrix({
  countryCode: "ES",
  destination: "Barcelona",
  yearMonth: "octubre 2026",
  localLanguageTags: ["es", "ca"],
  tasteTerms: ["vida de barrio", "mercado municipal"],
}, { skillRoot });
assert.deepEqual(spain.packIds, ["global-base"]);
assert.equal(spain.status, "ready");
for (const intent of spain.intents) {
  assert.deepEqual(intent.queries.local.map((item) => item.languageTag), ["es", "ca"]);
  assert.doesNotMatch(JSON.stringify(intent.queries.local), /当地语言|\{local:/);
}

const unsupported = runtime.buildQueryMatrix({
  countryCode: "BR",
  destination: "Recife",
  localLanguageTags: ["pt-BR"],
}, { skillRoot });
assert.equal(unsupported.status, "needs-local-language-terms");
assert.ok(unsupported.missingLocalTerms.length > 0);
assert.deepEqual(unsupported.intents[0].queries.local, []);
```

Also assert JP keeps `queries.local` usable without lexicon injection.

- [ ] **Step 2: Run RED**

Run: `node skill/scripts/test-regional-source-packs.js`

Expected: exit 1 because current local query is a string with unresolved placeholders.

- [ ] **Step 3: Add stable tokens and lexicons**

Replace Global Base placeholders with tokens such as:

```json
"local": "{destination} {yearMonth} {local:events-calendar} official"
```

Each lexicon file uses this exact structure:

```json
{
  "schemaVersion": "0.1.0",
  "languageTag": "es",
  "countryCodes": ["ES"],
  "terms": {
    "events-calendar": "agenda cultural",
    "local-dishes": "platos locales",
    "seasonal-produce": "productos de temporada",
    "municipal-market": "mercado municipal",
    "neighborhood-life": "vida de barrio",
    "live-music": "música en directo",
    "local-crafts": "artesanía local",
    "rainy-day": "planes para días de lluvia",
    "current-notices": "avisos actuales",
    "independent-neighborhood": "comercio independiente de barrio"
  }
}
```

The Catalan file supplies the same keys with `agenda cultural`, `plats locals`, `productes de temporada`, `mercat municipal`, `vida de barri`, `música en directe`, `artesania local`, `plans per dies de pluja`, `avisos actuals`, and `comerç independent de barri`.

- [ ] **Step 4: Implement runtime and validator**

Add token extraction with `/\{local:([a-z0-9-]+)\}/g`. For Global Base, resolve requested tags from built-in lexicons, merge optional `context.localLanguageTerms`, and omit incomplete variants. Return `missingLocalTerms` as `{languageTag, intentId, tokens}` entries. For a regional pack whose template has no `{local:*}` token, wrap the existing rendered string as `[{languageTag: active.languageStrategy.localLanguageTags[0], query}]`.

Validator requirements:

```js
assert.equal(lexicon.schemaVersion, "0.1.0");
assert.match(lexicon.languageTag, /^[a-z]{2}(?:-[A-Z]{2})?$/);
assert.deepEqual(new Set(Object.keys(lexicon.terms)), requiredGlobalLocalTokens);
assert.doesNotMatch(JSON.stringify(lexicon), /https?:|<script|\/Users\//i);
```

- [ ] **Step 5: Run GREEN and regression**

Run: `node skill/scripts/test-regional-source-packs.js && node skill/scripts/validate-source-packs.js && node skill/scripts/test-contribution-extensibility.js`

Expected: all exit 0; validator still reports 4 Regional Source Packs.

- [ ] **Step 6: Commit**

```bash
git add skill/assets/source-packs skill/scripts/source-pack-runtime.js skill/scripts/validate-source-packs.js skill/scripts/test-regional-source-packs.js skill/references/regional-source-packs.md skill/references/taste-and-source-online-logic.md
git commit -m "feat: resolve global local-language queries"
```

---

### Task 3: Agent-facing Taste and Query CLIs

**Files:**
- Create: `skill/scripts/cli-json-input.js`
- Create: `skill/scripts/recommend-taste-models.js`
- Create: `skill/scripts/build-source-query-matrix.js`
- Create: `skill/scripts/test-discovery-cli.js`
- Modify: `skill/scripts/taste-model-runtime.js`
- Modify: `skill/scripts/test-hybrid-taste-models.js`
- Modify: `skill/SKILL.md`
- Modify: `skill/references/hybrid-taste-models.md`
- Modify: `skill/references/regional-source-packs.md`
- Modify: `skill/references/taste-and-source-online-logic.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: `recommendTasteModels(context)` and Task 2 `buildQueryMatrix(context)`.
- Produces: `getTasteInputVocabulary()`, `readJsonContext(argv, stdin)`, and two executable JSON CLIs.

- [ ] **Step 1: Write failing black-box tests**

`test-discovery-cli.js` creates a temporary context JSON, then uses `spawnSync` to assert:

```js
const taste = run("recommend-taste-models.js", ["--context", contextPath]);
assert.equal(taste.status, 0);
assert.equal(JSON.parse(taste.stdout).recommendations[0].id, "city-craft-rhythm");
assert.equal(taste.stderr, "");

const unknown = run("recommend-taste-models.js", ["--stdin"], JSON.stringify({ interests: ["street-life"] }));
assert.equal(unknown.status, 0);
assert.deepEqual(JSON.parse(unknown.stdout).unknownTerms.interests, ["street-life"]);

const queries = run("build-source-query-matrix.js", ["--context", spainPath]);
assert.equal(JSON.parse(queries.stdout).status, "ready");
assert.doesNotMatch(queries.stdout, /当地语言|\{local:/);

assert.equal(run("recommend-taste-models.js", ["--help"]).status, 0);
assert.notEqual(run("recommend-taste-models.js", ["--context", missingPath]).status, 0);
```

- [ ] **Step 2: Run RED**

Run: `node skill/scripts/test-discovery-cli.js`

Expected: exit 1 because the CLI files do not exist.

- [ ] **Step 3: Add vocabulary-aware runtime output**

`getTasteInputVocabulary()` returns unique values grouped by `destinationContexts`, `playStyles`, `paces`, `companions`, and `interests`. `recommendTasteModels` compares supplied terms to this vocabulary and returns:

```js
{
  mode: "recommended",
  destination: context.destination || null,
  recommendations,
  unknownTerms,
  inputVocabulary
}
```

Unknown terms never contribute to score; known terms continue to use the existing ranking.

- [ ] **Step 4: Implement shared JSON input and thin CLIs**

`cli-json-input.js` accepts exactly one of `--context <file>` or `--stdin`; `--help` returns usage. It rejects invalid JSON, directories, both input modes, and missing input with a concise stderr message and exit 2. CLI implementations call the pure runtime and print `JSON.stringify(result, null, 2) + "\n"`.

- [ ] **Step 5: Run GREEN and runtime regressions**

Run: `node skill/scripts/test-discovery-cli.js && node skill/scripts/test-hybrid-taste-models.js && node skill/scripts/test-regional-source-packs.js`

Expected: all exit 0.

- [ ] **Step 6: Wire package and docs, then commit**

Append `node skill/scripts/test-discovery-cli.js` to `test:skill`. Document both commands in `SKILL.md` and current online logic.

```bash
git add package.json skill/SKILL.md skill/references/hybrid-taste-models.md skill/references/regional-source-packs.md skill/references/taste-and-source-online-logic.md skill/scripts/cli-json-input.js skill/scripts/recommend-taste-models.js skill/scripts/build-source-query-matrix.js skill/scripts/test-discovery-cli.js skill/scripts/taste-model-runtime.js skill/scripts/test-hybrid-taste-models.js
git commit -m "feat: add discovery json cli"
```

---

### Task 4: Safe Source Access Probe

**Files:**
- Create: `skill/scripts/probe-source-access.js`
- Create: `skill/scripts/test-source-access-probe.js`
- Modify: `skill/SKILL.md`
- Modify: `skill/references/source-verification.md`
- Modify: `skill/references/regional-source-packs.md`
- Modify: `skill/references/taste-and-source-online-logic.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: JSON `{sources:[{id,url,fallback?}], timeoutMs?, concurrency?}` from file/stdin.
- Produces: `probeSources(input, {fetchImpl, now})` and CLI result `{checkedAt, results:[...]}`.

- [ ] **Step 1: Write failing local-server tests**

Create a Node `http.createServer` with routes `/ok`, `/redirect`, `/not-found`, `/blocked`, `/limited`, `/error`, `/head-unsupported`, `/slow`, and `/body-secret`. Assert classifications:

```js
assert.equal(byId.ok.status, "reachable");
assert.equal(byId.redirect.status, "redirected");
assert.equal(byId.missing.status, "not-found");
assert.equal(byId.blocked.status, "access-blocked");
assert.equal(byId.limited.status, "rate-limited");
assert.equal(byId.error.status, "server-error");
assert.equal(byId.slow.status, "network-error");
assert.equal(byId.headUnsupported.method, "GET");
assert.doesNotMatch(JSON.stringify(result), /body-secret-value|token=|Authorization/i);
```

Also assert `ftp:`, `https://user:pass@example.com`, malformed URLs, and concurrency above 4 are rejected or capped.

- [ ] **Step 2: Run RED**

Run: `node skill/scripts/test-source-access-probe.js`

Expected: exit 1 because the probe does not exist.

- [ ] **Step 3: Implement bounded probe**

Use global Node 18 `fetch` with `AbortSignal.timeout(timeoutMs)`. Sanitize output URL with:

```js
const parsed = new URL(rawUrl);
if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('unsafe source URL');
parsed.search = '';
parsed.hash = '';
```

Try `HEAD` with `redirect: "manual"`; for 405/501 retry `GET` with `Range: bytes=0-1023` and cancel the body without reading it. Map 2xx, 3xx, 403, 404, 429, 5xx and abort/network errors to the contract statuses. Never include headers or body in the result.

- [ ] **Step 4: Run GREEN**

Run: `node skill/scripts/test-source-access-probe.js`

Expected: exit 0 and local server closes in `finally`.

- [ ] **Step 5: Wire docs and commit**

Append the test to `test:skill`; document that probe results describe access only and cannot prove a venue exists, is open, or is safe.

```bash
git add package.json skill/SKILL.md skill/references/source-verification.md skill/references/regional-source-packs.md skill/references/taste-and-source-online-logic.md skill/scripts/probe-source-access.js skill/scripts/test-source-access-probe.js
git commit -m "feat: add bounded source access probe"
```

---

### Task 5: REDSkill Packaging and Final Verification

**Files:**
- Modify: `skill/scripts/test-redskill-package.js`
- Modify: `skill/scripts/test-redskill-release.js`
- Modify: `skill/scripts/test-skill-contract.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–4 scripts/assets/docs.
- Produces: a REDSkill 0.1.0 package whose copied CLIs and lexicons pass the same contracts as the source tree.

- [ ] **Step 1: Add release-copy assertions**

Require the new scripts and lexicons in `test-redskill-package.js`, and add these files to `test-redskill-release.js` execution list:

```js
"test-first-visit-balance.js",
"test-discovery-cli.js",
"test-source-access-probe.js",
```

- [ ] **Step 2: Run package RED if release omissions exist**

Run: `node skill/scripts/test-redskill-package.js`

Expected before builder/documentation wiring: exit 1 if any new asset or documented script is missing from the package contract.

- [ ] **Step 3: Update README and current online logic**

Document the three CLI commands, JSON input modes, Global Base local-language failure state, visitor balance rule, access-only probe boundary, and the fact that Spain still has no Regional Source Pack.

- [ ] **Step 4: Run focused GREEN**

Run:

```bash
node skill/scripts/test-first-visit-balance.js
node skill/scripts/test-hybrid-taste-models.js
node skill/scripts/test-regional-source-packs.js
node skill/scripts/test-discovery-cli.js
node skill/scripts/test-source-access-probe.js
node skill/scripts/test-redskill-package.js
node skill/scripts/test-skill-contract.js
```

Expected: all exit 0.

- [ ] **Step 5: Run fresh full verification**

Run: `npm test`

Expected: exit 0; all existing map/Core tests, new discovery tests, REDSkill build and REDSkill release tests pass.

Run:

```bash
PYTHONPATH=/tmp/interactive-trip-planner-quick-validate-deps \
python3 /Users/cyx/.codex/skills/.system/skill-creator/scripts/quick_validate.py skill
```

Expected: `Skill is valid!`

Build outside the repository and test the copied release:

```bash
release_dir=$(mktemp -d /tmp/interactive-trip-planner-discovery-release.XXXXXX)
node skill/scripts/build-redskill-release.js "$release_dir/redskill-0.1.0" 0.1.0
node skill/scripts/test-redskill-release.js "$release_dir/redskill-0.1.0" 0.1.0
```

Expected: release contract exits 0 and reports two standalone maps.

- [ ] **Step 6: Check boundaries and commit**

Run:

```bash
git diff --name-only main...HEAD -- skill/assets/guide-template skill/assets/guide-template-europe-public
git diff --check
git status --short
```

Expected: no map template diff, no whitespace error, and only the known generated release directory is untracked; move the generated release to Trash before the final clean-tree check.

```bash
git add README.md skill/scripts/test-redskill-package.js skill/scripts/test-redskill-release.js skill/scripts/test-skill-contract.js
git commit -m "test: verify discovery runtime release"
```

Final evidence must include commit hashes, exact commands, exit codes, remaining limitations, and confirmation that main/origin/main were not changed.
