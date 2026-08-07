#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapDeliveryRuntime } from "./load-map-delivery-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.resolve(scriptDir, "../assets/samples/evals");
const amapFixturePath = path.join(samplesDir, "amap-dali-public.json");
const overseasFixturePath = path.join(samplesDir, "overseas-my-maps-public.json");
const exportCli = path.join(scriptDir, "export-google-my-maps.js");
const fakeSecrets = {
  AMAP_KEY: "forward-fake-amap-key-83f2c1",
  AMAP_SECURITY_KEY: "forward-fake-amap-security-29ab74",
};
const secretPattern = /forward-fake-amap-(?:key-83f2c1|security-29ab74)/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

function parseUrl(value) {
  return new URL(value);
}

function assertNoFakeSecrets(value, label) {
  assert.doesNotMatch(
    typeof value === "string" ? value : JSON.stringify(value),
    secretPattern,
    `${label} must not contain fake credentials`,
  );
}

const TripMapDelivery = loadMapDeliveryRuntime();
const amapFixture = readJson(amapFixturePath);
const overseasFixture = readJson(overseasFixturePath);

const daliTrip = amapFixture.trip;
const daliDay = daliTrip.days.find((day) => day.id === "dali-four-stop-day");
assert.ok(daliDay, "Dali fixture must contain the four-stop forward day");
assert.equal(daliDay.routeStops.length, 4, "Dali forward day must contain exactly four formal stops");

const daliHandoffs = TripMapDelivery.buildDayHandoffs(daliDay, daliTrip.pois, {
  region: "CN",
  source: "interactive-trip-planner-forward",
});
assert.ok(daliHandoffs.overview, "a resolved four-stop China day needs an AMap marker overview");
assert.equal(daliHandoffs.overview.provider, "amap");
assert.deepEqual(
  daliHandoffs.overview.poiIds,
  ["dali-south-gate", "dali-wuhua-tower", "dali-foreigner-street", "dali-north-gate-market"],
  "the AMap overview must preserve all four stops in order",
);
assert.equal(
  parseUrl(daliHandoffs.overview.url).searchParams.get("markers").split("|").length,
  4,
  "the AMap overview must contain four marker tokens",
);

const daliAmapRoutes = daliHandoffs.routeLinks.filter((link) => link.provider === "amap");
assert.deepEqual(
  daliAmapRoutes.map((link) => link.poiIds),
  [
    ["dali-south-gate", "dali-wuhua-tower"],
    ["dali-wuhua-tower", "dali-foreigner-street"],
    ["dali-foreigner-street", "dali-north-gate-market"],
  ],
  "the four-stop walking day must keep every adjacent AMap route link",
);
for (const link of daliAmapRoutes) {
  const url = parseUrl(link.url);
  assert.equal(url.searchParams.get("mode"), "walk");
  assert.equal(url.searchParams.has("via"), false, "walking AMap routes cannot emit a via point");
}

const ambiguousPoi = daliTrip.pois.find((poi) => poi.id === "dali-ambiguous-tea-shop");
assert.equal(ambiguousPoi?.mapProviderRefs?.amap?.status, "ambiguous");
const ambiguousLinks = TripMapDelivery.buildPlaceLinks(ambiguousPoi, {
  region: "CN",
  source: "interactive-trip-planner-forward",
});
assert.equal(ambiguousLinks.amap, null, "ambiguous AMap refs must not create a direct place link");
assert.doesNotMatch(
  JSON.stringify(ambiguousLinks),
  new RegExp(ambiguousPoi.mapProviderRefs.amap.poiId),
  "an ambiguous provider POI ID must never appear in handoff output",
);

const overseasTrip = overseasFixture.trip;
assert.equal(overseasTrip.days.length, 5, "overseas forward fixture must contain five days");
assert.equal(overseasTrip.pois.length, 30, "overseas forward fixture must contain thirty POIs");
assert.deepEqual(
  [...new Set(overseasTrip.pois.map((poi) => poi.tripRole).filter(Boolean))].sort(),
  ["hotel", "meal", "transit"],
  "overseas fixture must exercise hotel, meal, and transit roles",
);

const sevenStopDay = overseasTrip.days.find((day) => day.id === "day-1-seven-stop");
assert.equal(sevenStopDay?.routeStops.length, 7, "overseas fixture must contain one seven-stop day");
const sevenStopHandoffs = TripMapDelivery.buildDayHandoffs(sevenStopDay, overseasTrip.pois, {
  region: "OVERSEAS",
  source: "interactive-trip-planner-forward",
});
const googleRoutes = sevenStopHandoffs.routeLinks.filter((link) => link.provider === "google");
assert.equal(googleRoutes.length, 2, "seven stops must split into two reliable Google directions URLs");
assert.deepEqual(googleRoutes.map((link) => link.poiIds), [
  ["overseas-01", "overseas-02", "overseas-03", "overseas-04", "overseas-05"],
  ["overseas-05", "overseas-06", "overseas-07"],
]);
for (const link of googleRoutes) {
  const waypoints = parseUrl(link.url).searchParams.get("waypoints");
  assert.ok((waypoints ? waypoints.split("|").length : 0) <= 3);
}
assert.equal(googleRoutes[0].poiIds.at(-1), googleRoutes[1].poiIds[0]);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trip-map-delivery-forward-"));
try {
  const guideRoot = path.join(tempRoot, "public-guide");
  const outputRoot = path.join(tempRoot, "google-my-maps");
  writeJson(path.join(guideRoot, "data/pois.json"), overseasTrip.pois);
  writeJson(path.join(guideRoot, "data/itinerary.json"), overseasTrip.days);

  const exported = spawnSync(process.execPath, [
    exportCli,
    "--guide", guideRoot,
    "--output", outputRoot,
    "--locale", "en",
  ], {
    encoding: "utf8",
    env: { ...process.env, ...fakeSecrets },
  });
  assert.equal(exported.status, 0, exported.stdout + exported.stderr);
  assert.equal(exported.stderr, "");
  assert.deepEqual(JSON.parse(exported.stdout), {
    status: "ok",
    files: ["README.md", "places.csv", "itinerary.kml"],
    counts: { places: 30, kmlPlacemarks: 30, manualLocation: 0 },
  });

  const files = Object.fromEntries(
    ["README.md", "places.csv", "itinerary.kml"].map((name) => [
      name,
      fs.readFileSync(path.join(outputRoot, name), "utf8"),
    ]),
  );
  assert.equal(files["places.csv"].trimEnd().split("\n").length, 31);
  assert.equal(countMatches(files["places.csv"], /,"Formal route",/g), 24);
  assert.equal(countMatches(files["places.csv"], /,"Candidate",/g), 6);
  for (const poi of overseasTrip.pois) {
    assert.match(files["places.csv"], new RegExp(`"${poi.name}"`));
  }
  assert.equal(countMatches(files["itinerary.kml"], /<Placemark>/g), 30);
  assert.equal(countMatches(files["itinerary.kml"], /<Folder>/g), 6);
  assert.doesNotMatch(
    files["itinerary.kml"],
    /<LineString>/,
    "unverified itinerary data must not be serialized as road geometry",
  );

  assertNoFakeSecrets(daliHandoffs, "Dali handoffs");
  assertNoFakeSecrets(sevenStopHandoffs, "Google handoffs");
  assertNoFakeSecrets(exported.stdout + exported.stderr, "export CLI output");
  assertNoFakeSecrets(files, "My Maps files");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("map delivery forward coverage passed");
