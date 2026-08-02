#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "assets", "guide-template-europe-public");
const htmlPath = path.join(root, "maps", "itinerary-map.html");
const poiPath = path.join(root, "data", "pois.json");
const itineraryPath = path.join(root, "data", "itinerary.json");
const sourcesPath = path.join(root, "data", "sources.json");

for (const file of [htmlPath, poiPath, itineraryPath, sourcesPath]) {
  assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, `missing public template file: ${file}`);
}

const html = fs.readFileSync(htmlPath, "utf8");
const pois = JSON.parse(fs.readFileSync(poiPath, "utf8"));
const itinerary = JSON.parse(fs.readFileSync(itineraryPath, "utf8"));
const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const dataMatch = html.match(/const PUBLIC_TRIP_DATA = (\{[\s\S]*?\});\n\n    const stops = PUBLIC_TRIP_DATA\.stops;/);
assert.ok(dataMatch, "public HTML must expose a single replaceable PUBLIC_TRIP_DATA block");
const embedded = JSON.parse(dataMatch[1]);

assert.equal(itinerary.trip.slug, "europe-autumn-2026-sample");
assert.equal(itinerary.trip.language, "zh-CN");
assert.equal(itinerary.days.length, 18);
assert.equal(pois.length, 379);
assert.equal(embedded.trip.slug, itinerary.trip.slug);
assert.equal(embedded.itineraryDays.length, 18);
assert.equal(embedded.pois.length, 379);
assert.deepEqual(embedded.pois, pois);
assert.deepEqual(embedded.itineraryDays, itinerary.days);
assert.ok(sources.every((source) => source.url && source.checkedAt && source.supports?.length));

const byName = new Map(pois.map((poi) => [poi.name, poi]));
const santAntoni = byName.get("Mercat de Sant Antoni");
assert.equal(santAntoni?.contentTier, "deep");
assert.ok(santAntoni?.whyWorthIt?.trim(), "deep sample should explain why it is worth visiting");
assert.ok(santAntoni?.detailSections?.length >= 2 && santAntoni.detailSections.length <= 4);
assert.deepEqual(embedded.pois.find((poi) => poi.name === "Mercat de Sant Antoni"), santAntoni);
const hasChinese = (value) => /[\u3400-\u9fff]/.test(String(value || ""));
for (const [name, expected] of [
  ["Sainte-Chapelle", "圣礼拜堂"],
  ["Cathédrale Notre-Dame de Paris", "巴黎圣母院"],
  ["Musée d'Orsay", "奥赛博物馆"],
  ["Domaine national du Palais-Royal", "巴黎皇家宫殿"],
  ["La Pedrera - Casa Milà", "米拉之家"],
]) {
  assert.match(byName.get(name)?.zh || "", new RegExp(expected), `${name} should have a Chinese-facing name`);
}
for (const poi of pois.filter((item) => ["sight", "art", "local-life"].includes(item.category))) {
  assert.ok(hasChinese(poi.zh), `${poi.category} place should have a Chinese-facing name: ${poi.name}`);
}

for (const token of [
  'data-canonical-interaction="europe-map-direct-v1"',
  'id="sidebar"',
  'id="day-list"',
  'id="poi-list"',
  'id="poi-detail-panel"',
  'id="poi-detail-day-rail"',
  'id="poi-detail-day-list"',
  'id="map"',
  "renderDayList",
  "renderPoiList",
  "renderDetailDayRail",
  "renderPoiDetailDayList",
  "openPoiDetail",
  "const renderPoiDetailSections",
  "poi-detail-list",
  "item.whyWorthIt || item.note",
  "const userLanguage = PUBLIC_TRIP_DATA.trip.language",
  "const getDisplayName = (item)",
  "function calculatePoiFocusZoom(currentZoom, mapSize)",
  "const focusPoiOnMap = (entry)",
  "data-drag-poi",
  "dayCandidatePriorityRank",
  "loadCommonsImages",
  "L.control.layers",
  'dashArray: "6 8"',
  'params.set("lat"',
  'params.set("lng"',
  'params.set("z"',
  'params.set("poi"',
  'params.set("layers"',
  "@media (max-width: 820px)",
  "europe-autumn-2026-sample-priorities-v1",
  "europe-autumn-2026-sample-plan-v1",
  "europe-autumn-2026-sample-map-state-v1",
]) {
  assert.ok(html.includes(token), `missing direct-copy interaction token: ${token}`);
}

const focusMatch = html.match(/function calculatePoiFocusZoom\(currentZoom, mapSize\) \{[\s\S]*?\n    \}/);
assert.ok(focusMatch, "public template should expose a pure size-aware POI focus calculation");
const focusSandbox = {};
vm.runInNewContext(`${focusMatch[0]}; this.calculatePoiFocusZoom = calculatePoiFocusZoom;`, focusSandbox);
assert.equal(focusSandbox.calculatePoiFocusZoom(8, { x: 420, y: 360 }), 14);
assert.equal(focusSandbox.calculatePoiFocusZoom(8, { x: 680, y: 640 }), 15);
assert.equal(focusSandbox.calculatePoiFocusZoom(8, { x: 1200, y: 800 }), 16);
assert.equal(focusSandbox.calculatePoiFocusZoom(18, { x: 680, y: 640 }), 16);
assert.doesNotMatch(html, /Math\.max\(map\.getZoom\(\), 15\)/);

const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim());
assert.equal(scripts.length, 1);
new vm.Script(scripts[0], { filename: htmlPath });

const publicText = [html, JSON.stringify(pois), JSON.stringify(itinerary), JSON.stringify(sources)].join("\n");
for (const pattern of [
  /\/Users\/cyx/i,
  /file:\/\//i,
  /Airbnb/i,
  /51240589/,
  /\bAF\d{3,4}\b/,
  /europe-2026-itinerary-/,
  /d0916/,
]) {
  assert.doesNotMatch(publicText, pattern, `privacy scan found ${pattern}`);
}

console.log("Europe direct-copy public template contract passed");
