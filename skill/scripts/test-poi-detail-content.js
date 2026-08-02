#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate-trip-data.js");
const publicMapPath = path.resolve(scriptDir, "..", "assets", "guide-template-europe-public", "maps", "itinerary-map.html");

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
const validMarketDeep = {
  ...basePoi("market-deep"),
  category: "market",
  contentTier: "deep",
  whyWorthIt: "A market stop that explains a distinctive local pantry through resident use.",
  detailSections: [
    { title: "What to look for", items: ["Look for salted cod used in family stews.", "Ask which late-autumn mushrooms are in today instead of assuming stock."] },
    { title: "Local pantry", body: "The stall mix connects preserved fish and seasonal mushrooms to everyday resident cooking." },
  ],
};
const marketDeepFixtureCopy = JSON.stringify(validMarketDeep);
assert.match(marketDeepFixtureCopy, /salted cod used in family stews/i, "market fixture needs a distinctive dish or resident-use signal");
assert.match(marketDeepFixtureCopy, /(?:look|ask)[^\\"]*(?:autumn|today)/i, "market fixture needs seasonal look or ask wording");

assert.equal(
  runValidation([validLegacy, validDeep, validStandard, validCompact, validMarketDeep]).status,
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

const publicMapHtml = fs.readFileSync(publicMapPath, "utf8");
const evidenceRuntimeMatch = publicMapHtml.match(/\/\* POI_EVIDENCE_RUNTIME_START \*\/([\s\S]*?)\/\* POI_EVIDENCE_RUNTIME_END \*\//);
assert.ok(evidenceRuntimeMatch, "public map must expose the shipped POI evidence renderer for executable contract tests");
const evidenceSandbox = { URL };
vm.runInNewContext(
  `${evidenceRuntimeMatch[1]}\nthis.renderPoiEvidence = renderPoiEvidence; this.renderPoiSourceEvidence = renderPoiSourceEvidence;`,
  evidenceSandbox,
);

assert.equal(evidenceSandbox.renderPoiEvidence({ evidenceSources: [] }), "", "missing evidence must render nothing");
assert.equal(evidenceSandbox.renderPoiEvidence({}), "", "legacy POIs without evidence must render nothing in the evidence renderer");

const renderedEvidence = evidenceSandbox.renderPoiEvidence({
  evidenceSources: [
    {
      title: "Sample <official> source",
      url: "https://example.com/place?next=<unsafe>",
      type: "editorial",
      role: "recommendation",
      language: "es",
      supports: ["identity", "visit"],
      checkedAt: "2026-08-02<script>",
      status: "confirmed",
    },
  ],
});
assert.match(renderedEvidence, /^\s*<details class="poi-evidence">/);
assert.match(renderedEvidence, /<span class="poi-evidence-count">1<\/span>/);
assert.match(renderedEvidence, /西语餐饮媒体 · 推荐品类/);
assert.match(renderedEvidence, /target="_blank" rel="noopener noreferrer"/);
assert.match(renderedEvidence, /href="https:\/\/example\.com\/place\?next=%3Cunsafe%3E"/);
assert.match(renderedEvidence, /Sample &lt;official&gt; source/);
assert.match(renderedEvidence, /2026-08-02&lt;script&gt; 复核/);
assert.doesNotMatch(renderedEvidence, /<script>|<official>/);

const unsafeEvidence = evidenceSandbox.renderPoiEvidence({
  evidenceSources: [{
    title: "Unsafe source",
    url: "javascript:alert(1)",
    type: "official",
    role: "fact",
    language: "en",
    checkedAt: "2026-08-02",
  }],
});
assert.equal(unsafeEvidence, "", "renderer must discard non-HTTP(S) evidence URLs even if malformed data reaches the browser");

const legacyFallback = evidenceSandbox.renderPoiSourceEvidence({ source: "Legacy <source> text" });
assert.match(legacyFallback, /<h2>资料线索<\/h2>/);
assert.match(legacyFallback, /Legacy &lt;source&gt; text/);
assert.doesNotMatch(legacyFallback, /<source>/);
const structuredEvidenceWins = evidenceSandbox.renderPoiSourceEvidence({
  source: "Legacy text must stay hidden",
  evidenceSources: [{
    title: "Current source",
    url: "https://example.com/current",
    type: "official",
    role: "fact",
    language: "en",
    checkedAt: "2026-08-02",
  }],
});
assert.match(structuredEvidenceWins, /Current source/);
assert.doesNotMatch(structuredEvidenceWins, /Legacy text must stay hidden/);
assert.equal(evidenceSandbox.renderPoiSourceEvidence({}), "");

console.log("POI detail content contract passed");
