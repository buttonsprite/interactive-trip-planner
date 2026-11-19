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

const credentialSetupCopy = [
  "amap-credentials.js setup",
  "amap-credentials.js status",
  "amap-credentials.js update",
  "amap-credentials.js remove",
  "macOS Keychain",
  "Windows DPAPI",
  "Linux Secret Service",
];

function assertIncludesAll(label, document, phrases) {
  for (const phrase of phrases) {
    assert.ok(document.includes(phrase), `${label} is missing: ${phrase}`);
  }
}

function assertLosslessAmapOverviewGuidance(label, document) {
  assert.match(document, /全部(?:具有安全高德定位的|安全) marker/, `${label} must preserve every safely located marker`);
  assert.match(document, /按当前顺序/, `${label} must preserve marker order`);
  assert.match(document, /(?:连续拆分|拆成多张|分成多张)/, `${label} must describe ordered overview chunks`);
  assert.match(document, /每(?:张|块)最多 10 个/, `${label} must keep every overview chunk within ten markers`);
  assert.ok(
    /路线(?:入口|链接)与地点总览(?:独立构建|分开处理|是不同能力)/.test(document)
      || (/全部地点总览/.test(document) && /路线分段/.test(document) && /Google 当天路线/.test(document)),
    `${label} must keep route chunks distinct from overview chunks`,
  );

  const activeGuidance = document.replace(/旧的“[^”]+”合同已经废弃[^。\n]*。?/g, "");
  assert.doesNotMatch(
    activeGuidance,
    /地点总览[^。\n]*(?:只包含|仅包含)[^。\n]*前\s*10\s*个/,
    `${label} must not truncate the overview to the first ten markers`,
  );
  assert.doesNotMatch(
    activeGuidance,
    /地点总览[^。\n]*不会自动拆分/,
    `${label} must not retain no-split overview guidance`,
  );
  assert.doesNotMatch(
    activeGuidance,
    /第\s*11\s*个[^。\n]*(?:不进入|手动打开)/,
    `${label} must not route safely located tail markers to a manual-only fallback`,
  );
}

function assertNoUnsupportedProviderClaims(label, document) {
  const normalizedDocument = document.replace(/[*_`]/g, "");
  const clauses = normalizedDocument.split(/[。；.!?\n]+/).map((clause) => clause.trim()).filter(Boolean);
  for (const clause of clauses) {
    for (const apiName of ["Google Places API", "Google Routes API"]) {
      const escapedApiName = apiName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const referenceSuffix = "(?:documentation|docs?|reference|specification|as\\s+(?:a\\s+)?(?:factual\\s+)?reference)";
      const claimsChineseApiAction = new RegExp(
        `调用\\s*${escapedApiName}(?!\\s*(?:文档|参考|规范))`,
        "i",
      ).test(clause);
      const negatesChineseApiAction = new RegExp(
        `(?:不|未|不会|不能|不得|绝不|没有)(?:再|会)?[^，,]{0,8}调用\\s*${escapedApiName}`,
        "i",
      ).test(clause);
      if (claimsChineseApiAction && !negatesChineseApiAction) {
        assert.fail(`${label} contains an unsupported positive Chinese ${apiName} claim: ${clause}`);
      }

      const claimsEnglishApiAction = new RegExp(
        `\\b(?:calls?|uses?|invokes?)\\s+(?:the\\s+)?${escapedApiName}\\b(?!\\s+${referenceSuffix}\\b)`,
        "i",
      ).test(clause);
      const negatesEnglishApiAction = new RegExp(
        `\\b(?:does\\s+not|doesn't|do\\s+not|never|will\\s+not|won't|cannot|can't)\\s+(?:call|use|invoke)\\s+(?:the\\s+)?${escapedApiName}\\b`,
        "i",
      ).test(clause);
      if (claimsEnglishApiAction && !negatesEnglishApiAction) {
        assert.fail(`${label} contains an unsupported positive English ${apiName} claim: ${clause}`);
      }
    }

    for (const [surfaceLabel, surfacePattern] of [
      ["Google Maps saved lists", "Google Maps\\s+(?:收藏夹|Saved Lists?|saved lists?)"],
      ["AMap favorites", "(?:高德收藏夹|AMap favorites?)"],
    ]) {
      const automaticAction = "(?:写入|导入|同步|更新)";
      const englishAutomaticAction = "(?:adds?|added|imports?|imported|writes?|written|syncs?|synced|updates?|updated)";
      const claimsChineseAutomaticSync = new RegExp(
        `自动${automaticAction}[^，,]{0,40}${surfacePattern}`,
        "i",
      ).test(clause);
      const negatesChineseAutomaticSync = new RegExp(
        `(?:不|未|不会|不能|不得|绝不|没有)(?:会)?[^，,]{0,8}自动${automaticAction}[^，,]{0,40}${surfacePattern}`,
        "i",
      ).test(clause);
      if (claimsChineseAutomaticSync && !negatesChineseAutomaticSync) {
        assert.fail(`${label} contains an unsupported positive Chinese ${surfaceLabel} claim: ${clause}`);
      }

      const claimsEnglishAutomaticSync = new RegExp(
        `automatically\\s+${englishAutomaticAction}[^,，]{0,60}${surfacePattern}`,
        "i",
      ).test(clause);
      const negatesEnglishAutomaticSync = new RegExp(
        `\\b(?:does\\s+not|doesn't|do\\s+not|never|is\\s+not|are\\s+not|will\\s+not|won't|not)\\s+automatically\\s+${englishAutomaticAction}[^,，]{0,60}${surfacePattern}`,
        "i",
      ).test(clause);
      if (claimsEnglishAutomaticSync && !negatesEnglishAutomaticSync) {
        assert.fail(`${label} contains an unsupported positive English ${surfaceLabel} claim: ${clause}`);
      }
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
  "scripts/amap-credential-backends.js",
  "scripts/amap-credential-store.js",
  "scripts/amap-credentials.js",
  "scripts/amap-credentials-runtime.js",
  "scripts/amap-provider-session.js",
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

const packagedProviderBoundaryLine = packagedProviderDocs["map-provider-delivery.md"].split("\n").find(
  (line) => line.includes("当前源码不调用 Google Places API"),
) || "";
assert.ok(packagedProviderBoundaryLine, "packaged provider docs must expose a real API boundary line for mutation coverage");
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "packaged mixed API mutation",
    packagedProviderBoundaryLine.replace(
      "当前源码不调用 Google Places API",
      "当前源码调用 Google Places API",
    ),
  ),
  /Google Places API/,
  "a Routes negation must not hide a positive Places call in packaged docs",
);
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "packaged English mixed API mutation",
    packagedProviderBoundaryLine.replace(
      "does not call Google Places API",
      "calls Google Places API",
    ),
  ),
  /Google Places API/,
  "a Chinese Places negation must not hide an English positive Places call",
);

const packagedAccountBoundaryLine = packagedProviderDocs["map-provider-delivery.md"].split("\n").find(
  (line) => line.includes("不会自动写入高德收藏夹"),
) || "";
assert.ok(packagedAccountBoundaryLine, "packaged provider docs must expose a real account boundary line for mutation coverage");
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "packaged mixed account mutation",
    packagedAccountBoundaryLine.replace("不会自动写入高德收藏夹", "会自动写入高德收藏夹"),
  ),
  /高德收藏夹/,
  "a Google Saved Lists negation must not hide positive AMap favorites writing",
);
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "packaged English mixed account mutation",
    "This export automatically adds places to Google Maps saved lists, but never automatically adds them to AMap favorites.",
  ),
  /Google Maps saved lists/,
  "an English AMap-favorites negation must not hide positive Google Maps account sync",
);

assert.doesNotThrow(
  () => assertNoUnsupportedProviderClaims(
    "packaged documentation reference fixture",
    "This workflow uses Google Places API documentation only as a factual reference and does not call Google Routes API.",
  ),
  "packaged docs may cite API documentation without claiming an API call",
);

assertIncludesAll("SKILL.md", packagedProviderDocs["SKILL.md"], [
  ...credentialSetupCopy,
  "不要让用户把密钥粘贴到聊天",
  "provider-error",
  "places.csv",
  "itinerary.kml",
  "导出全部地点并打开 My Maps",
  "导出当天地点并打开 My Maps",
  ...routeStatusCopy,
]);
assertIncludesAll("map-provider-delivery.md", packagedProviderDocs["map-provider-delivery.md"], [
  ...credentialSetupCopy,
  "request-scoped provider session",
  "环境变量是高级/CI 覆盖入口",
  "不会明文保存",
  "provider-error",
  "places.csv",
  "itinerary.kml",
  "导出全部地点并打开 My Maps",
  "导出当天地点并打开 My Maps",
  "destination",
  "不包含起点",
  ...routeStatusCopy,
]);
assertIncludesAll("planning-workflow.md", packagedProviderDocs["planning-workflow.md"], [
  ...credentialSetupCopy,
  "provider-error",
  ...routeStatusCopy,
]);
assertIncludesAll("regional-source-packs.md", packagedProviderDocs["regional-source-packs.md"], [
  ...credentialSetupCopy,
  "provider-error",
]);
assertIncludesAll(
  "taste-and-source-online-logic.md",
  packagedProviderDocs["taste-and-source-online-logic.md"],
  [
    ...credentialSetupCopy,
    "系统安全存储",
    "provider-error",
  ],
);
assertIncludesAll("user-facing-language.md", packagedProviderDocs["user-facing-language.md"], [
  ...credentialSetupCopy,
  "首次使用高德地图增强，需要完成一次安全配置",
  "当前 Linux 环境没有可用的 Secret Service",
  "已用高德复核",
  "Verified with AMap",
  "部分移动段已复核",
  "Partially verified",
  "未完成高德路网复核；请在出发前打开高德确认。",
  "AMap road-network verification was not completed. Recheck in AMap before departure.",
]);

for (const [label, document] of Object.entries(packagedProviderDocs)) {
  assert.doesNotMatch(document, /(?:每次|every use)[^\n。.]*(?:export\s+AMAP_KEY|set\s+AMAP_KEY)/i, `${label} must not require repeated environment setup`);
  assert.doesNotMatch(document, /(?:先|first)\s*(?:运行|run)\s*`?amap-gui start`?/i, `${label} must not make manual provider start the normal path`);
  assert.doesNotMatch(document, /(?:默认把?密钥?明文保存|密钥默认明文保存|默认创建明文(?:文件|配置)|默认使用\s*`?\.env)/i, `${label} must not recommend plaintext fallback`);
  assert.doesNotMatch(document, /\b(?:uses?|creates?|saves?|writes?)[^\n.]{0,40}(?:\.env|plaintext)[^\n.]{0,20}\bby default\b/i, `${label} must not recommend plaintext fallback`);
}
assertIncludesAll(
  "guide-template map online logic",
  packagedProviderDocs["guide-template map online logic"],
  routeStatusCopy,
);
assertLosslessAmapOverviewGuidance("SKILL.md", packagedProviderDocs["SKILL.md"]);
assertLosslessAmapOverviewGuidance("map-provider-delivery.md", packagedProviderDocs["map-provider-delivery.md"]);
assertLosslessAmapOverviewGuidance(
  "guide-template map online logic",
  packagedProviderDocs["guide-template map online logic"],
);
assert.doesNotMatch(
  packagedProviderDocs["SKILL.md"],
  /(?:兼容字段[^。\n]*overview|overview[^。\n]*兼容字段)/i,
  "packaged SKILL.md should not expose the overview compatibility alias",
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
