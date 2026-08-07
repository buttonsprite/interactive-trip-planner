#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  })),
});
const daySnapshot = structuredClone({ sevenPois, sevenDay });
const sevenHandoffs = TripMapDelivery.buildDayHandoffs(sevenDay, sevenPois, {
  orderedPoiIds: sevenPois.map((poi) => poi.id),
  region: "CN",
  source: "interactive-trip-planner",
});

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

assert.equal(sevenHandoffs.overview.provider, "amap");
assert.equal(sevenHandoffs.overview.poiIds.length, 7);
assert.ok(
  parse(sevenHandoffs.overview.url).searchParams.get("markers").split("|").length <= 10,
  "AMap marker overviews may contain at most ten markers",
);
const walkingAmapRoutes = sevenHandoffs.routeLinks.filter((link) => link.provider === "amap");
assert.equal(walkingAmapRoutes.length, 6, "walking AMap handoffs must remain adjacent segments");
for (const route of walkingAmapRoutes) {
  assert.equal(parse(route.url).searchParams.has("via"), false, "walking links must never contain via");
  assert.equal(parse(route.url).searchParams.get("mode"), "walk");
}
assert.equal(sevenHandoffs.routeStatus, "partial");
assert.deepEqual({ sevenPois, sevenDay }, daySnapshot, "day links must not mutate frozen fixtures");

const drivingPois = deepFreeze(Array.from({ length: 3 }, (_, index) => resolvedPoi(`drive-${index + 1}`, index + 7)));
const drivingDay = deepFreeze({
  id: "driving-day",
  date: "2026-10-14",
  routeReview: { status: "verified" },
  routeStops: drivingPois.map((poi, index) => ({ poiId: poi.id, order: index })),
  transitSegments: [
    { fromPoiId: drivingPois[0].id, toPoiId: drivingPois[1].id, mode: "driving", routeStatus: "verified" },
    { fromPoiId: drivingPois[1].id, toPoiId: drivingPois[2].id, mode: "driving", routeStatus: "verified" },
  ],
});
const drivingHandoffs = TripMapDelivery.buildDayHandoffs(drivingDay, drivingPois, {
  region: "CN",
  source: "interactive-trip-planner",
});
const drivingAmapRoutes = drivingHandoffs.routeLinks.filter((link) => link.provider === "amap");
assert.equal(drivingAmapRoutes.length, 1, "three driving stops may share one AMap navigation link");
assert.ok(parse(drivingAmapRoutes[0].url).searchParams.has("via"));
assert.equal(parse(drivingAmapRoutes[0].url).searchParams.get("mode"), "car");

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
assert.equal(unknownModeAmapRoutes.length, 2, "unknown transport must remain adjacent AMap links");
assert.ok(
  unknownModeAmapRoutes.every((link) => !parse(link.url).searchParams.has("via")),
  "unknown transport cannot be promoted to a driving via link",
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
const currentState = deepFreeze({
  assignments: { "state-a": "state-day-1", "state-b": "state-day-2", "state-c": "" },
  orders: { "state-day-1": ["state-a"], "state-day-2": ["state-b"] },
  priorities: { "state-a": "must", "state-b": "nearby", "state-c": "preferred" },
  dirtyDays: { "state-day-2": true },
});
const stateSnapshot = structuredClone({ currentTrip, currentState });
const currentView = TripMapDelivery.currentTripView(currentTrip, currentState);
assert.deepEqual(currentView.assignments, currentState.assignments);
assert.deepEqual(currentView.priorities, currentState.priorities);
assert.deepEqual(currentView.dirtyDays, { "state-day-2": true });
assert.deepEqual(currentView.days[0].orderedPoiIds, ["state-a"]);
assert.deepEqual(currentView.days[1].orderedPoiIds, ["state-b"]);
assert.equal(currentView.days[0].routeStatus, "verified");
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
