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
const eventsPath = path.join(root, "data", "events.json");
const tripDataPath = path.join(root, "maps", "assets", "trip-data.js");

for (const file of [htmlPath, poiPath, itineraryPath, sourcesPath, eventsPath, tripDataPath]) {
  assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, `missing public template file: ${file}`);
}

const html = fs.readFileSync(htmlPath, "utf8");
const pois = JSON.parse(fs.readFileSync(poiPath, "utf8"));
const itinerary = JSON.parse(fs.readFileSync(itineraryPath, "utf8"));
const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const events = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
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
assert.deepEqual(embedded.events, events);
assert.ok(sources.every((source) => source.url && source.checkedAt && source.supports?.length));

const generatedSandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(tripDataPath, "utf8"), generatedSandbox);
assert.deepEqual(JSON.parse(JSON.stringify(generatedSandbox.window.TRIP_DATA.events)), events);

const eventRuntimeMatch = html.match(/\/\* EVENT_RUNTIME_PURE_START \*\/([\s\S]*?)\/\* EVENT_RUNTIME_PURE_END \*\//);
assert.ok(eventRuntimeMatch, "public map must expose the shipped pure event runtime for executable contract tests");
const eventRuntimeNames = [
  "isSlugSafeEventId",
  "buildRuntimeEventPois",
  "isEventAssignable",
  "sanitizeEventAssignments",
  "getCityEventsForDay",
  "renderHostedEventsForItem",
  "renderCityEventNoticesForDay",
  "composePoiDetailEventSections",
  "composeDayListEventSections",
];
const eventRuntimeSandbox = {};
vm.runInNewContext(
  `${eventRuntimeMatch[1]}\nthis.eventRuntime = { ${eventRuntimeNames.join(", ")} };`,
  eventRuntimeSandbox,
);
const eventRuntime = eventRuntimeSandbox.eventRuntime;
const runtimePois = [
  {
    id: "venue-1",
    name: "Venue",
    city: "Paris",
    area: "Venue area",
    coords: [48.8, 2.3],
    category: "art",
  },
  { id: "host-1", name: "Host", city: "Paris", area: "Host area", coords: [48.9, 2.4], category: "art" },
];
const runtimeEvents = [
  {
    id: "confirmed.event-1",
    name: "Confirmed event",
    name_zh: "确认活动",
    scope: "venue",
    city: "Paris",
    area: "Event area",
    status: "confirmed",
    venuePoiId: "venue-1",
    whyWorthIt: "Worth it",
    plan: "Plan it",
    tip: "Check it",
    officialUrl: "https://example.com/confirmed",
  },
  {
    id: "pending-event",
    name: "Pending event",
    scope: "venue",
    city: "Paris",
    status: "program-pending",
    coords: [48.7, 2.2],
    whyWorthIt: "Pending worth",
    plan: "Pending plan",
    tip: "Pending tip",
    officialUrl: "https://example.com/pending",
  },
  { id: "hosted-event", name: "Hosted", scope: "hosted", city: "Paris", status: "announced", hostPoiId: "host-1" },
  { id: "city-event", name: "Citywide", scope: "citywide", city: "Paris", status: "program-pending" },
  {
    id: 'bad" onmouseover="alert(1)',
    name: "Malicious",
    scope: "venue",
    city: "Paris",
    status: "confirmed",
    coords: [48.6, 2.1],
  },
];
const syntheticPois = JSON.parse(JSON.stringify(eventRuntime.buildRuntimeEventPois(runtimeEvents, runtimePois)));
assert.equal(syntheticPois.length, 2, "only safe, located venue events should become synthetic POIs");
assert.deepEqual(syntheticPois[0], {
  id: "event:confirmed.event-1",
  name: "Confirmed event",
  name_zh: "确认活动",
  zh: "确认活动",
  city: "Paris",
  area: "Event area",
  category: "event",
  priority: "preferred",
  coords: [48.8, 2.3],
  note: "Worth it",
  whyWorthIt: "Worth it",
  plan: "Plan it",
  tip: "Check it",
  officialUrl: "https://example.com/confirmed",
  imageQuery: "Confirmed event Paris",
  eventId: "confirmed.event-1",
  eventStatus: "confirmed",
});
assert.deepEqual(syntheticPois.map((item) => item.id), ["event:confirmed.event-1", "event:pending-event"]);
assert.equal(eventRuntime.isSlugSafeEventId('bad" onmouseover="alert(1)'), false);

const assignmentItems = [
  { id: "normal", category: "art" },
  syntheticPois[0],
  syntheticPois[1],
];
for (const label of ["default", "restored"]) {
  const input = {
    normal: { dayId: "d1", order: 1 },
    "event:confirmed.event-1": { dayId: "d1", order: 2 },
    "event:pending-event": { dayId: "d1", order: 3 },
    "event:removed-event": { dayId: "d1", order: 4 },
    "legacy-missing-poi": { dayId: "d1", order: 5 },
  };
  const sanitized = JSON.parse(JSON.stringify(eventRuntime.sanitizeEventAssignments(input, assignmentItems)));
  assert.deepEqual(sanitized, {
    normal: { dayId: "d1", order: 1 },
    "event:confirmed.event-1": { dayId: "d1", order: 2 },
    "legacy-missing-poi": { dayId: "d1", order: 5 },
  }, `${label} assignments must exclude pending and removed events`);
  assert.ok(input["event:pending-event"], `${label} sanitization must not mutate its input`);
}
assert.ok(
  html.includes("const defaultItineraryAssignments = sanitizeEventAssignments(rawDefaultItineraryAssignments, pois)"),
  "default assignments must use the executable event sanitizer",
);
assert.ok(
  html.includes("itineraryPlan.assignments = sanitizeEventAssignments(itineraryPlan.assignments, pois)"),
  "restored assignments must use the executable event sanitizer",
);

const boundaryEvents = [{
  id: "all-saints",
  scope: "citywide",
  city: "Barcelona",
  startsAt: "2026-11-01",
  endsAt: "2026-11-03",
}];
for (const short of ["11/1", "11/2", "11/3"]) {
  assert.equal(eventRuntime.getCityEventsForDay(boundaryEvents, { short, city: "Barcelona" }, "2026-10-24").length, 1);
}
for (const [short, city] of [["10/31", "Barcelona"], ["11/4", "Barcelona"], ["11/2", "Madrid"]]) {
  assert.equal(eventRuntime.getCityEventsForDay(boundaryEvents, { short, city }, "2026-10-24").length, 0);
}

const slugify = (value) => String(value)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const publicPoiIds = new Set(pois.map((poi) => slugify(`${poi.city}-${poi.name}`)));
const hostedEvent = events.find((event) => event.scope === "hosted");
assert.ok(hostedEvent && publicPoiIds.has(hostedEvent.hostPoiId), "hosted event must reference a real public POI");
const citywidePendingEvent = events.find((event) => event.scope === "citywide" && event.status === "program-pending");
assert.ok(citywidePendingEvent, "public fixture must include a visible citywide program-pending event");
assert.ok(
  itinerary.days.some((day) => day.city === citywidePendingEvent.city && day.short === "11/1"),
  "citywide program-pending event must overlap a visible public itinerary day",
);
const confirmedVenueEvents = events.filter((event) => event.scope === "venue" && event.status === "confirmed");
assert.equal(confirmedVenueEvents.length, 1, "public fixture should produce one confirmed venue event POI");
const castanyadaSource = sources.find((source) => source.id === "barcelona-autumn-traditions");
assert.ok(castanyadaSource?.supports.includes("castanyada-date"));
assert.match(castanyadaSource?.notes || "", /10 月 31 日/);

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
  "const tripEvents = PUBLIC_TRIP_DATA.events || []",
  "const renderHostedEvents",
  "const renderCityEventNotices",
  "const isEventAssignable",
  'event: { label: "同期活动"',
  "等待具体节目",
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
