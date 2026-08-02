#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate-trip-events.js");

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
  sourceIds: ["event-source"],
};

const validHosted = {
  ...validVenue,
  id: "market-workshop",
  scope: "hosted",
  status: "announced",
  hostPoiId: "market",
  venuePoiId: undefined,
  startsAt: "2026-10-15",
  endsAt: "2026-10-15",
};

const validCitywide = {
  ...validVenue,
  id: "parade",
  scope: "citywide",
  status: "program-pending",
  routeImpact: "avoidance",
  startsAt: "2026-10-17",
  endsAt: "2026-10-18",
  venuePoiId: undefined,
};

const validHistoricalLead = {
  ...validCitywide,
  id: "past-fair",
  status: "historical-lead",
  routeImpact: "nearby",
};

function runValidation(events, itinerary = []) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "trip-event-contract-"));
  const paths = {
    events: path.join(fixtureDir, "events.json"),
    pois: path.join(fixtureDir, "pois.json"),
    itinerary: path.join(fixtureDir, "itinerary.json"),
    sources: path.join(fixtureDir, "sources.json"),
  };
  fs.writeFileSync(paths.events, JSON.stringify(events));
  fs.writeFileSync(paths.pois, JSON.stringify([{ id: "venue" }, { id: "market" }]));
  fs.writeFileSync(paths.itinerary, JSON.stringify(itinerary));
  fs.writeFileSync(paths.sources, JSON.stringify([{ id: "event-source" }]));
  const result = spawnSync(process.execPath, [
    validator,
    "--events", paths.events,
    "--pois", paths.pois,
    "--itinerary", paths.itinerary,
    "--sources", paths.sources,
  ], { encoding: "utf8" });
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  return { status: result.status, output: result.stdout + result.stderr };
}

const valid = runValidation([validVenue, validHosted, validCitywide, validHistoricalLead]);
assert.equal(valid.status, 0, valid.output);
const summary = JSON.parse(valid.output);
assert.equal(summary.eventCount, 4);
assert.deepEqual(summary.scopes, { citywide: 2, hosted: 1, venue: 1 });
assert.deepEqual(summary.statuses, { announced: 1, confirmed: 1, "historical-lead": 1, "program-pending": 1 });
assert.deepEqual(summary.warnings, []);
assert.deepEqual(summary.errors, []);

for (const [label, events, itinerary, expected] of [
  ["unknown scope", [{ ...validVenue, scope: "district" }], [], /invalid scope: district/],
  ["unknown status", [{ ...validVenue, status: "booked" }], [], /invalid status: booked/],
  ["unknown route impact", [{ ...validVenue, routeImpact: "detour" }], [], /invalid routeImpact: detour/],
  ["duplicate id", [validVenue, { ...validVenue, name: "Duplicate concert" }], [], /Duplicate event id: concert/],
  ["missing official URL", [{ ...validVenue, officialUrl: "" }], [], /missing officialUrl/],
  ["missing source id", [{ ...validVenue, sourceIds: [] }], [], /missing sourceIds/],
  ["missing host", [{ ...validHosted, hostPoiId: undefined }], [], /hosted event requires hostPoiId/],
  ["missing venue location", [{ ...validVenue, venuePoiId: undefined }], [], /venue event requires venuePoiId or valid coords/],
  ["missing confirmed date time", [{ ...validVenue, startsAt: "2026-10-18", endsAt: "2026-10-18" }], [], /confirmed event requires startsAt and endsAt with date and time/],
  ["impossible calendar date time", [{ ...validVenue, startsAt: "2026-02-30T19:30:00+02:00" }], [], /invalid startsAt/],
  ["impossible calendar date", [{ ...validHosted, startsAt: "2026-02-30" }], [], /invalid startsAt/],
  ["missing source record", [{ ...validVenue, sourceIds: ["missing-source"] }], [], /references missing source: missing-source/],
  ["unconfirmed itinerary event", [validHosted], [{ id: "day-1", routeStops: [{ poiId: "event:market-workshop" }] }], /event:market-workshop must reference a confirmed venue event/],
]) {
  const result = runValidation(events, itinerary);
  assert.notEqual(result.status, 0, `${label} should fail`);
  assert.match(result.output, expected, `${label} should explain the contract failure`);
}

console.log("Event data contract passed");
