#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "assets", "guide-template-europe-public");
const htmlPath = path.join(root, "maps", "itinerary-map.html");
const html = fs.readFileSync(htmlPath, "utf8");

for (const token of [
  'data-mobile-shell="map-first-v1"',
  'id="mobile-app-bar"',
  'id="mobile-overview-action"',
  'id="mobile-app-title"',
  'id="mobile-app-meta"',
  'id="mobile-search-action"',
  'id="mobile-layer-action"',
  'id="mobile-bottom-sheet"',
  'id="mobile-sheet-handle"',
  'id="mobile-sheet-view"',
  'id="mobile-candidates-action"',
  'id="mobile-undo-action"',
  'id="mobile-change-summary-action"',
  'id="mobile-replan-action"',
  'id="mobile-replan-fallback"',
  'data-mobile-view="overview"',
  'data-mobile-view="day"',
  'data-mobile-view="detail"',
  'data-mobile-view="candidates"',
  "function normalizeMobileViewMode(mode)",
  "function normalizeMobileSheetSnap(snap)",
  "function getNextMobileLayerControlState(currentOpen)",
  "function shouldCollapseLayerControl(viewportWidth)",
  "function calculateCenteredRailScrollLeft(containerWidth, scrollWidth, itemOffsetLeft, itemWidth)",
  "function calculateMobilePoiFocusPanY(currentMarkerPageY, visibleTop, visibleBottom)",
  "function createStructuredChange(type, label, before, after, affectedDays)",
  "const setMobileViewMode =",
  "const setMobileSheetSnap =",
  "const toggleMobileLayerControl =",
  "const openMobileCandidates =",
  "const renderMobileShell =",
  "const centerActiveDetailDay =",
  "const undoLastItineraryChange =",
  "const renderChangeSummary =",
  "const invalidateReplanFallback =",
  "const copyReplanRequest =",
  "mobileReplanFallback.value = requestText",
  "mobileReplanFallback.hidden = false",
  "renderHostedEvents(item)",
  "const cityEventNoticesHtml = renderCityEventNotices(day)",
]) {
  assert.ok(html.includes(token), `missing mobile interaction contract token: ${token}`);
}

for (const pattern of [
  /@media \(max-width: 820px\)[\s\S]*?\.mobile-app-bar\s*\{/,
  /@media \(max-width: 820px\)[\s\S]*?\.mobile-bottom-sheet\s*\{/,
  /--mobile-sheet-compact-height:\s*43dvh;/,
  /\.poi-detail-day-button\.active\s*\{[\s\S]*?background:\s*#0f766e;/,
  /color:\s*shouldCollapseLayerControl\(window\.innerWidth\)\s*\?\s*"#0f766e"\s*:\s*"#64748b"/,
  /@media \(max-width: 820px\)[\s\S]*?\.poi-detail-header\s*\{[\s\S]*?position:\s*static;/,
  /\.mobile-bottom-sheet\[data-sheet-snap="compact"\]/,
  /\.mobile-bottom-sheet\[data-sheet-snap="expanded"\]/,
  /@media \(max-width: 820px\)[\s\S]*?\.poi-detail-day-list\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/,
  /@media \(min-width: 1100px\)[\s\S]*?\.app\.detail-browse/,
  /L\.control\.layers\(null, overlayControlEntries, \{ collapsed: shouldCollapseLayerControl\(window\.innerWidth\) \}\)/,
  /\.poi-detail-day-place\s*\{[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\) auto;/,
  /\.poi-detail-day-place-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;/,
  /\.poi-detail-day-place-shifts\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;/,
  /renderDetailDayRail\(\);\s*centerActiveDetailDay\(\);/,
  /map\.panBy\(\[0, panY\], \{ animate: false \}\)/,
  /const returnFromMobileDetail = \(\) => \{[\s\S]*?delete appState\.openPoiId;/,
  /const selectDetailDay = \(dayId\) => \{[\s\S]*?selectDayView\(dayId, \{ fit: false, openFirst: false \}\);[\s\S]*?setMobileViewMode\("day"\);[\s\S]*?\n    \};/,
  /const recordItineraryChange = \(type, label, before, after, affectedDays = \[\]\) =>/,
  /const recordItineraryChange = \(type, label, before, after, affectedDays = \[\]\) => \{[\s\S]*?invalidateReplanFallback\(\);[\s\S]*?\n    \};/,
  /const undoLastItineraryChange = \(\) => \{[\s\S]*?invalidateReplanFallback\(\);[\s\S]*?refreshItineraryView\(\);/,
  /saveItineraryPlan\(itineraryPlan\);\s*refreshItineraryView\(\);\s*if \(!isListPriority\)/,
  /changes\.map\(\(change\) => `<li>\$\{escapeHtml\(describeItineraryChange\(change\)\)\}<\/li>`\)/,
  /\$\{detailSectionsHtml\}\s*\$\{renderHostedEvents\(item\)\}/,
  /poiDetailDayList\.innerHTML = cityEventNoticesHtml \+ routeWarningHtml \+ scheduledHtml \+ candidateHtml;/,
]) {
  assert.match(html, pattern, `missing mobile layout/behavior contract: ${pattern}`);
}

assert.doesNotMatch(
  html,
  /saveItineraryPlan\(itineraryPlan\);\s*entry\.marker\.setIcon\(poiIcon\(entry\.item\)\);\s*renderPoiList\(\);\s*if \(!isListPriority\)/,
  "priority changes must not bypass the unified itinerary/map refresh",
);

assert.doesNotMatch(
  html,
  /(?:id|class)="[^"]*event[^"]*modal/i,
  "hosted and citywide event content must stay in existing mobile scroll surfaces, not a new modal",
);

const pureFunctionNames = [
  "normalizeMobileViewMode",
  "normalizeMobileSheetSnap",
  "getNextMobileLayerControlState",
  "shouldCollapseLayerControl",
  "calculateCenteredRailScrollLeft",
  "calculateMobilePoiFocusPanY",
  "createStructuredChange",
];
const pureFunctions = pureFunctionNames.map((name) => {
  const match = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `missing pure mobile behavior function: ${name}`);
  return match[0];
});
const sandbox = {};
vm.runInNewContext(`${pureFunctions.join("\n")}\nthis.mobileFns = { ${pureFunctionNames.join(", ")} };`, sandbox);
assert.equal(sandbox.mobileFns.normalizeMobileViewMode("overview"), "overview");
assert.equal(sandbox.mobileFns.normalizeMobileViewMode("day"), "day");
assert.equal(sandbox.mobileFns.normalizeMobileViewMode("detail"), "detail");
assert.equal(sandbox.mobileFns.normalizeMobileViewMode("candidates"), "candidates");
assert.equal(sandbox.mobileFns.normalizeMobileViewMode("unknown"), "overview");
assert.equal(sandbox.mobileFns.normalizeMobileSheetSnap("expanded"), "expanded");
assert.equal(sandbox.mobileFns.normalizeMobileSheetSnap("compact"), "compact");
assert.equal(sandbox.mobileFns.normalizeMobileSheetSnap("unknown"), "compact");
assert.equal(sandbox.mobileFns.getNextMobileLayerControlState(false), true);
assert.equal(sandbox.mobileFns.getNextMobileLayerControlState(true), false);
assert.equal(sandbox.mobileFns.shouldCollapseLayerControl(390), true);
assert.equal(sandbox.mobileFns.shouldCollapseLayerControl(820), true);
assert.equal(sandbox.mobileFns.shouldCollapseLayerControl(1100), false);
assert.equal(sandbox.mobileFns.calculateCenteredRailScrollLeft(300, 1200, 600, 60), 480);
assert.equal(sandbox.mobileFns.calculateCenteredRailScrollLeft(300, 1200, 20, 60), 0);
assert.equal(sandbox.mobileFns.calculateCenteredRailScrollLeft(300, 1200, 1160, 60), 900);
assert.equal(sandbox.mobileFns.calculateMobilePoiFocusPanY(454, 64, 354), 245);
assert.equal(sandbox.mobileFns.calculateMobilePoiFocusPanY(200, 64, 354), -9);
const structuredChange = sandbox.mobileFns.createStructuredChange(
  "move",
  "移动地点",
  { dayId: "d1", order: 2 },
  { dayId: "d2", order: 4 },
  ["d1", "d2", "d2"],
);
assert.equal(
  JSON.stringify(structuredChange),
  JSON.stringify({
    type: "move",
    label: "移动地点",
    before: { dayId: "d1", order: 2 },
    after: { dayId: "d2", order: 4 },
    affectedDays: ["d1", "d2"],
  }),
);

const dataMatch = html.match(/const PUBLIC_TRIP_DATA = (\{[\s\S]*?\});\n\n    const stops = PUBLIC_TRIP_DATA\.stops;/);
assert.ok(dataMatch, "public data boundary must remain replaceable");
const data = JSON.parse(dataMatch[1]);
assert.equal(data.itineraryDays.length, 18);
assert.equal(data.pois.length, 379);
assert.equal(data.trip.slug, "europe-autumn-2026-sample");

for (const storageKey of [
  "europe-autumn-2026-sample-priorities-v1",
  "europe-autumn-2026-sample-plan-v1",
  "europe-autumn-2026-sample-map-state-v1",
]) {
  assert.ok(html.includes(storageKey), `public storage key changed: ${storageKey}`);
}

for (const pattern of [
  /\/Users\//i,
  /file:\/\//i,
  /Airbnb/i,
  /51240589/,
  /\bAF\d{3,4}\b/,
  /europe-2026-itinerary-/,
  /d0916/,
]) {
  assert.doesNotMatch(html, pattern, `privacy scan found ${pattern}`);
}

console.log("Mobile map interaction contract passed");
