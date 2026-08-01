#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceRegistry } from "./source-pack-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.join(skillRoot, "assets", "source-packs");
const requiredPackIds = ["global-base", "china-mainland", "japan", "france-belgium"];
const requiredIntents = [
  "date-bound-events",
  "local-food-structure",
  "seasonal-produce",
  "markets-traditional-commerce",
  "community-third-places",
  "arts-music-nightlife",
  "craft-industry-migration",
  "family-low-energy-rain-accessibility",
  "current-disruptions-risks",
  "taste-specific-discovery",
];
const requiredRoles = ["official-fact", "local-context", "spatial-search"];
const prohibitedKeys = new Set(["coverage", "confidence", "maturity"]);
const sensitivePatterns = [
  /\/Users\/[^/\s]+/i,
  /\b(?:AMAP_KEY|AMAP_SECURITY_KEY)\s*[:=]\s*\S+/i,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
];

function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}

const registry = loadSourceRegistry({ skillRoot });
assert.deepEqual(registry.packs.map((entry) => entry.id), requiredPackIds);
for (const entry of registry.packs) {
  const pack = entry.pack;
  assert.equal(pack.id, entry.id);
  assert.equal(pack.version, "0.1.0");
  assert.deepEqual(pack.languageStrategy.required, ["zh", "en", "destination-local"]);
  assert.deepEqual(pack.queryIntents.map((intent) => intent.id), requiredIntents);
  const roles = new Set(pack.sources.flatMap((source) => source.roles));
  for (const role of requiredRoles) assert.ok(roles.has(role), pack.id + " missing " + role);
  assert.ok(pack.sources.some((source) => source.kind === "local-editorial"), pack.id + " needs named editorial");
  for (const source of pack.sources) {
    assert.ok(registry.accessClasses.includes(source.access.class));
    assert.ok(source.access.searchMethod && source.access.agentAccess);
    assert.ok(source.access.fallback.length);
    assert.ok(source.factBoundary.canSupport.length && source.factBoundary.cannotProve.length);
    assert.match(source.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.limitations.length);
    assert.ok(!/^(当地媒体|local media)$/i.test(source.name));
  }
  walk(pack, (key) => assert.ok(!prohibitedKeys.has(key), pack.id + " uses prohibited key " + key));
  const publicText = fs.readFileSync(path.join(sourceRoot, entry.path), "utf8");
  for (const pattern of sensitivePatterns) assert.doesNotMatch(publicText, pattern, pack.id + " privacy scan found " + pattern);
}
console.log(registry.packs.length + " regional source packs validated");
