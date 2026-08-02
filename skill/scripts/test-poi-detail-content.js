#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate-trip-data.js");

function basePoi(id) {
  return {
    id,
    name: `Place ${id}`,
    name_zh: `地点 ${id}`,
    city: "Test City",
    area: "Test Area",
    category: "sight",
    priority: "preferred",
    coords: [41.38, 2.16],
    note: "Concise fallback",
    plan: "Same-area plan",
    tip: "Recheck facts",
    source: "official-source",
  };
}

function runValidation(pois) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "poi-detail-content-"));
  const poisPath = path.join(fixtureDir, "pois.json");
  const itineraryPath = path.join(fixtureDir, "itinerary.json");
  fs.writeFileSync(poisPath, JSON.stringify(pois));
  fs.writeFileSync(itineraryPath, "[]");
  const result = spawnSync(process.execPath, [validator, "--pois", poisPath, "--itinerary", itineraryPath], {
    encoding: "utf8",
  });
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  return { status: result.status, output: result.stdout + result.stderr };
}

const validDeep = {
  ...basePoi("deep"),
  contentTier: "deep",
  whyWorthIt: "Distinct enough to earn time in the route.",
  detailSections: [
    { title: "What to do", items: ["Observe the main hall", "Buy one local snack"] },
    { title: "The story", body: "A verified piece of place-specific history." },
  ],
};
const validStandard = {
  ...basePoi("standard"),
  contentTier: "standard",
  whyWorthIt: "A useful supporting stop.",
  detailSections: [{ title: "What to order", items: ["The local specialty"] }],
};
const validCompact = { ...basePoi("compact"), contentTier: "compact" };
const validLegacy = basePoi("legacy");

assert.equal(
  runValidation([validLegacy, validDeep, validStandard, validCompact]).status,
  0,
  "legacy and valid tiered POIs should pass",
);

for (const [label, poi, expected] of [
  ["unknown tier", { ...basePoi("bad-tier"), contentTier: "verbose" }, /invalid contentTier/],
  ["deep why", { ...validDeep, id: "deep-no-why", name: "Deep no why", name_zh: "缺理由", whyWorthIt: " " }, /deep content requires whyWorthIt/],
  ["deep sections", { ...validDeep, id: "deep-one-section", name: "Deep one", name_zh: "一段", detailSections: validDeep.detailSections.slice(0, 1) }, /deep content requires 2-4 detailSections/],
  ["standard sections", { ...validStandard, id: "standard-three", name: "Standard three", name_zh: "三段", detailSections: [...validDeep.detailSections, { title: "Extra", body: "Too much" }] }, /standard content allows at most 2 detailSections/],
  ["compact sections", { ...validCompact, id: "compact-sections", name: "Compact sections", name_zh: "简洁多段", detailSections: [{ title: "Should not exist", body: "Too much" }] }, /compact content must omit detailSections/],
  ["blank title", { ...validDeep, id: "blank-title", name: "Blank title", name_zh: "空标题", detailSections: [{ title: " ", body: "Content" }, validDeep.detailSections[1]] }, /detailSections\[0\] missing title/],
  ["empty content", { ...validDeep, id: "empty-content", name: "Empty content", name_zh: "空内容", detailSections: [{ title: "Empty", body: " ", items: [] }, validDeep.detailSections[1]] }, /detailSections\[0\] needs body or 1-5 items/],
  ["too many items", { ...validDeep, id: "many-items", name: "Many items", name_zh: "太多条目", detailSections: [{ title: "Too many", items: ["1", "2", "3", "4", "5", "6"] }, validDeep.detailSections[1]] }, /detailSections\[0\] needs body or 1-5 items/],
]) {
  const result = runValidation([poi]);
  assert.notEqual(result.status, 0, `${label} should fail`);
  assert.match(result.output, expected, `${label} should explain the contract failure`);
}

console.log("POI detail content contract passed");
