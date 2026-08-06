# Local-life Content and Events V0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make market POI copy explain distinctive local food habits and add a first-class, date-bound event layer that can appear as a map event, a host-place program, or a citywide route influence.

**Architecture:** Keep stable places in `pois.json` and add a focused `events.json` contract. The public template builder converts mappable `venue` events into synthetic runtime POIs with ids `event:<event-id>` so they reuse the existing detail, marker, filter, priority, and add/remove flows; `hosted` events render inside their host POI, while `citywide` events render in the affected day context. Spain uses the same contract for Madrid event windows and upgrades Mercat de Sant Antoni copy using source-backed local pantry, resident-use, and October-season signals.

**Tech Stack:** Node.js >=18, ESM validation/test scripts, JSON source data, single-file HTML/CSS/vanilla JavaScript, Leaflet, Node `assert` and `vm`, existing REDSkill build pipeline.

## Global Constraints

- Keep legacy POIs without `contentTier`, `detailSections`, or event references valid.
- Use `venue`, `hosted`, and `citywide` as the only event scopes.
- Use `confirmed`, `announced`, `program-pending`, and `historical-lead` as the only event statuses.
- Use `anchor`, `candidate`, `nearby`, and `avoidance` as the only route impacts.
- Only `confirmed` venue events can be assigned into a day; `program-pending` must never become a fabricated itinerary stop.
- A `venue` event uses `venuePoiId` or valid `[lat, lng]` coordinates; `hosted` requires `hostPoiId`; `citywide` may omit both.
- Traveler-facing copy must not expose internal status names, schema terms, source ids, or implementation language.
- Market copy must connect distinctive local pantry, resident use, and date-specific season; generic grocery lists are insufficient.
- Seasonal products without current stall-level verification use “look for” or “ask about” language, never guaranteed-stock language.
- Source repo edits are made under `skill/`; generated `releases/redskill-0.1.0/` is rebuilt, never edited directly.
- Preserve all unrelated user and agent changes in `/Users/cyx/Desktop/旅游攻略`.

---

### Task 1: Event data contract and validator

**Files:**
- Create: `skill/references/event-schema.md`
- Create: `skill/scripts/validate-trip-events.js`
- Create: `skill/scripts/test-event-contract.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `events.json`, `pois.json`, `itinerary.json`, and `sources.json` paths.
- Produces: CLI `node skill/scripts/validate-trip-events.js --events <events.json> --pois <pois.json> --itinerary <itinerary.json> --sources <sources.json>`.
- Produces: JSON success summary `{ eventCount, scopes, statuses, warnings, errors }`; exits `1` when `errors.length > 0`.
- Produces: synthetic event id convention `event:<event.id>` for cross-checking itinerary references.

- [ ] **Step 1: Write the failing event validator contract test**

Create bounded temporary fixtures in `test-event-contract.js`. Include one valid record for each scope, all four statuses, and these invalid cases:

```js
const validVenue = {
  id: "concert",
  name: "Neighborhood concert",
  scope: "venue",
  city: "Madrid",
  status: "confirmed",
  startsAt: "2026-10-18T19:30:00+02:00",
  endsAt: "2026-10-18T21:00:00+02:00",
  venuePoiId: "venue",
  routeImpact: "candidate",
  whyWorthIt: "A date-bound local performance.",
  plan: "Use it as the evening anchor.",
  tip: "Reserve before the trip.",
  officialUrl: "https://example.org/concert",
  sourceIds: ["event-source"]
};

const validHosted = {
  ...validVenue,
  id: "market-workshop",
  scope: "hosted",
  status: "announced",
  hostPoiId: "market",
  venuePoiId: undefined,
  startsAt: "2026-10-15",
  endsAt: "2026-10-15"
};

const validCitywide = {
  ...validVenue,
  id: "parade",
  scope: "citywide",
  status: "program-pending",
  routeImpact: "avoidance",
  startsAt: "2026-10-17",
  endsAt: "2026-10-18",
  venuePoiId: undefined
};
```

Assert clear failures for unknown scope/status/routeImpact, duplicate id, missing official URL/source id, missing host, missing venue location, missing confirmed date/time, missing source record, and an itinerary reference to `event:<id>` when status is not `confirmed`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node skill/scripts/test-event-contract.js
```

Expected: FAIL because `validate-trip-events.js` does not exist.

- [ ] **Step 3: Implement the validator and reference**

Implement argument parsing, bounded JSON reads, URL validation with `new URL`, date parsing, POI/source id sets, event uniqueness, scope/status/impact rules, and itinerary cross-checking. Treat an itinerary reference as an event reference only when `poiId.startsWith("event:")`; reject it unless the event exists and is `confirmed` + `venue`.

Document the exact JSON fields, enum meanings, synthetic id rule, source priority, and examples in `event-schema.md`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node skill/scripts/test-event-contract.js
```

Expected: `Event data contract passed` and exit `0`.

- [ ] **Step 5: Add the contract test to the repository test chain**

Insert `node skill/scripts/test-event-contract.js` immediately after `test-poi-detail-content.js` in `package.json` `test:skill`.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json skill/references/event-schema.md skill/scripts/validate-trip-events.js skill/scripts/test-event-contract.js
git commit -m "feat: add trip event data contract"
```

---

### Task 2: Skill rules for local-life specificity and event promotion

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `skill/references/poi-schema.md`
- Modify: `skill/references/source-verification.md`
- Modify: `skill/references/planning-workflow.md`
- Modify: `skill/scripts/test-skill-contract.js`
- Modify: `skill/scripts/test-poi-detail-content.js`

**Interfaces:**
- Consumes: event enums and file contract from Task 1.
- Produces: generation rules that write `data/events.json` alongside POIs and sources.
- Produces: a local-life content rule requiring `local pantry -> resident use -> trip-month season` when sources support all three.

- [ ] **Step 1: Extend contract tests before documentation changes**

Add assertions to `test-skill-contract.js` for:

```js
assert.match(skill, /data\/events\.json/);
assert.match(skill, /venue[^\n]*hosted[^\n]*citywide/);
assert.match(skill, /confirmed[^\n]*program-pending/);
assert.match(skill, /当地食材结构[^\n]*居民[^\n]*季节/);
assert.match(sourceVerification, /历史届次[^\n]*不[^\n]*当前活动/);
```

Add a market deep fixture assertion in `test-poi-detail-content.js` that the fixture copy includes a distinctive dish/use signal and seasonal “ask/look” wording, without making the generic validator attempt semantic natural-language scoring.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node skill/scripts/test-skill-contract.js
node skill/scripts/test-poi-detail-content.js
```

Expected: contract assertions fail because the new written rules are absent.

- [ ] **Step 3: Update generation and verification rules**

In `SKILL.md` stage two, require the event scan to emit `events.json`; distinguish venue, host-linked, and citywide outcomes. In stage three, state that confirmed fixed sessions are hard constraints, announced items are candidates, program-pending windows are recheck items, and historical leads are not shown as current events.

In `poi-schema.md`, add optional `eventRefs` for POIs hosting special programs and state that event details come from `events.json`.

In `source-verification.md`, preserve the existing date-bound search funnel and add explicit promotion rules from discovery lead to current event. In `planning-workflow.md`, require route-impact review for closures, crowds, late finishes, booking, and transport changes even when the traveler does not attend.

Add the approved market content rule: name distinctive local pantry categories, connect them to resident cooking/serving behavior, add trip-month season, and use “look/ask” language for unverified stock.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node skill/scripts/test-poi-detail-content.js
node skill/scripts/test-skill-contract.js
```

Expected: both pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add skill/SKILL.md skill/references/poi-schema.md skill/references/source-verification.md skill/references/planning-workflow.md skill/scripts/test-skill-contract.js skill/scripts/test-poi-detail-content.js
git commit -m "docs: require specific local-life and event planning"
```

---

### Task 3: Public map event runtime and rendering

**Files:**
- Create: `skill/assets/guide-template-europe-public/data/events.json`
- Modify: `skill/scripts/build-europe-public-template.js`
- Modify: `skill/assets/guide-template-europe-public/maps/itinerary-map.html`
- Modify: `skill/assets/guide-template-europe-public/docs/online-logic/map.md`
- Modify: `skill/scripts/test-europe-public-template.js`
- Modify: `skill/scripts/test-mobile-map-interaction.js`

**Interfaces:**
- Consumes: `events.json` records validated by Task 1.
- Produces: `PUBLIC_TRIP_DATA.events` and `window.TRIP_DATA.events`.
- Produces: runtime synthetic venue POI `{ id: "event:<id>", category: "event", eventId, eventStatus, ... }` for `venue` records with valid locations.
- Produces: `renderHostedEvents(item)`, `renderCityEventNotices(day)`, and `isEventAssignable(item)` in the single-file map.

- [ ] **Step 1: Add failing public-template assertions**

Extend `test-europe-public-template.js` to assert the source and embedded event arrays are identical and the HTML contains:

```js
for (const token of [
  "const tripEvents = PUBLIC_TRIP_DATA.events || []",
  "const renderHostedEvents",
  "const renderCityEventNotices",
  "const isEventAssignable",
  'event: { label: "同期活动"',
  "等待具体节目",
]) assert.ok(html.includes(token), `missing event runtime token: ${token}`);
```

Add fixture assertions that a hosted event references a real POI, a citywide program-pending event is visible but not present in `defaultAssignments`, and a confirmed venue event becomes one runtime synthetic event POI.

Extend `test-mobile-map-interaction.js` to require hosted and citywide event text to remain inside the mobile detail/day scroll surfaces without adding a new modal.

- [ ] **Step 2: Run public tests and verify RED**

Run:

```bash
node skill/scripts/build-europe-public-template.js
node skill/scripts/test-europe-public-template.js
node skill/scripts/test-mobile-map-interaction.js
```

Expected: FAIL because event data and render helpers do not exist.

- [ ] **Step 3: Add representative public event fixtures and builder support**

Create three source-backed public sample records covering `venue`, `hosted`, and `citywide`. Do not invent future sessions: use `program-pending` when only an official window exists. Add `events` to both generated data outputs.

Convert only `venue` events with a usable `venuePoiId`/coordinates into synthetic runtime POIs. Map event copy as:

```js
{
  id: `event:${event.id}`,
  name: event.name,
  name_zh: event.name_zh || event.name,
  city: event.city,
  area: event.area || venue.area,
  category: "event",
  priority: event.status === "confirmed" ? "preferred" : "pending",
  coords: event.coords || venue.coords,
  note: event.whyWorthIt,
  plan: event.plan,
  tip: event.tip,
  eventId: event.id,
  eventStatus: event.status
}
```

- [ ] **Step 4: Implement inline map rendering**

Add event category metadata and marker styling. Render hosted events after a POI's type-specific sections. Render citywide/affected-city notices above a day's route list when the day date overlaps `startsAt`/`endsAt` and city matches.

`isEventAssignable(item)` returns `true` for non-event POIs and only for event POIs whose `eventStatus === "confirmed"`. Disable add/day-assignment controls for other event statuses and show traveler-facing copy “等待具体节目” or “等待场次确认”. Do not expose raw enum values.

- [ ] **Step 5: Run focused map tests and validate generated HTML**

Run:

```bash
node skill/scripts/build-europe-public-template.js
node skill/scripts/test-europe-public-template.js
node skill/scripts/test-mobile-map-interaction.js
node skill/scripts/validate-europe-derived-map.js skill/assets/guide-template-europe-public/maps/itinerary-map.html
```

Expected: all pass; generated HTML parses and retains the canonical interaction contract.

- [ ] **Step 6: Document actual map behavior and commit Task 3**

Update the online-logic document with marker, host detail, city/day notice, status gating, and legacy-empty-events behavior.

```bash
git add skill/assets/guide-template-europe-public skill/scripts/build-europe-public-template.js skill/scripts/test-europe-public-template.js skill/scripts/test-mobile-map-interaction.js
git commit -m "feat: render date-bound events in public map"
```

---

### Task 4: Spain market rewrite and event migration

**Files:**
- Create: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/events.json`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/pois.json`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/sources.json`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/maps/assets/trip-data.js`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/maps/itinerary-map.html`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/docs/sources.md`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/docs/online-logic/map.md`
- Modify: `/Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/tests/test-poi-detail-content.js`

**Interfaces:**
- Consumes: Task 1 event contract and Task 3 map runtime.
- Produces: two current Spain event records for `Madrid Otra Mirada` and `Suma Flamenca` using official evidence and explicit recheck dates.
- Produces: revised `bcn-sant-antoni` deep copy using documented stall categories, Catalan dish relationships, and October season.

- [ ] **Step 1: Extend the Spain test before data changes**

Assert all three map data copies preserve `events`. Assert `Madrid Otra Mirada` and `Suma Flamenca` have current official URLs, legal statuses, date windows overlapping the trip, `routeImpact: "candidate"`, and no synthetic route stop while unconfirmed.

For Sant Antoni, assert `whyWorthIt` and detail content include `mongetes`, `botifarra`, `bacallà`, `esqueixada`, `bolets`, `castanyes`, and wording equivalent to “找/问/看看有没有”. Assert the old generic phrase about merely comparing fish/meat/prepared-food stalls is absent.

- [ ] **Step 2: Run the Spain test and verify RED**

Run:

```bash
node /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/tests/test-poi-detail-content.js
```

Expected: FAIL on missing `events.json` and missing specific local-life copy.

- [ ] **Step 3: Recheck official event and market evidence**

Open the current official pages already listed in `sources.json`; verify event window, publication state, venue/session availability, booking state, and recheck timing. Add official source entries for Sant Antoni stall categories, Barcelona market autumn products, `esqueixada`, and Barcelona/Catalan dish context. Record `checkedAt: "2026-08-01"` and a pre-trip `recheckBefore` date.

- [ ] **Step 4: Rewrite Sant Antoni content in all source/runtime copies**

Replace the generic verdict with the approved local-kitchen framing. The action section must lead the traveler through cooked legumes + botifarra, salt cod + olives/preserves, and October products. Explain how those connect to `botifarra amb mongetes`, `esqueixada`, and vermut snacks. Keep stock language conditional and retain the Tuesday/Encants/Sunday distinction.

- [ ] **Step 5: Create and embed Spain event records**

Write `events.json` according to the current official evidence. Use `announced` only when an official date window and enough event identity are published; use `program-pending` when no useful session can yet be selected. Embed identical event arrays into `trip-data.js` and the HTML `PUBLIC_TRIP_DATA` block, then port Task 3 event rendering without changing Spain's visual tokens or map state keys.

- [ ] **Step 6: Update Spain documentation**

Document the local-life content sources, conditional seasonal wording, event status meanings in natural language, recheck dates, and the fact that neither Madrid event is a fixed route stop until a specific session is confirmed.

- [ ] **Step 7: Run Spain validation and verify GREEN**

Run:

```bash
node /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/tests/test-poi-detail-content.js
node skill/scripts/validate-trip-data.js \
  --pois /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/pois.json \
  --itinerary /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/itinerary.json
node skill/scripts/validate-trip-events.js \
  --events /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/events.json \
  --pois /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/pois.json \
  --itinerary /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/itinerary.json \
  --sources /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/data/sources.json
node skill/scripts/validate-europe-derived-map.js \
  /Users/cyx/Desktop/旅游攻略/guides/spain-2026-taste-01/maps/itinerary-map.html
```

Expected: 62 stable POIs, 8 itinerary days, 2 event records, no validation errors, and the canonical map contract passes.

---

### Task 5: Release build, browser QA, and final review

**Files:**
- Generated: `releases/redskill-0.1.0/`
- Inspect: all files changed by Tasks 1–4

**Interfaces:**
- Consumes: completed source, public template, Spain guide, tests, and online-logic documentation.
- Produces: verified REDSkill release and browser evidence for local-life/event behavior.

- [ ] **Step 1: Run the complete source and release verification**

Run:

```bash
npm run build:redskill
npm test
git diff --check
```

Expected: all Skill tests pass; release contract reports supported files and two standalone maps; diff check is clean.

- [ ] **Step 2: Scan generated output and scope**

Run:

```bash
git status --short
git diff --stat
rg -n '/Users/cyx|file://|TO[D]O|TB[D]' skill releases/redskill-0.1.0
```

Expected: only documentation examples that explicitly prohibit private paths may match; no generated traveler content contains a private path, credential, placeholder, or internal source id.

- [ ] **Step 3: Browser QA the public template**

Serve the source repo locally and use the Browser plugin. Test desktop and the available mobile-sized surface:

1. Open a confirmed venue event and verify the event marker/detail plus assign control.
2. Open a hosted event's POI and verify the special-program section uses the host marker.
3. Open a day affected by a citywide/program-pending event and verify the notice appears but no fake route stop exists.
4. Verify a legacy POI still opens normally.
5. Check title, nonblank DOM, no framework overlay, and no relevant console error/warn.

- [ ] **Step 4: Browser QA the Spain map**

Open Mercat de Sant Antoni and verify:

- the verdict explains resident meal assembly rather than generic groceries;
- the action list contains local dish/use and October ask/look cues;
- Tuesday limitations remain accurate;
- natural-language source text appears without source ids;
- Madrid event windows are visible in their affected day/city context and cannot be added as confirmed stops;
- a legacy POI still uses the fallback detail layout;
- console has no relevant error/warn.

- [ ] **Step 5: Final commit for source-only QA fixes**

If browser QA requires source repo fixes, rerun focused tests and commit only those fixes:

```bash
git add skill package.json
git commit -m "fix: complete local-life and event QA"
```

Do not add or commit unrelated workspace files or generated release output unless the repository release policy explicitly requires it.

- [ ] **Step 6: Report remaining risk**

State which event sessions remain program-pending, which mobile viewport was actually tested, that seasonal stall availability still requires pre-trip recheck, and that the Spain travel workspace is not a git repository.
