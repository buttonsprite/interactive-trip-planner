# POI Detail Depth and Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backward-compatible tiered and type-specific POI detail content to the 0.1 Skill and demonstrate it in the Spain map with Mercat de Sant Antoni.

**Architecture:** Keep `note` / `plan` / `tip` as the compact compatibility layer. Add optional `contentTier`, `whyWorthIt`, and ordered `detailSections`; validate them only when present and render them through one safe generic section renderer. The source Skill owns the contract and public template behavior, while the Spain guide supplies the first source-backed deep example.

**Tech Stack:** Markdown contract, JSON trip data, Node.js validation and contract tests, standalone Leaflet HTML/JavaScript.

## Global Constraints

- Valid tiers are exactly `deep`, `standard`, and `compact`.
- Legacy POIs without the new fields must remain valid and render unchanged.
- Section titles are type-specific; a story is optional and must not be invented.
- Do not edit generated `releases/` directly.
- Do not add private paths, credentials, bookings, or personal trip data.
- Visible behavior changes require the online logic documents and browser QA.

---

### Task 1: Contract and validator

**Files:**
- Modify: `skill/references/poi-schema.md`
- Modify: `skill/scripts/validate-trip-data.js`
- Create: `skill/scripts/test-poi-detail-content.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: POI JSON with optional `contentTier`, `whyWorthIt`, and `detailSections`.
- Produces: backward-compatible validation errors for invalid tiered content.

- [ ] **Step 1: Write the failing validator test**

Create fixtures in a temporary directory from the test itself. Assert that one valid legacy POI and valid deep/standard/compact POIs pass, while invalid tier, missing deep `whyWorthIt`, deep section count outside 2-4, standard section count above 2, compact sections, blank titles, and empty section content fail.

- [ ] **Step 2: Run the test and verify RED**

Run: `node skill/scripts/test-poi-detail-content.js`

Expected: FAIL because `validate-trip-data.js` does not reject the invalid tiered fixtures.

- [ ] **Step 3: Implement minimal validator rules and document the JSON contract**

Add validation without making the new fields mandatory for legacy data. Document tier purpose, section shape, type-specific heading guidance, token boundary, and fallback behavior.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node skill/scripts/test-poi-detail-content.js`

Expected: PASS.

### Task 2: Public template rendering

**Files:**
- Modify: `skill/assets/guide-template-europe-public/data/pois.json`
- Modify: `skill/assets/guide-template-europe-public/maps/itinerary-map.html`
- Modify: `skill/assets/guide-template-europe-public/docs/online-logic/map.md`
- Modify: `skill/scripts/build-europe-public-template.js`
- Modify: `skill/scripts/test-europe-public-template.js`

**Interfaces:**
- Consumes: valid optional detail fields from Task 1.
- Produces: escaped `whyWorthIt` and ordered type-specific detail sections with legacy fallback.

- [ ] **Step 1: Add failing template assertions**

Assert the public sample contains one `deep` POI, the builder preserves the three new fields, and the HTML contains a `renderPoiDetailSections` helper, `<ul class="poi-detail-list">`, and the `whyWorthIt || item.note` fallback.

- [ ] **Step 2: Run the focused template test and verify RED**

Run: `node skill/scripts/test-europe-public-template.js`

Expected: FAIL because the sample, builder, and renderer do not expose the contract.

- [ ] **Step 3: Implement the generic safe renderer and sample data**

Add one source-backed Mercat de Sant Antoni deep example, preserve fields in the builder, escape section content, ignore empty sections, and keep `plan`, `tip`, source, legacy copy, and Core interaction unchanged.

- [ ] **Step 4: Rebuild and run focused tests**

Run: `node skill/scripts/build-europe-public-template.js && node skill/scripts/test-europe-public-template.js && node skill/scripts/test-core-map-template.js`

Expected: PASS.

### Task 3: Spain acceptance artifact

**Files:**
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/pois.json`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/sources.json`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/maps/assets/trip-data.js`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/maps/itinerary-map.html`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/docs/sources.md`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/docs/online-logic/map.md`

**Interfaces:**
- Consumes: the renderer contract from Task 2 and official Mercat de Sant Antoni history/hours sources.
- Produces: one traveler-facing deep market detail without enriching all 62 POIs.

- [ ] **Step 1: Write a failing artifact check**

Run a bounded Node assertion that expects `bcn-sant-antoni` to be `deep`, contain 2-4 sections, distinguish Tuesday from the Sunday market, and have matching data in JSON, `trip-data.js`, and embedded `PUBLIC_TRIP_DATA`.

- [ ] **Step 2: Verify RED**

Expected: FAIL because the Spain artifact only has `note`, `plan`, and `tip`.

- [ ] **Step 3: Add source-backed content and renderer**

Add the deep fields, two structured official sources, type-specific market sections, the safe renderer, and current online logic documentation. Do not claim the Sunday market is available on Tuesday 2026-10-13.

- [ ] **Step 4: Run static validation**

Run the artifact assertion, `validate-trip-data.js --strict-routes`, `validate-design-tokens.js`, `validate-europe-derived-map.js`, and JavaScript syntax checks.

Expected: all contract assertions pass; route warnings remain the eight intentional no-geometry warnings.

### Task 4: Release and browser acceptance

**Files:**
- Generated: `releases/redskill-<version>/` via the repository build only.

**Interfaces:**
- Consumes: completed Skill source and Spain artifact.
- Produces: verified source/release contracts and visual evidence.

- [ ] **Step 1: Run complete Skill verification**

Run: `npm test`

Expected: all source, build, release, format, and privacy checks pass.

- [ ] **Step 2: Browser-test Spain desktop and mobile details**

Verify Mercat de Sant Antoni shows the concise verdict, market-specific action list, observation list, grounded history, Tuesday limitation, legacy plan/tip/source sections, and no relevant console errors at desktop and 390x844.

- [ ] **Step 3: Review scope and generated output**

Confirm only intended Skill source, generated release, and Spain guide files changed; scan for private paths, credentials, placeholders, and unsupported release formats.
