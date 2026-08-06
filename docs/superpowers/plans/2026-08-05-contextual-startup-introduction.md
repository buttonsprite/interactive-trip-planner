# Contextual Startup Introduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Skill's first substantive reply answer the user's existing request first, then introduce relevant capabilities in a short list and ask only for missing route-shaping information, including a clear invitation to paste Xiaohongshu board or note links.

**Architecture:** Keep onboarding as a Skill behavior contract rather than adding a runtime. `SKILL.md` owns first-reply rules and approved copy; `agents/openai.yaml` exposes the capability in the launch prompt; the online-logic document records current behavior, and the existing contract test prevents source and REDSkill regressions.

**Tech Stack:** Markdown Skill instructions, YAML UI metadata, Node.js contract tests, existing REDSkill builder.

## Global Constraints

- Answer or interpret information the user already provided before introducing the Skill.
- Introduce 2–4 context-relevant capabilities as a Markdown list, not a full feature inventory.
- Say the user can paste a Xiaohongshu board link or single-note link here and the Skill will use it to organize places and routes; do not use “消化”.
- Ask only 1–3 groups of missing information that would change the route skeleton; do not repeat supplied facts.
- Do not repeat onboarding during POI, itinerary, map, or design edits in an existing trip.
- A pasted Xiaohongshu link enters the existing import flow directly. Signed-in risk copy remains deferred until anonymous board access is incomplete and the user chooses signed-in link enumeration.
- Keep package version `0.2.0`; do not change route, map, source, import, or private-library behavior.

---

### Task 1: Lock the contextual first-reply contract

**Files:**
- Modify: `skill/scripts/test-skill-contract.js`
- Modify: `skill/SKILL.md:1-38`

**Interfaces:**
- Consumes: `docs/superpowers/specs/20260805-contextual-startup-introduction-design.md`.
- Produces: tested Skill instructions for ordering, list limits, paste-link wording, missing-information limits, and repeat suppression.

- [x] **Step 1: Write failing Skill contract assertions**

Add these assertions near the existing top-level Skill behavior assertions:

```js
assert.match(skill, /先回应用户已经提供的内容/);
assert.match(skill, /能力.*list.*2[–-]4 项/i);
assert.match(skill, /小红书收藏夹链接.*单篇笔记链接.*粘贴到这里/);
assert.match(skill, /只询问.*1[–-]3 组.*改变路线骨架/);
assert.match(skill, /局部修改.*不重复.*启动介绍/);
assert.doesNotMatch(skill, /消化/);
```

- [x] **Step 2: Run the focused test and verify RED**

Run `node skill/scripts/test-skill-contract.js`.

Expected: FAIL on `先回应用户已经提供的内容`; the current startup block uses a fixed process paragraph and still contains “消化”.

- [x] **Step 3: Implement the minimal Skill behavior**

Change the Skill description to “根据小红书收藏夹或单篇笔记整理地点与路线”. Replace `## 开始时向用户说明` with `## 情境化启动介绍` and these rules:

```markdown
一次完整规划的首次实质回复中，先回应用户已经提供的内容：复述已知目的地、日期、玩法或资料，并给出一项有用的初步判断。不要先播放固定欢迎语，也不要重复询问已经提供的信息。

回应之后，用 Markdown list 介绍 2–4 项与当前请求直接相关的能力。用户尚未提供资料时，可以包含：

- 你可以把小红书收藏夹链接或单篇笔记链接粘贴到这里，我会根据里面的内容整理地点和路线。
- 我会结合目的地当地语言和可靠来源，补充并复核适合你的地点。
- 我会按街区、营业时间、交通、体力和安全安排每日动线。
- 我可以生成一张能继续加入、移除、排序和重新安排的交互地图。

能力 list 后，只询问当前缺少的 1–3 组、并且会改变路线骨架的信息。用户只说“帮我规划旅行”时，优先询问目的地与日期或季节天数、进入离开方式、同行人与体力、喜欢或不喜欢、已定住宿与必去/不去；明确告诉用户不需要一次填完整。

用户直接粘贴小红书、旧攻略或地图时，先根据资料整理地点与路线，再询问与本次旅行关联所需的最少信息。已有旅行中的 POI、顺序、地图或设计局部修改不重复展示启动介绍。
```

Keep the existing signed-in risk gate, replacing only its remaining “消化” wording.

- [x] **Step 4: Verify GREEN and commit**

Run `node skill/scripts/test-skill-contract.js`.

Expected: `interactive-trip-planner contract tests passed`.

```bash
git add skill/SKILL.md skill/scripts/test-skill-contract.js
git commit -m "feat: add contextual startup introduction"
```

### Task 2: Align launch metadata, online logic, and REDSkill

**Files:**
- Modify: `skill/agents/openai.yaml`
- Modify: `skill/references/taste-and-source-online-logic.md`
- Modify: `skill/scripts/test-skill-contract.js`
- Generate: `releases/redskill-0.2.0/`

**Interfaces:**
- Consumes: Task 1 behavior.
- Produces: launch copy without “消化”, current online behavior documentation, and a regenerated REDSkill containing the updated Skill.

- [x] **Step 1: Add failing metadata and online-logic assertions**

```js
const openaiYaml = read("agents/openai.yaml");

assert.doesNotMatch(openaiYaml, /消化/);
assert.match(openaiYaml, /default_prompt:.*小红书收藏夹链接.*单篇笔记链接/);
assert.match(openaiYaml, /default_prompt:.*只追问.*影响行程/);
assert.match(tasteSourceOnlineLogic, /情境化启动介绍/);
assert.match(tasteSourceOnlineLogic, /先回应.*2[–-]4 项.*1[–-]3 组/);
```

- [x] **Step 2: Run the focused test and verify RED**

Run `node skill/scripts/test-skill-contract.js`.

Expected: FAIL because the launch prompt still says “消化” and online logic has no contextual-startup section.

- [x] **Step 3: Update launch copy and current online logic**

Set the metadata to:

```yaml
interface:
  display_name: "Interactive Trip Planner"
  short_description: "根据收藏资料、生活品味与地区来源规划可调整的旅行地图"
  default_prompt: "请用 $interactive-trip-planner 帮我规划旅行。我可以把目的地、日期、偏好，以及小红书收藏夹链接或单篇笔记链接粘贴到这里；请先回应我已经提供的内容，根据资料整理地点和路线，并只追问真正影响行程的信息。"
policy:
  allow_implicit_invocation: true
```

Add `### 情境化启动介绍` under `## 当前已实现（0.2.0）`. Record: answer existing information first; list 2–4 relevant capabilities; ask only 1–3 missing route-shaping groups; direct pasted links into import; do not repeat onboarding for local edits; keep the signed-in risk gate deferred.

- [x] **Step 4: Verify source and generated release**

```bash
node skill/scripts/test-skill-contract.js
npm run build:redskill
npm run test:redskill
```

Expected: source contract passes and REDSkill reports only supported files. `agents/openai.yaml` remains excluded from REDSkill by design.

- [x] **Step 5: Commit**

```bash
git add skill/agents/openai.yaml skill/references/taste-and-source-online-logic.md skill/scripts/test-skill-contract.js releases/redskill-0.2.0
git commit -m "docs: align startup metadata and online logic"
```

### Task 3: Fresh verification and review

**Files:**
- Modify only if verification finds a defect: Task 1–2 files.
- Modify: this plan to record actual results.

**Interfaces:**
- Consumes: updated source, metadata, contract, online logic, and release.
- Produces: fresh evidence that startup behavior and existing package/privacy contracts agree.

- [x] **Step 1: Run the complete suite**

```bash
npm test
git diff --check
```

Expected: all Skill, map, import, source, theme, and REDSkill tests pass with no whitespace errors.

- [x] **Step 2: Inspect critical user-facing copy**

```bash
rg -n "情境化启动介绍|小红书收藏夹链接|单篇笔记链接|1[–-]3 组|2[–-]4 项|消化" skill/SKILL.md skill/agents/openai.yaml skill/references/taste-and-source-online-logic.md releases/redskill-0.2.0/interactive-trip-planner/SKILL.md
```

Expected: source and release contain the approved list and limits; user-facing files contain no “消化”; REDSkill matches the source Skill.

- [x] **Step 3: Review scope**

Run `git status --short` and `git log -4 --oneline`.

Expected: only pre-existing untracked `.superpowers/` and `package-lock.json` remain; no unrelated file is staged or modified.

- [x] **Step 4: Record results and commit the plan**

Mark completed steps, append actual command results, then:

```bash
git add docs/superpowers/plans/2026-08-05-contextual-startup-introduction.md
git commit -m "docs: record contextual startup verification"
```

#### Actual verification results (2026-08-05)

- `npm test` exited 0. It rebuilt the Europe public sample (379 places, 18 days, 3 events), passed all listed Skill/map/import/source/theme contracts, rebuilt REDSkill 0.2.0, and passed the release contract (136 supported files, 2 standalone maps).
- `git diff --check` exited 0 with no output.
- The required `rg -n` inspection found the contextual-startup heading, Xiaohongshu board/single-note link copy, and the 2–4 capability / 1–3 route-shaping-group limits in source and generated `SKILL.md`. A follow-up `rg -n "消化"` across all listed user-facing source and generated published files returned no matches.
- `git status --short` reported only pre-existing untracked `.superpowers/` and `package-lock.json`; `git log -6 --oneline` showed the Task 1–2 implementation commits through `3ec32ad` and no unexpected tracked modifications.
