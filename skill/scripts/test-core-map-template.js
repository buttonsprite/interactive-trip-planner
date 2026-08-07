#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const templateRoot = path.join(skillRoot, "assets", "guide-template", "maps");
const htmlPath = path.join(templateRoot, "itinerary-map.html");
const statePath = path.join(templateRoot, "assets", "trip-map-state.js");
const corePath = path.join(templateRoot, "assets", "trip-map-core.js");
const cssPath = path.join(templateRoot, "assets", "trip-map-core.css");

for (const filePath of [htmlPath, statePath, corePath, cssPath]) {
  assert.ok(fs.existsSync(filePath), `missing Core file: ${filePath}`);
  assert.ok(fs.statSync(filePath).size > 0, `empty Core file: ${filePath}`);
}

const html = fs.readFileSync(htmlPath, "utf8");
const core = fs.readFileSync(corePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const travelerFacingHtml = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
const requiredHtml = [
  'id="trip-overview"',
  'id="detail-browse"',
  'id="map"',
  'id="day-list"',
  'id="day-rail"',
  'id="day-place-list"',
  'id="poi-detail"',
  'id="change-summary"',
  'id="undo-change"',
  'id="request-replan"',
  'id="open-map-export"',
  'id="map-export-dialog"',
  'data-map-provider',
  'data-day-handoff',
  'data-export-file',
  'id="replan-dialog"',
  'id="impact-dialog"',
];

for (const token of requiredHtml) {
  const surface = token.startsWith("data-") ? `${html}\n${core}` : html;
  assert.ok(surface.includes(token), `missing template token: ${token}`);
}

assert.match(html, /trip-map-state\.js/);
assert.match(html, /trip-map-delivery\.js/);
assert.match(html, /trip-map-core\.js/);
assert.match(
  html,
  /<dialog\b[^>]*\bid="map-export-dialog"/,
  "map export must use a native modal dialog",
);
const stateScriptIndex = Math.max(
  html.indexOf('assets/trip-map-state.js'),
  html.indexOf('REDSkill embedded trip-map-state.js'),
);
const deliveryScriptIndex = Math.max(
  html.indexOf('assets/trip-map-delivery.js'),
  html.indexOf('REDSkill embedded trip-map-delivery.js'),
);
const coreScriptIndex = Math.max(
  html.indexOf('assets/trip-map-core.js'),
  html.indexOf('REDSkill embedded trip-map-core.js'),
);
assert.ok(
  stateScriptIndex >= 0 && stateScriptIndex < deliveryScriptIndex && deliveryScriptIndex < coreScriptIndex,
  "light map scripts must load State, then Delivery, then Core",
);
assert.match(html, /trip-map-core\.css/);
assert.doesNotMatch(travelerFacingHtml, />\s*POI\s*</);
assert.doesNotMatch(travelerFacingHtml, /renderer|localStorage|themeProfile|JSON|schema|hash/);

for (const functionName of [
  "renderOverview",
  "selectDay",
  "openPoiDetail",
  "returnToOverview",
  "renderDayRail",
  "renderDayPlaceList",
  "renderPoiDetail",
  "renderMapLayers",
  "renderFilters",
  "renderChangeSummary",
]) {
  assert.match(core, new RegExp(`function ${functionName}\\b`), `missing ${functionName}`);
}

assert.match(core, /navigator\.clipboard\.writeText/);
assert.match(core, /需要重新安排/);
assert.match(css, /--trip-accent/);
assert.match(css, /@media \(max-width: 820px\)/);
assert.match(css, /\.map-provider-action\.is-primary/);
assert.match(css, /\.route-verification-status/);
assert.match(css, /\.map-export-error/);
assert.match(
  css,
  /@media \(max-width: 820px\)[\s\S]*?\.day-map-actions a[\s\S]*?min-height:\s*44px/,
  "mobile handoff actions must expose a 44 px target",
);
assert.match(
  css,
  /@media \(max-width: 820px\)[\s\S]*?\.map-export-files button[\s\S]*?min-height:\s*44px/,
  "mobile export actions must expose a 44 px target",
);
assert.match(
  css,
  /@media \(max-width: 820px\)[\s\S]*?\.map-provider-action[\s\S]*?min-height:\s*44px/,
  "mobile provider actions must expose a 44 px target",
);
assert.match(
  css,
  /@media \(max-width: 820px\)[\s\S]*?#close-map-export[\s\S]*?min-height:\s*44px[\s\S]*?(?:min-)?width:\s*44px/,
  "mobile export close action must expose a 44 by 44 px target",
);
assert.match(core, /\.showModal\(\)/, "map export must enter the browser modal top layer");
assert.match(core, /addEventListener\("cancel"/, "native dialog Escape must use the cancel contract");
assert.doesNotMatch(html + core, /姓周桥|德盛饭店|Hin Bus Depot/);

console.log("core map template contract passed");
