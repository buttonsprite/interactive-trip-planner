#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(process.argv[2] || path.join(scriptDir, ".."));
const scriptsDir = path.join(skillRoot, "scripts");
const mapProviderDeliveryPath = path.join(skillRoot, "references", "map-provider-delivery.md");

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

assert.ok(fs.existsSync(path.join(skillRoot, "SKILL.md")), `Missing SKILL.md: ${skillRoot}`);
assert.ok(fs.existsSync(scriptsDir), `Missing scripts directory: ${scriptsDir}`);
assert.ok(fs.existsSync(mapProviderDeliveryPath), "Missing map provider delivery online logic");

const packageJsonPath = path.join(skillRoot, "package.json");
assert.ok(fs.existsSync(packageJsonPath), "Missing package.json required for ESM .js scripts");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
assert.equal(packageJson.type, "module", 'package.json must declare "type": "module"');
assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "Skill package must identify a semantic release version");

const publicMapPath = path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "itinerary-map.html");
const publicDeliveryPath = path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "assets", "trip-map-delivery.js");
const canonicalDeliveryPath = path.join(skillRoot, "assets", "guide-template", "maps", "assets", "trip-map-delivery.js");
for (const requiredPath of [publicMapPath, publicDeliveryPath, canonicalDeliveryPath]) {
  assert.ok(fs.existsSync(requiredPath), `Missing public map delivery file: ${requiredPath}`);
}
assert.equal(
  fs.readFileSync(publicDeliveryPath, "utf8"),
  fs.readFileSync(canonicalDeliveryPath, "utf8"),
  "public delivery runtime must match the canonical runtime",
);
const publicMapHtml = fs.readFileSync(publicMapPath, "utf8");
const publicDeliveryReferences = (publicMapHtml.match(/<script src="\.\/assets\/trip-map-delivery\.js"><\/script>/g) || []).length;
const publicDeliveryMarkers = (publicMapHtml.match(/REDSkill embedded public trip-map-delivery\.js/g) || []).length;
assert.equal(publicDeliveryReferences + publicDeliveryMarkers, 1, "public map must contain exactly one delivery runtime");
assert.equal((publicMapHtml.match(/id="open-map-export"/g) || []).length, 1, "public map must contain one export entry");
assert.equal((publicMapHtml.match(/id="map-export-dialog"/g) || []).length, 1, "public map must contain one export dialog");
if (publicDeliveryMarkers) {
  assert.equal(publicDeliveryReferences, 0, "built public map must not retain an external delivery runtime");
  assert.ok(
    publicMapHtml.indexOf("REDSkill embedded public trip-map-delivery.js") < publicMapHtml.indexOf("const PUBLIC_TRIP_DATA ="),
    "built public runtime must load before the public application script",
  );
}

const requiredDiscoveryRuntimeFiles = [
  "scripts/test-first-visit-balance.js",
  "scripts/cli-json-input.js",
  "scripts/recommend-taste-models.js",
  "scripts/build-source-query-matrix.js",
  "scripts/test-discovery-cli.js",
  "scripts/probe-source-access.js",
  "scripts/test-source-access-probe.js",
  "assets/source-packs/local-language-lexicons/es.json",
  "assets/source-packs/local-language-lexicons/ca.json",
];
const missingDiscoveryRuntimeFiles = requiredDiscoveryRuntimeFiles.filter(
  (relativePath) => !fs.existsSync(path.join(skillRoot, relativePath)),
);
assert.deepEqual(
  missingDiscoveryRuntimeFiles,
  [],
  `REDSkill release is missing discovery runtime files: ${missingDiscoveryRuntimeFiles.join(", ")}`,
);

const requiredMapDeliveryFiles = [
  "scripts/amap-cli.js",
  "scripts/amap-cli-runtime.js",
  "scripts/check-amap-cli.js",
  "scripts/export-google-my-maps.js",
  "references/map-provider-delivery.md",
];
assert.deepEqual(
  requiredMapDeliveryFiles.filter((relativePath) => !fs.existsSync(path.join(skillRoot, relativePath))),
  [],
  "REDSkill release is missing map provider delivery files",
);

const mapDeliveryDocs = [
  fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8"),
  fs.readFileSync(mapProviderDeliveryPath, "utf8"),
  fs.readFileSync(path.join(skillRoot, "references", "user-facing-language.md"), "utf8"),
  fs.readFileSync(path.join(skillRoot, "assets", "guide-template", "docs", "online-logic", "map.md"), "utf8"),
].join("\n");
for (const phrase of [
  "amap-cli.js",
  "AMAP_KEY",
  "AMAP_SECURITY_KEY",
  "未完成高德路网复核",
  "AMap road-network verification was not completed",
  "Google Maps URLs 不需要 API Key",
  "Google Maps URLs do not require an API key",
  "places.csv",
  "itinerary.kml",
  "不会自动写入普通 Google Maps 收藏夹",
  "not automatically added to regular Google Maps saved lists",
]) {
  assert.ok(mapDeliveryDocs.includes(phrase), `Map delivery docs are missing: ${phrase}`);
}
assert.match(mapDeliveryDocs, /不调用 Google Places API/);
assert.match(mapDeliveryDocs, /不调用 Google Routes API/);
assert.match(mapDeliveryDocs, /does not call Google Places API/);
assert.match(mapDeliveryDocs, /does not call Google Routes API/);

const requiredXiaohongshuFiles = [
  "scripts/xhs-import-runtime.js",
  "scripts/fetch-xhs-public.js",
  "scripts/xhs-library-runtime.js",
  "scripts/import-xhs-library.js",
  "scripts/validate-xhs-library.js",
  "scripts/summarize-xhs-import.js",
  "scripts/test-xhs-import-runtime.js",
  "scripts/test-xhs-public-fetch.js",
  "scripts/test-xhs-library.js",
  "scripts/test-xhs-import-cli.js",
  "references/xiaohongshu-import.md",
  "assets/xiaohongshu-library-template/README.md",
  "assets/xiaohongshu-library-template/library.json",
];
const missingXiaohongshuFiles = requiredXiaohongshuFiles.filter(
  (relativePath) => !fs.existsSync(path.join(skillRoot, relativePath)),
);
assert.deepEqual(
  missingXiaohongshuFiles,
  [],
  `REDSkill release is missing Xiaohongshu import files: ${missingXiaohongshuFiles.join(", ")}`,
);

const scriptFiles = walkFiles(scriptsDir);
const unsupportedScripts = scriptFiles
  .filter((file) => path.extname(file) !== ".js")
  .map((file) => path.relative(skillRoot, file));
assert.deepEqual(
  unsupportedScripts,
  [],
  `RedSkill publish scripts must use .js: ${unsupportedScripts.join(", ")}`,
);

const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".txt"]);
const referencedScripts = new Set();
const staleMjsReferences = [];
const legacyModuleExtension = [".m", "js"].join("");

for (const file of walkFiles(skillRoot)) {
  if (!textExtensions.has(path.extname(file))) continue;
  const relative = path.relative(skillRoot, file);
  const content = fs.readFileSync(file, "utf8");
  if (content.includes(legacyModuleExtension)) staleMjsReferences.push(relative);
  for (const match of content.matchAll(/scripts\/[A-Za-z0-9._/-]+\.js\b/g)) {
    referencedScripts.add(match[0]);
  }
}

assert.deepEqual(
  staleMjsReferences,
  [],
  `Stale legacy module references remain in: ${staleMjsReferences.join(", ")}`,
);

const missingReferences = [...referencedScripts].filter(
  (reference) => !fs.existsSync(path.join(skillRoot, reference)),
);
assert.deepEqual(
  missingReferences,
  [],
  `Referenced scripts are missing: ${missingReferences.join(", ")}`,
);

console.log(
  `RedSkill package contract OK: ${scriptFiles.length} .js scripts, ${referencedScripts.size} documented script references.`,
);
