#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTasteRegistry } from "./taste-model-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const modelRoot = path.join(skillRoot, "assets", "taste-models");
const requiredFiles = ["model.json", "manifesto.md", "source-policy.json", "visual-profile.json", "visual-references.md"];
const prohibitedKeys = new Set(["coverage", "confidence", "maturity"]);
const executableExtension = /\.(?:js|mjs|cjs|ts|py|sh|bash|zsh|html)$/i;
const sensitivePatterns = [
  /\/Users\/[^/\s]+/i,
  /\b(?:AMAP_KEY|AMAP_SECURITY_KEY)\s*[:=]\s*\S+/i,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
  /\b(?:order|booking|ticket)[-_ ]?(?:id|number)\s*[:=]\s*\S+/i,
];

function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}

const registry = loadTasteRegistry({ skillRoot });
assert.equal(registry.schemaVersion, "0.1.0");
assert.equal(registry.models.length, 2);
for (const entry of registry.models) {
  const directory = path.join(modelRoot, entry.path);
  for (const file of requiredFiles) assert.ok(fs.existsSync(path.join(directory, file)), entry.id + " missing " + file);
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.isFile()) assert.ok(!executableExtension.test(item.name), entry.id + " contains executable " + item.name);
  }
  walk(entry.model, (key) => assert.ok(!prohibitedKeys.has(key), entry.id + " uses prohibited key " + key));
  assert.equal(entry.model.owner.confirmed, true);
  assert.equal(entry.model.license.content, "CC-BY-4.0");
  assert.ok(entry.model.representativeTrips.length >= 1);
  const visual = JSON.parse(fs.readFileSync(path.join(directory, "visual-profile.json"), "utf8"));
  assert.ok(visual.keywords.length >= 3 && visual.keywords.length <= 5);
  const publicText = requiredFiles.map((file) => fs.readFileSync(path.join(directory, file), "utf8")).join("\n");
  for (const pattern of sensitivePatterns) assert.doesNotMatch(publicText, pattern, entry.id + " privacy scan found " + pattern);
}
console.log(registry.models.length + " official taste models validated");
