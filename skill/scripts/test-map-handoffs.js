#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadMapDeliveryRuntime } from "./load-map-delivery-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function resolvedPoi(id, index) {
  const lat = 25.69 + index * 0.001;
  const lng = 100.16 + index * 0.001;
  return {
    id,
    name: `地点 ${index + 1}`,
    name_zh: `地点 ${index + 1}`,
    city: "大理",
    area: "大理古城",
    category: index === 0 ? "hotel" : "local-life",
    priority: index === 0 ? "must" : "preferred",
    coords: [lat, lng],
    address: `测试地址 ${index + 1}`,
    mapProviderRefs: {
      amap: {
        status: "resolved",
        poiId: `B0FFTEST0${index + 1}`,
        name: `地点 ${index + 1}`,
        address: `测试地址 ${index + 1}`,
        position: { lng, lat, system: "gcj02" },
        checkedAt: "2026-08-06",
      },
    },
  };
}

function parse(url) {
  return new URL(url);
}

function loadTripMapStateRuntime() {
  const statePath = path.resolve(
    scriptDir,
    "../assets/guide-template/maps/assets/trip-map-state.js",
  );
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(statePath, "utf8"), sandbox, { filename: statePath });
  return sandbox.TripMapState;
}

const TripMapDelivery = loadMapDeliveryRuntime();
assert.equal(Object.isFrozen(TripMapDelivery), true, "delivery API must be immutable");

const amapPoi = deepFreeze(resolvedPoi("dali-market", 0));
const placeSnapshot = structuredClone(amapPoi);
const links = TripMapDelivery.buildPlaceLinks(amapPoi, {
  region: "CN",
  source: "interactive-trip-planner",
});
assert.match(links.primary.url, /^https:\/\/uri\.amap\.com\/marker\?/);
assert.match(links.amap.url, /markers=B0FFTEST01/);
assert.match(links.google.url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1/);
assert.equal(links.amap.label, "在高德地图打开 / Open in AMap");
assert.equal(links.google.label, "在 Google Maps 打开 / Open in Google Maps");
assert.equal(parse(links.amap.url).searchParams.get("src"), "interactive-trip-planner");
assert.equal(parse(links.google.url).searchParams.get("api"), "1");
assert.deepEqual(amapPoi, placeSnapshot, "place links must not mutate a frozen POI");

const ambiguousPoi = deepFreeze({
  ...resolvedPoi("ambiguous-market", 1),
  mapProviderRefs: {
    amap: {
      status: "ambiguous",
      poiId: "B0FFAMBIGUOUS",
      name: "待确认分店",
      address: "待确认地址",
      position: { lng: 100.161, lat: 25.691, system: "gcj02" },
      checkedAt: "2026-08-06",
    },
  },
});
const ambiguousLinks = TripMapDelivery.buildPlaceLinks(ambiguousPoi, {
  region: "CN",
  source: "interactive-trip-planner",
});
assert.equal(ambiguousLinks.amap, null, "ambiguous AMap refs cannot create direct links");
assert.doesNotMatch(JSON.stringify(ambiguousLinks), /B0FFAMBIGUOUS/);
assert.equal(ambiguousLinks.primary.provider, "google");
assert.ok(
  ambiguousLinks.manualItems.some((item) => item.poiId === ambiguousPoi.id && item.provider === "amap"),
  "ambiguous AMap places must remain available for manual handoff",
);

const sevenPois = deepFreeze(Array.from({ length: 7 }, (_, index) => resolvedPoi(`stop-${index + 1}`, index)));
const sevenDay = deepFreeze({
  id: "day-seven",
  date: "2026-10-13",
  title: "七站步行日",
  city: "大理",
  routeReview: { status: "partial" },
  routeStops: sevenPois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: sevenPois.slice(1).map((poi, index) => ({
    fromPoiId: sevenPois[index].id,
    toPoiId: poi.id,
    mode: "walking",
    routeStatus: index < 2 ? "verified" : "unverified",
    routeProvider: index < 2 ? "amap" : undefined,
    routeReviewedAt: index < 2 ? "2026-08-06" : undefined,
    distanceMeters: index < 2 ? 650 + index * 100 : undefined,
  })),
});
const daySnapshot = structuredClone({ sevenPois, sevenDay });
const sevenHandoffs = TripMapDelivery.buildDayHandoffs(sevenDay, sevenPois, {
  orderedPoiIds: sevenPois.map((poi) => poi.id),
  region: "CN",
  source: "interactive-trip-planner",
});

const overseasSevenHandoffs = TripMapDelivery.buildDayHandoffs(sevenDay, sevenPois, {
  orderedPoiIds: sevenPois.map((poi) => poi.id),
  region: "OVERSEAS",
  source: "interactive-trip-planner",
});
assert.equal(overseasSevenHandoffs.overview, null, "overseas days must not emit an AMap overview");
assert.deepEqual(overseasSevenHandoffs.overviews, [], "overseas days must not emit AMap overview chunks");
assert.ok(
  overseasSevenHandoffs.routeLinks.every((link) => link.provider === "google"),
  "overseas day routes must not emit AMap navigation links",
);
assert.ok(
  overseasSevenHandoffs.manualItems.every((item) => item.provider !== "amap"),
  "overseas day handoff must not ask travelers to resolve AMap manual items",
);
assert.equal(
  overseasSevenHandoffs.routeLinks.filter((link) => link.provider === "google").length,
  2,
  "the overseas region gate must preserve the existing Google route policy",
);

const googleRoutes = sevenHandoffs.routeLinks.filter((link) => link.provider === "google");
assert.equal(googleRoutes.length, 2, "seven stops must split into two Google direction links");
for (const route of googleRoutes) {
  const waypoints = parse(route.url).searchParams.get("waypoints");
  const waypointCount = waypoints ? waypoints.split("|").length : 0;
  assert.ok(waypointCount <= 3, "Google links may contain at most three intermediate waypoints");
  assert.equal(parse(route.url).pathname, "/maps/dir/");
}
assert.equal(
  parse(googleRoutes[0].url).searchParams.get("destination"),
  parse(googleRoutes[1].url).searchParams.get("origin"),
  "split Google links must overlap at their boundary stop",
);
assert.equal(googleRoutes[0].label, "Google Maps 路线 1/2 / Google Maps route 1/2");

function longGooglePoi(id, length) {
  return {
    id,
    name: `地点${id}${"长".repeat(length)}`,
    city: "测试城",
    area: "测试区",
    category: "sight",
    priority: "preferred",
  };
}

const longGooglePois = deepFreeze(Array.from({ length: 5 }, (_, index) => longGooglePoi(`long-${index + 1}`, 80)));
const longGoogleDay = deepFreeze({
  id: "long-google-day",
  routeReview: { status: "unverified" },
  routeStops: longGooglePois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: longGooglePois.slice(1).map((poi, index) => ({
    fromPoiId: longGooglePois[index].id,
    toPoiId: poi.id,
    mode: "walking",
  })),
});
const longGoogleHandoffs = TripMapDelivery.buildDayHandoffs(longGoogleDay, longGooglePois, {
  region: "OVERSEAS",
  source: "interactive-trip-planner",
});
const longGoogleRoutes = longGoogleHandoffs.routeLinks.filter((link) => link.provider === "google");
assert.ok(longGoogleRoutes.length > 1, "encoded Google URLs must split before the 2048-character cap");
assert.ok(longGoogleRoutes.every((link) => link.url.length <= 2048), "every Google route URL must be at most 2048 characters");
assert.ok(longGoogleRoutes.every((link) => link.poiIds.length <= 5), "length-aware chunks must retain the five-point limit");
assert.deepEqual(
  [longGoogleRoutes[0].poiIds[0], ...longGoogleRoutes.flatMap((link) => link.poiIds.slice(1))],
  longGooglePois.map((poi) => poi.id),
  "length-aware Google chunks must overlap at boundaries and preserve every ordered point",
);

const impossibleGooglePois = deepFreeze([
  longGooglePoi("impossible-1", 300),
  longGooglePoi("impossible-2", 300),
]);
const impossibleGoogleDay = deepFreeze({
  id: "impossible-google-day",
  routeReview: { status: "unverified" },
  routeStops: impossibleGooglePois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: [{
    fromPoiId: impossibleGooglePois[0].id,
    toPoiId: impossibleGooglePois[1].id,
    mode: "walking",
  }],
});
const impossibleGoogleHandoffs = TripMapDelivery.buildDayHandoffs(impossibleGoogleDay, impossibleGooglePois, {
  region: "OVERSEAS",
  source: "interactive-trip-planner",
});
assert.equal(
  impossibleGoogleHandoffs.routeLinks.filter((link) => link.provider === "google").length,
  0,
  "an adjacent pair that cannot fit must not emit an overlong or truncated Google URL",
);
assert.deepEqual(
  impossibleGoogleHandoffs.manualItems
    .filter((item) => item.provider === "google" && item.reason === "route-url-too-long")
    .map((item) => item.poiId),
  impossibleGooglePois.map((poi) => poi.id),
  "both endpoints of an unencodable adjacent pair must remain as Google manual items",
);

assert.equal(sevenHandoffs.overview.provider, "amap");
assert.equal(sevenHandoffs.overview.label, "在高德查看今日地点 / View today's places in AMap");
assert.equal(sevenHandoffs.overview.poiIds.length, 7);
assert.ok(
  parse(sevenHandoffs.overview.url).searchParams.get("markers").split("|").length <= 10,
  "AMap marker overviews may contain at most ten markers",
);
const manyOverviewPois = deepFreeze(Array.from({ length: 23 }, (_, index) => resolvedPoi(`overview-${index + 1}`, index + 30)));
const manyOverviewDay = deepFreeze({
  id: "many-overview-day",
  routeReview: { status: "unverified" },
  routeStops: manyOverviewPois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: manyOverviewPois.slice(1).map((poi, index) => ({
    fromPoiId: manyOverviewPois[index].id,
    toPoiId: poi.id,
    mode: "walking",
  })),
});
const manyOverviewHandoffs = TripMapDelivery.buildDayHandoffs(manyOverviewDay, manyOverviewPois, {
  region: "CN",
  source: "interactive-trip-planner",
});
assert.equal(manyOverviewHandoffs.overviews.length, 3, "23 AMap markers must split into three complete overviews");
assert.deepEqual(
  manyOverviewHandoffs.overviews.map((item) => item.poiIds.length),
  [10, 10, 3],
  "every AMap overview must contain at most ten markers without truncating the tail",
);
assert.deepEqual(
  manyOverviewHandoffs.overviews.flatMap((item) => item.poiIds),
  manyOverviewPois.map((poi) => poi.id),
  "AMap overview chunks must preserve the complete ordered marker sequence",
);
assert.deepEqual(manyOverviewHandoffs.overview, manyOverviewHandoffs.overviews[0], "overview must remain a first-chunk compatibility alias");
assert.deepEqual(
  manyOverviewHandoffs.overviews.map((item) => item.label),
  [
    "高德今日地点 1/3 / AMap day overview 1/3",
    "高德今日地点 2/3 / AMap day overview 2/3",
    "高德今日地点 3/3 / AMap day overview 3/3",
  ],
);
for (const item of manyOverviewHandoffs.overviews) {
  assert.ok(
    parse(item.url).searchParams.get("markers").split("|").length <= 10,
    "each emitted AMap overview URL must remain within the ten-marker provider limit",
  );
}
const walkingAmapRoutes = sevenHandoffs.routeLinks.filter((link) => link.provider === "amap");
assert.equal(walkingAmapRoutes.length, 6, "walking AMap handoffs must remain adjacent segments");
for (const route of walkingAmapRoutes) {
  assert.equal(parse(route.url).searchParams.has("via"), false, "walking links must never contain via");
  assert.equal(parse(route.url).searchParams.get("mode"), "walk");
}
assert.equal(walkingAmapRoutes[0].label, "高德路线 1/6 / AMap route 1/6");
assert.equal(sevenHandoffs.routeStatus, "partial");
assert.deepEqual({ sevenPois, sevenDay }, daySnapshot, "day links must not mutate frozen fixtures");

const drivingPois = deepFreeze(Array.from({ length: 3 }, (_, index) => resolvedPoi(`drive-${index + 1}`, index + 7)));
const drivingDay = deepFreeze({
  id: "driving-day",
  date: "2026-10-14",
  routeReview: { status: "verified" },
  routeStops: drivingPois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: [
    { fromPoiId: drivingPois[0].id, toPoiId: drivingPois[1].id, mode: "driving", routeStatus: "verified", routeProvider: "amap", routeReviewedAt: "2026-08-06", distanceMeters: 1200 },
    { fromPoiId: drivingPois[1].id, toPoiId: drivingPois[2].id, mode: "driving", routeStatus: "verified", routeProvider: "amap", routeReviewedAt: "2026-08-06", distanceMeters: 1800 },
  ],
});
const drivingHandoffs = TripMapDelivery.buildDayHandoffs(drivingDay, drivingPois, {
  region: "CN",
  source: "interactive-trip-planner",
});
const drivingAmapRoutes = drivingHandoffs.routeLinks.filter((link) => link.provider === "amap");
const drivingGoogleRoutes = drivingHandoffs.routeLinks.filter((link) => link.provider === "google");
assert.equal(drivingAmapRoutes.length, 1, "three driving stops may share one AMap navigation link");
assert.ok(parse(drivingAmapRoutes[0].url).searchParams.has("via"));
assert.equal(parse(drivingAmapRoutes[0].url).searchParams.get("mode"), "car");
assert.equal(drivingAmapRoutes[0].label, "在高德查看这段路线 / Open this route in AMap");
assert.equal(drivingGoogleRoutes[0].label, "在 Google Maps 打开今日路线 / Open today's route in Google Maps");

const unknownModeHandoffs = TripMapDelivery.buildDayHandoffs(
  {
    id: "unknown-mode-day",
    routeReview: { status: "unverified" },
    routeStops: drivingPois.map((poi, index) => ({ poiId: poi.id, order: index })),
  },
  drivingPois,
  { region: "CN", source: "interactive-trip-planner" },
);
const unknownModeAmapRoutes = unknownModeHandoffs.routeLinks.filter((link) => link.provider === "amap");
const unknownModeGoogleRoutes = unknownModeHandoffs.routeLinks.filter((link) => link.provider === "google");
assert.equal(unknownModeAmapRoutes.length, 0, "unknown transport cannot emit an AMap navigation URL");
assert.equal(unknownModeGoogleRoutes.length, 0, "unknown transport cannot emit a Google directions URL");
assert.ok(
  drivingPois.every((poi) => unknownModeHandoffs.manualItems.some(
    (item) => item.poiId === poi.id && item.provider === "amap" && item.reason === "route-mode-required",
  )),
  "unknown AMap edges must keep every affected POI for manual routing",
);
assert.ok(
  drivingPois.every((poi) => unknownModeHandoffs.manualItems.some(
    (item) => item.poiId === poi.id && item.provider === "google" && item.reason === "route-mode-required",
  )),
  "unknown Google edges must keep every affected POI for manual routing",
);

const mixedPois = deepFreeze(Array.from({ length: 4 }, (_, index) => resolvedPoi(`mixed-${index + 1}`, index + 10)));
const mixedDay = deepFreeze({
  id: "mixed-mode-day",
  routeReview: { status: "verified" },
  routeStops: mixedPois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: [
    { fromPoiId: mixedPois[0].id, toPoiId: mixedPois[1].id, mode: "walking", routeStatus: "verified", routeProvider: "amap", routeReviewedAt: "2026-08-06", distanceMeters: 700 },
    { fromPoiId: mixedPois[1].id, toPoiId: mixedPois[2].id, mode: "driving", routeStatus: "verified", routeProvider: "amap", routeReviewedAt: "2026-08-06", distanceMeters: 1400 },
    { fromPoiId: mixedPois[2].id, toPoiId: mixedPois[3].id, mode: "driving", routeStatus: "verified", routeProvider: "amap", routeReviewedAt: "2026-08-06", distanceMeters: 1600 },
  ],
});
const mixedHandoffs = TripMapDelivery.buildDayHandoffs(mixedDay, mixedPois, {
  region: "CN",
  source: "interactive-trip-planner",
});
const mixedGoogleRoutes = mixedHandoffs.routeLinks.filter((link) => link.provider === "google");
assert.equal(mixedGoogleRoutes.length, 2, "mixed known Google modes must split into homogeneous links");
assert.deepEqual(
  mixedGoogleRoutes.map((link) => parse(link.url).searchParams.get("travelmode")),
  ["walking", "driving"],
);
assert.equal(mixedGoogleRoutes[0].poiIds.at(-1), mixedGoogleRoutes[1].poiIds[0]);
assert.ok(mixedGoogleRoutes.every((link) => parse(link.url).searchParams.has("travelmode")));
const mixedAmapRoutes = mixedHandoffs.routeLinks.filter((link) => link.provider === "amap");
assert.deepEqual(mixedAmapRoutes.map((link) => parse(link.url).searchParams.get("mode")), ["walk", "car"]);

const statusPois = deepFreeze(Array.from({ length: 3 }, (_, index) => resolvedPoi(`status-${index + 1}`, index + 14)));
const verifiedStatusDay = deepFreeze({
  id: "status-day",
  routeReview: { status: "verified" },
  routeStops: statusPois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: [
    { fromPoiId: statusPois[0].id, toPoiId: statusPois[1].id, mode: "walking", routeStatus: "verified", routeProvider: "amap", routeReviewedAt: "2026-08-06", distanceMeters: 800 },
    { fromPoiId: statusPois[1].id, toPoiId: statusPois[2].id, mode: "walking", routeStatus: "verified", routeProvider: "amap", routeReviewedAt: "2026-08-06", distanceMeters: 900 },
  ],
});
assert.equal(
  TripMapDelivery.buildDayHandoffs(verifiedStatusDay, statusPois, {}).routeStatus,
  "verified",
);
assert.equal(
  TripMapDelivery.buildDayHandoffs(verifiedStatusDay, statusPois, {
    orderedPoiIds: [statusPois[0].id, statusPois[2].id, statusPois[1].id],
  }).routeStatus,
  "unverified",
  "changed adjacency cannot retain a stale verified status",
);
const oneVerifiedEdgeDay = deepFreeze({
  ...verifiedStatusDay,
  transitSegments: [verifiedStatusDay.transitSegments[0]],
});
assert.equal(
  TripMapDelivery.buildDayHandoffs(oneVerifiedEdgeDay, statusPois, {}).routeStatus,
  "partial",
  "some verified effective edges produce partial status",
);
assert.equal(
  TripMapDelivery.buildDayHandoffs({ ...verifiedStatusDay, routeReview: { status: "partial" } }, statusPois, {}).routeStatus,
  "partial",
  "evidence cannot upgrade a declared partial day",
);
assert.equal(
  TripMapDelivery.buildDayHandoffs({ ...verifiedStatusDay, routeReview: { status: "unverified" } }, statusPois, {}).routeStatus,
  "unverified",
  "evidence cannot upgrade a declared unverified day",
);
for (const [label, routeStatus, routeReviewStatus, expected] of [
  ["routeStatus verified conflicts with routeReview unverified", "verified", "unverified", "unverified"],
  ["routeStatus unverified conflicts with routeReview verified", "unverified", "verified", "unverified"],
  ["routeStatus verified conflicts with routeReview partial", "verified", "partial", "partial"],
  ["routeStatus partial conflicts with routeReview verified", "partial", "verified", "partial"],
]) {
  const result = TripMapDelivery.buildDayHandoffs({
    ...verifiedStatusDay,
    routeStatus,
    routeReview: { status: routeReviewStatus },
  }, statusPois, {});
  assert.equal(result.routeStatus, expected, label);
}
for (const [label, distanceMeters] of [
  ["missing distance", undefined],
  ["zero distance", 0],
  ["negative distance", -1],
]) {
  const result = TripMapDelivery.buildDayHandoffs({
    ...verifiedStatusDay,
    transitSegments: [
      { ...verifiedStatusDay.transitSegments[0], distanceMeters },
      verifiedStatusDay.transitSegments[1],
    ],
  }, statusPois, {});
  assert.equal(result.routeStatus, "partial", `${label} cannot count as a verified edge`);
}
assert.equal(
  TripMapDelivery.buildDayHandoffs(verifiedStatusDay, statusPois, { dirty: true }).routeStatus,
  "unverified",
  "dirty always overrides route evidence",
);

const missingLocationPoi = deepFreeze({
  id: "manual-only",
  name: "需要人工定位的地点",
  address: "待补地址",
  city: "大理",
  category: "local-life",
  priority: "nearby",
});
const incompleteHandoffs = TripMapDelivery.buildDayHandoffs(
  { id: "manual-day", routeReview: { status: "unverified" }, routeStops: [{ poiId: "manual-only", order: 0 }] },
  [missingLocationPoi],
  { region: "CN", source: "interactive-trip-planner" },
);
assert.ok(
  incompleteHandoffs.manualItems.some((item) => item.poiId === "manual-only" && item.provider === "amap"),
  "a POI without a resolved AMap location must not be silently dropped",
);

const currentTrip = deepFreeze({
  slug: "state-shape",
  title: "当前行程",
  priorities: { must: "必去", preferred: "优先去", nearby: "顺路可去" },
  pois: [resolvedPoi("state-a", 0), resolvedPoi("state-b", 1), resolvedPoi("state-c", 2)],
  days: [
    {
      id: "state-day-1",
      date: "2026-10-15",
      routeReview: { status: "verified" },
      routeStops: [{ poiId: "state-a", order: 0 }, { poiId: "state-b", order: 1 }],
    },
    {
      id: "state-day-2",
      date: "2026-10-16",
      routeReview: { status: "verified" },
      routeStops: [{ poiId: "state-c", order: 0 }],
    },
  ],
});
const rawState = deepFreeze({
  assignments: { "state-a": "state-day-1", "state-b": "state-day-1", "state-c": "state-day-1" },
  orders: { "state-day-1": ["state-b", "state-a", "state-c"], "state-day-2": [] },
  priorities: { "state-a": "S", "state-b": "invalid-priority", "state-c": "B" },
  dirtyDays: { "state-day-2": true },
});
const normalizedState = JSON.parse(JSON.stringify(loadTripMapStateRuntime().createState(currentTrip, rawState)));
const currentState = deepFreeze(normalizedState);
const stateSnapshot = structuredClone({ currentTrip, currentState });
const currentView = TripMapDelivery.currentTripView(currentTrip, currentState);
assert.deepEqual(currentView.assignments, currentState.assignments);
assert.deepEqual(currentView.priorities, currentState.priorities);
assert.deepEqual(currentView.orders, currentState.orders);
assert.deepEqual(currentView.dirtyDays, { "state-day-2": true });
assert.deepEqual(currentView.priorities, { "state-a": "must", "state-b": "", "state-c": "nearby" });
assert.deepEqual(currentView.days[0].orderedPoiIds, ["state-a", "state-b", "state-c"]);
assert.deepEqual(currentView.days[1].orderedPoiIds, []);
assert.deepEqual(currentView.days.map((day) => day.orderedPoiIds), [
  currentState.orders["state-day-1"],
  currentState.orders["state-day-2"],
]);
assert.equal(currentView.days[1].routeStatus, "unverified", "dirty days override stale verified evidence");
assert.deepEqual({ currentTrip, currentState }, stateSnapshot, "currentTripView must not mutate frozen inputs");

const invalidRuntimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "trip-map-delivery-invalid-"));
const invalidRuntimePath = path.join(invalidRuntimeDir, "incomplete.js");
try {
  fs.writeFileSync(invalidRuntimePath, "globalThis.TripMapDelivery = Object.freeze({});\n");
  assert.throws(
    () => loadMapDeliveryRuntime(invalidRuntimePath),
    /TripMapDelivery runtime is missing required functions\./,
  );
} finally {
  fs.rmSync(invalidRuntimeDir, { recursive: true, force: true });
}

console.log("map handoff links passed");
