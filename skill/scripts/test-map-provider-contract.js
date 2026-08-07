#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate-trip-data.js");

const amapPoi = {
  id: "dali-market",
  name: "大理北门市场",
  city: "大理",
  area: "大理古城",
  category: "local-life",
  priority: "preferred",
  coords: [25.7001, 100.1602],
  note: "早市与居民采购场景。",
  mapProviderRefs: {
    amap: {
      status: "resolved",
      poiId: "B0FFTEST01",
      name: "北门市场",
      address: "云南省大理白族自治州大理市",
      position: { lng: 100.1602, lat: 25.7001, system: "gcj02" },
      checkedAt: "2026-08-06"
    }
  }
};

const verifiedSegment = {
  fromPoiId: "dali-hotel",
  toPoiId: "dali-market",
  mode: "walking",
  minutes: 14,
  distanceMeters: 980,
  label: "步行约 14 分钟",
  routeStatus: "verified",
  routeProvider: "amap",
  routeReviewedAt: "2026-08-06"
};

function canonicalPoi(poi) {
  return {
    ...poi,
    name_zh: poi.name,
    plan: "作为安全的 contract fixture。",
    tip: "不包含真实旅行数据。",
    source: "test-fixture",
  };
}

const hotelPoi = canonicalPoi({
  id: "dali-hotel",
  name: "大理住宿基底",
  city: "大理",
  area: "大理古城",
  category: "hotel",
  priority: "must",
  coords: [25.695, 100.165],
  note: "仅用于验证相邻路线段。",
});

function validGuide({ market = amapPoi, segment = verifiedSegment, status = "verified" } = {}) {
  return {
    pois: [hotelPoi, canonicalPoi(market)],
    itinerary: [{
      id: "day-1",
      date: "2026-08-06",
      routeStops: [
        { poiId: "dali-hotel", order: 1 },
        { poiId: "dali-market", order: 2 },
      ],
      transitSegments: [segment],
      routeReview: { status },
    }],
  };
}

function runValidation(fixture) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "map-provider-contract-"));
  const poisPath = path.join(fixtureDir, "pois.json");
  const itineraryPath = path.join(fixtureDir, "itinerary.json");
  fs.writeFileSync(poisPath, JSON.stringify(fixture.pois));
  fs.writeFileSync(itineraryPath, JSON.stringify(fixture.itinerary));
  const result = spawnSync(process.execPath, [validator, "--pois", poisPath, "--itinerary", itineraryPath], {
    encoding: "utf8",
  });
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  return { status: result.status, output: result.stdout + result.stderr };
}

const validResult = runValidation(validGuide());
assert.equal(validResult.status, 0, validResult.output);

for (const [label, market, expected] of [
  ["missing poiId", { ...amapPoi, mapProviderRefs: { amap: { ...amapPoi.mapProviderRefs.amap, poiId: "" } } }, /resolved AMap ref requires poiId/],
  ["non-gcj02 position", { ...amapPoi, mapProviderRefs: { amap: { ...amapPoi.mapProviderRefs.amap, position: { ...amapPoi.mapProviderRefs.amap.position, system: "wgs84" } } } }, /AMap position must use gcj02/],
  ["missing checkedAt", { ...amapPoi, mapProviderRefs: { amap: { ...amapPoi.mapProviderRefs.amap, checkedAt: "" } } }, /resolved AMap ref requires checkedAt/],
]) {
  const result = runValidation(validGuide({ market }));
  assert.notEqual(result.status, 0, `${label} must fail validation`);
  assert.match(result.output, expected, `${label} must explain the rejected provider ref`);
}

for (const [label, segment, expected] of [
  ["missing provider", { ...verifiedSegment, routeProvider: "" }, /verified transit segment requires routeProvider/],
  ["missing distance", { ...verifiedSegment, distanceMeters: undefined }, /verified transit segment requires positive distanceMeters/],
  ["missing review date", { ...verifiedSegment, routeReviewedAt: "" }, /verified transit segment requires routeReviewedAt/],
]) {
  const result = runValidation(validGuide({ segment }));
  assert.notEqual(result.status, 0, `${label} must fail validation`);
  assert.match(result.output, expected, `${label} must explain the rejected verified segment`);
}

const unverifiedDayResult = runValidation(validGuide({
  segment: { ...verifiedSegment, routeStatus: "unverified" },
  status: "verified",
}));
assert.notEqual(unverifiedDayResult.status, 0, "a verified day must reject an unverified required segment");
assert.match(unverifiedDayResult.output, /routeReview\.status verified requires verified transit segment/);

console.log("map provider verification contract passed");
