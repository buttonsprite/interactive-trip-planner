# GitHub README Product Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `interactive-trip-planner` 0.1.0 on GitHub with a product-first README, a clean Spain product screenshot, the current Hybrid Taste/source/theme implementation, and a validated REDSkill release.

**Architecture:** Keep `skill/` as the only editable Skill source and regenerate `releases/redskill-0.1.0/` from it. Treat the README as a product landing page first and an open-source handbook second; use one public Spain screenshot as proof, while keeping all runtime contracts and developer details in the lower sections. Publish the existing feature branch as a draft PR to `main` without merging it.

**Tech Stack:** Markdown, static HTML/CSS/JavaScript map, Node.js 18+, npm scripts, Git, GitHub CLI, Codex browser screenshot tooling.

## Global Constraints

- Keep the package version at `0.1.0`.
- Keep `skill/` as the only editable Skill source; never hand-edit `releases/redskill-0.1.0/`.
- The README first screen must not lead with repository layout, CLI commands, JSON contracts, or `developer-preview contract slice` language.
- The public screenshot must contain no real booking, flight, hotel, identity, account, local path, browser comment, or private itinerary data.
- The REDSkill release may contain only Markdown, HTML, CSS, JavaScript, and JSON files supported by the repository contract.
- Do not stage `.superpowers/`, `experiments/`, personal guide files, or unrelated changes from `/Users/cyx/Desktop/interactive-trip-planner`.
- Preserve the current five uncommitted Market Roof theme files; inspect and validate them before committing.
- Do not merge the PR or create a Git tag in this plan.

---

### Task 1: Create the public Spain product screenshot

**Files:**
- Create: `docs/assets/readme/spain-market-roof-map.png`
- Source only: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/maps/itinerary-map.html`

**Interfaces:**
- Consumes: the locally served Spain map at `http://127.0.0.1:8788/guides/spain-2026-taste-01/maps/itinerary-map.html`
- Produces: one repository-local PNG referenced by the README hero

- [ ] **Step 1: Verify the public map source is reachable**

Run:

```bash
curl -fsS -o /dev/null \
  http://127.0.0.1:8788/guides/spain-2026-taste-01/maps/itinerary-map.html
```

Expected: exit code `0`. If the server is unavailable, start a local static server from `/Users/cyx/Desktop/旅游攻略` on port `8788` and rerun the check.

Server command:

```bash
python3 -m http.server 8788 --directory /Users/cyx/Desktop/旅游攻略
```

- [ ] **Step 2: Capture a clean desktop screenshot**

Open this state at a `1440×900` viewport and capture the page surface only:

```text
http://127.0.0.1:8788/guides/spain-2026-taste-01/maps/itinerary-map.html#lat=41.38071&lng=2.16750&z=16&layers=flight%2Cmain%2Clocal%2Citinerary%2Chotel%2Cwine%2Csweet%2Ccoffee%2Cfood%2Cart%2ClocalLife%2Csight%2Cevent&poi=bcn-sant-antoni
```

The screenshot must show the date rail, selected itinerary place, detailed POI explanation, and map markers. Save it as `docs/assets/readme/spain-market-roof-map.png`.

- [ ] **Step 3: Inspect the screenshot visually**

Use the local image viewer and confirm:

- no browser toolbar or Codex comment markers;
- no local file paths or private data;
- text is readable at GitHub README width;
- the map, itinerary order, POI detail, and Market Roof theme are simultaneously visible.

- [ ] **Step 4: Verify file properties**

Run:

```bash
file docs/assets/readme/spain-market-roof-map.png
du -h docs/assets/readme/spain-market-roof-map.png
```

Expected: valid PNG, no larger than `2 MB`.

---

### Task 2: Rewrite the README as a product-first landing page

**Files:**
- Modify: `README.md`
- Reference: `docs/superpowers/specs/2026-08-04-github-readme-product-story-design.md`
- Reference: `skill/references/hybrid-taste-models.md`
- Reference: `skill/references/regional-source-packs.md`
- Reference: `skill/references/taste-and-source-online-logic.md`

**Interfaces:**
- Consumes: the approved product-story design and current 0.1 implementation facts
- Produces: the GitHub landing page and installation/contribution entrypoint

- [ ] **Step 1: Establish the hero and product promise**

Replace the current technical opening with this positioning:

```markdown
# Interactive Trip Planner

## 把你的生活品味带到陌生城市

它不只是生成景点清单，而是根据你想怎样旅行，结合当地语言资料、代表性景点、社区生活和现实营业信息，安排成一条舒服、可信、可以继续修改的路线。

![西班牙行程中的圣安东尼市场、每日路线和 Market Roof 交互地图](docs/assets/readme/spain-market-roof-map.png)
```

Place one natural-language invocation directly below the hero:

```text
请使用 interactive-trip-planner，帮我规划一趟既有第一次到访重点、也能体验当地生活的旅行。
```

- [ ] **Step 2: Add the product comparison and deliverables**

Add these top-level sections before any installation or repository details:

```text
它和普通 AI 攻略有什么不同
你最终会得到什么
从品味到陌生城市
当地语言和数据源
```

Use the six-row comparison from the approved design. Describe deliverables as itinerary brief, source-backed POI pool, daily anchors and nearby alternatives, event/recheck reminders, and editable interactive map.

- [ ] **Step 3: Explain Hybrid Taste and source discovery in product language**

State that a Hybrid Taste Model captures transferable selection logic rather than copying a fixed route or a person's raw purchase history. Explain the five-stage search funnel before naming the current assets.

List the exact 0.1 coverage:

- official models: `city-craft-rhythm`, `food-nightlife-locality`;
- source packs: Global Base, China Mainland, Japan, France/Belgium francophone;
- local-language lexicons: Spanish and Catalan;
- Spain currently uses Global Base plus Spanish/Catalan terms and does not yet have a dedicated Regional Source Pack.

- [ ] **Step 4: Add use, version boundary, contribution, and development sections**

Keep this lower-page order:

```text
如何开始
0.1 能做什么、还不能保证什么
贡献你的品味与地区知识
安装
开发与验证
仓库结构
```

Provide separate Codex and REDSkill installation paths. Link contributors to the taste model, source pack, theme, and sample conventions already in `skill/references/` and `skill/assets/`.

- [ ] **Step 5: Verify README product structure and relative links**

Run:

```bash
sed -n '1,80p' README.md
rg -n '^## ' README.md
if sed -n '1,45p' README.md | rg -n 'contract slice|Discovery CLI|releases/redskill|唯一源码事实层'; then
  exit 1
fi
node --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  const markdown = fs.readFileSync("README.md", "utf8");
  const refs = [...markdown.matchAll(/\[[^\]]*\]\((?!https?:|#)([^)]+)\)|!\[[^\]]*\]\((?!https?:)([^)]+)\)/g)]
    .map((match) => match[1] || match[2]);
  const missing = refs.filter((ref) => !fs.existsSync(path.resolve(ref.split("#")[0])));
  if (missing.length) throw new Error(`Missing README targets: ${missing.join(", ")}`);
  console.log(`README relative targets OK: ${refs.length}`);
'
git diff --check -- README.md
```

Expected: product promise and screenshot appear in the first 45 lines, all relative targets exist, and `git diff --check` is silent.

- [ ] **Step 6: Commit README and screenshot**

```bash
git add README.md docs/assets/readme/spain-market-roof-map.png
git commit -m "docs: make README product-first"
```

---

### Task 3: Finalize the Market Roof theme and regenerate REDSkill 0.1.0

**Files:**
- Modify: `skill/assets/themes/architectural-collage/presets/market-roof-spain.json`
- Modify: `skill/assets/themes/architectural-collage/theme.css`
- Modify: `skill/assets/themes/architectural-collage/theme.json`
- Modify: `skill/references/design-language.md`
- Modify: `skill/scripts/test-ui-theme-contract.js`
- Generate: `releases/redskill-0.1.0/`

**Interfaces:**
- Consumes: the existing uncommitted theme refinements and source-of-truth `skill/`
- Produces: the final 0.1 theme contract and platform-compatible REDSkill package

- [ ] **Step 1: Inspect the existing theme diff without rewriting it**

Run:

```bash
git diff -- \
  skill/assets/themes/architectural-collage/presets/market-roof-spain.json \
  skill/assets/themes/architectural-collage/theme.css \
  skill/assets/themes/architectural-collage/theme.json \
  skill/references/design-language.md \
  skill/scripts/test-ui-theme-contract.js
```

Confirm that the changes implement marker color sequences, irregular marker silhouettes, compact candidate rows, dotted content sequences, and the corresponding contract tests. Do not discard or restyle them.

- [ ] **Step 2: Run the focused theme contract**

```bash
node skill/scripts/test-ui-theme-contract.js
```

Expected: `UI theme contract passed: 1 theme, 1 preset`.

- [ ] **Step 3: Regenerate the REDSkill release**

```bash
npm run build:redskill
```

Expected: `releases/redskill-0.1.0/interactive-trip-planner/SKILL.md` exists and the release is rebuilt from `skill/`.

- [ ] **Step 4: Verify the platform-format boundary**

```bash
test -f releases/redskill-0.1.0/interactive-trip-planner/SKILL.md
if find releases/redskill-0.1.0/interactive-trip-planner -type f \
  \( -iname '*.yaml' -o -iname '*.yml' -o -iname '*.png' -o -iname '*.jpg' \
     -o -iname '*.jpeg' -o -iname '*.zip' -o -iname '*.pdf' \) | grep -q .; then
  exit 1
fi
node skill/scripts/test-redskill-release.js releases/redskill-0.1.0 0.1.0
```

Expected: no unsupported path is printed and the REDSkill release contract passes.

- [ ] **Step 5: Commit theme and generated release explicitly**

```bash
git add \
  skill/assets/themes/architectural-collage/presets/market-roof-spain.json \
  skill/assets/themes/architectural-collage/theme.css \
  skill/assets/themes/architectural-collage/theme.json \
  skill/references/design-language.md \
  skill/scripts/test-ui-theme-contract.js \
  releases/redskill-0.1.0
git commit -m "feat: finalize Market Roof 0.1 theme"
```

---

### Task 4: Run release verification and review the complete diff

**Files:**
- Verify: `README.md`
- Verify: `skill/`
- Verify: `releases/redskill-0.1.0/`
- Verify: `docs/assets/readme/spain-market-roof-map.png`

**Interfaces:**
- Consumes: all committed 0.1 branch changes
- Produces: fresh evidence that the branch is releasable and contains no unintended files

- [ ] **Step 1: Run the full repository test suite**

```bash
npm test
```

Expected: all Skill, theme, source-pack, CLI, event, map, REDSkill, privacy, and contract tests pass.

- [ ] **Step 2: Run privacy and path scans**

```bash
if rg -n '/Users/|/private/tmp|/var/folders|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY' \
  README.md skill releases/redskill-0.1.0 docs/assets/readme; then
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 3: Review branch scope and whitespace**

```bash
git diff --check main...HEAD
git status -sb
git diff --stat main...HEAD
git diff --name-only main...HEAD | rg '^(\.superpowers/|experiments/|guides/)' && exit 1 || true
```

Expected: no whitespace errors; the worktree is clean; no forbidden path is in the branch diff.

- [ ] **Step 4: Review the user-facing GitHub diff**

```bash
git diff main...HEAD -- README.md \
  docs/superpowers/specs/2026-08-04-github-readme-product-story-design.md \
  docs/superpowers/plans/2026-08-04-github-readme-product-story.md
```

Confirm that product claims match current tests and assets, 0.1 limitations are visible, and no internal-only statement is presented as a public guarantee.

---

### Task 5: Publish the feature branch and open a draft PR

**Files:**
- Remote branch: `feature/hybrid-taste-source-v0.1`
- Base branch: `main`
- GitHub repository: canonical `buttonsprite/interactive-trip-planner` (legacy URL `pmacyx/interactive-trip-planner` redirects here)
- Create temporarily: `/tmp/interactive-trip-planner-0.1.0-pr-body.md`

**Interfaces:**
- Consumes: a clean, verified local feature branch
- Produces: a pushed branch, draft PR, and product-oriented repository description

- [ ] **Step 1: Reconfirm GitHub authentication and repository target**

```bash
gh auth status
gh repo view pmacyx/interactive-trip-planner \
  --json nameWithOwner,defaultBranchRef,url
```

Expected: authenticated account `pmacyx`; `nameWithOwner` resolves to `buttonsprite/interactive-trip-planner`; default branch is `main`.

- [ ] **Step 2: Push the feature branch**

```bash
git push -u origin feature/hybrid-taste-source-v0.1
```

Expected: the remote branch is created or updated successfully.

- [ ] **Step 3: Create a draft PR**

Use `apply_patch` to create `/tmp/interactive-trip-planner-0.1.0-pr-body.md` with these sections:

```markdown
## What changed
- Product-first README with a real Spain map example
- Hybrid Taste Model and first-visit tourist/local balance
- Regional source packs, Spanish/Catalan query generation, and bounded source probes
- Tiered POI explanations, events, route evidence, and Market Roof theme
- REDSkill 0.1.0 platform-compatible release

## Why
Make the project understandable to travelers and curators before exposing implementation details, while publishing the complete, testable 0.1 developer preview.

## 0.1 boundary
Usable for supervised real trip planning, but not Public V1: Spain has no dedicated Regional Source Pack, mutable facts still require recheck, and global source coverage remains incomplete.

## Verification
- `npm test`
- README relative-link and privacy scans
- REDSkill format and release-contract checks
```

Create the PR:

```bash
gh pr create \
  --repo buttonsprite/interactive-trip-planner \
  --draft \
  --base main \
  --head feature/hybrid-taste-source-v0.1 \
  --title "Release interactive trip planner 0.1.0" \
  --body-file /tmp/interactive-trip-planner-0.1.0-pr-body.md
```

Expected: a draft PR URL targeting `main`.

- [ ] **Step 4: Update the repository description**

```bash
gh repo edit buttonsprite/interactive-trip-planner \
  --description "把个人品味、当地语言资料和现实约束，变成可继续修改的旅行路线与交互地图。"
```

Expected: the command succeeds and `gh repo view` returns the new description.

- [ ] **Step 5: Report the release handoff without merging**

Report the branch name, commit IDs, draft PR URL, canonical repository URL, validation results, REDSkill upload directory, and the fact that the PR remains unmerged for user review.
