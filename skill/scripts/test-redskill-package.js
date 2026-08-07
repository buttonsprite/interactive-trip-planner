#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(process.argv[2] || path.join(scriptDir, ".."));
const scriptsDir = path.join(skillRoot, "scripts");
const mapProviderDeliveryPath = path.join(skillRoot, "references", "map-provider-delivery.md");

const routeStatusCopy = [
  "已用高德复核 / Verified with AMap",
  "部分移动段已复核 / Partially verified",
  "未完成高德路网复核；请在出发前打开高德确认。 / AMap road-network verification was not completed. Recheck in AMap before departure.",
];

function assertIncludesAll(label, document, phrases) {
  for (const phrase of phrases) {
    assert.ok(document.includes(phrase), `${label} is missing: ${phrase}`);
  }
}

function assertNoUnsupportedProviderClaims(label, document) {
  const clauses = document.split(/[。；\n]+/).map((clause) => clause.trim()).filter(Boolean);
  for (const clause of clauses) {
    const mentionsGoogleApi = /Google (?:Places|Routes) API/i.test(clause);
    const claimsApiAction = /调用 Google (?:Places|Routes) API/i.test(clause)
      || /\b(?:calls?|uses?|invokes?) (?:the )?Google (?:Places|Routes) API\b/i.test(clause);
    const negatesApiAction = /(?:不|未|不会|不能|不得|绝不|没有)[^，,]{0,8}调用 Google (?:Places|Routes) API/i.test(clause)
      || /\b(?:does not|doesn't|do not|never) (?:call|use|invoke) (?:the )?Google (?:Places|Routes) API\b/i.test(clause);
    if (mentionsGoogleApi && claimsApiAction && !negatesApiAction) {
      assert.fail(`${label} contains an unsupported positive Google API claim: ${clause}`);
    }

    const mentionsSavedSurface = /高德收藏夹|Google Maps (?:收藏夹|Saved Lists?|saved lists?)|AMap favorites?/i.test(clause);
    const claimsAutomaticSync = /自动[^，,]{0,20}(?:写入|导入|同步|更新)/i.test(clause)
      || /automatically (?:adds?|added|imports?|imported|writes?|written|syncs?|synced|updates?|updated)/i.test(clause);
    const negatesAutomaticSync = /(?:不|未|不会|不能|不得|绝不|没有)[^，,]{0,8}自动/i.test(clause)
      || /\b(?:does not|doesn't|do not|never|is not|are not|will not|won't) automatically\b/i.test(clause);
    if (mentionsSavedSurface && claimsAutomaticSync && !negatesAutomaticSync) {
      assert.fail(`${label} contains an unsupported positive account-sync claim: ${clause}`);
    }
  }
}

assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "positive-claim fixture",
    "This source calls Google Routes API.",
  ),
  /unsupported positive/,
  "positive provider claims must fail the packaged document contract",
);
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "positive-sync fixture",
    "This source automatically adds places to AMap favorites.",
  ),
  /unsupported positive/,
  "positive account-sync claims must fail the packaged document contract",
);
assert.doesNotThrow(
  () => assertNoUnsupportedProviderClaims(
    "negative-claim fixture",
    "This source does not call Google Routes API and never automatically adds places to AMap favorites.",
  ),
  "negative boundary copy must not be mistaken for an unsupported claim",
);

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

const packagedProviderDocs = {
  "SKILL.md": fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8"),
  "map-provider-delivery.md": fs.readFileSync(mapProviderDeliveryPath, "utf8"),
  "planning-workflow.md": fs.readFileSync(path.join(skillRoot, "references", "planning-workflow.md"), "utf8"),
  "regional-source-packs.md": fs.readFileSync(path.join(skillRoot, "references", "regional-source-packs.md"), "utf8"),
  "taste-and-source-online-logic.md": fs.readFileSync(
    path.join(skillRoot, "references", "taste-and-source-online-logic.md"),
    "utf8",
  ),
  "user-facing-language.md": fs.readFileSync(path.join(skillRoot, "references", "user-facing-language.md"), "utf8"),
  "guide-template map online logic": fs.readFileSync(
    path.join(skillRoot, "assets", "guide-template", "docs", "online-logic", "map.md"),
    "utf8",
  ),
};

assertIncludesAll("SKILL.md", packagedProviderDocs["SKILL.md"], [
  "amap-gui start",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "provider-error",
  "前 10 个",
  "不会自动拆分",
  "第 11 个",
  "places.csv",
  "itinerary.kml",
  ...routeStatusCopy,
]);
assertIncludesAll("map-provider-delivery.md", packagedProviderDocs["map-provider-delivery.md"], [
  "amap-gui start",
  "amap-gui status",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "进程会读取继承环境中的值",
  "provider-error",
  "前 10 个",
  "不会自动拆分",
  "第 11 个",
  "places.csv",
  "itinerary.kml",
  ...routeStatusCopy,
]);
assertIncludesAll("planning-workflow.md", packagedProviderDocs["planning-workflow.md"], [
  "amap-gui start",
  "check-amap-cli.js",
  "provider-error",
  ...routeStatusCopy,
]);
assertIncludesAll("regional-source-packs.md", packagedProviderDocs["regional-source-packs.md"], [
  "amap-gui start",
  "check-amap-cli.js",
  "provider-error",
]);
assertIncludesAll(
  "taste-and-source-online-logic.md",
  packagedProviderDocs["taste-and-source-online-logic.md"],
  [
    "amap-gui start",
    "check-amap-cli.js",
    "不会确认高德服务容器正在运行",
    "执行进程会读取继承环境中的密钥值",
    "provider-error",
  ],
);
assertIncludesAll("user-facing-language.md", packagedProviderDocs["user-facing-language.md"], [
  "amap-gui start",
  "amap-gui status",
  "不会确认高德服务容器正在运行",
  "已用高德复核",
  "Verified with AMap",
  "部分移动段已复核",
  "Partially verified",
  "未完成高德路网复核；请在出发前打开高德确认。",
  "AMap road-network verification was not completed. Recheck in AMap before departure.",
]);
assertIncludesAll(
  "guide-template map online logic",
  packagedProviderDocs["guide-template map online logic"],
  ["前 10 个", "不会自动拆分", "第 11 个", ...routeStatusCopy],
);

for (const [label, document] of Object.entries(packagedProviderDocs)) {
  assertNoUnsupportedProviderClaims(label, document);
}

const mapDeliveryDocs = Object.values(packagedProviderDocs).join("\n");
assertIncludesAll("packaged provider docs", mapDeliveryDocs, [
  "amap-cli.js",
  "AMAP_KEY",
  "AMAP_SECURITY_KEY",
  "Google Maps URLs 不需要 API Key",
  "Google Maps URLs do not require an API key",
  "不会自动写入普通 Google Maps 收藏夹",
  "not automatically added to regular Google Maps saved lists",
]);

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
