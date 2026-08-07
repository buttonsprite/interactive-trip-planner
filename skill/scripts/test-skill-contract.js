#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(skillRoot, "..");

const read = (relativePath) => fs.readFileSync(path.join(skillRoot, relativePath), "utf8");

function markdownSection(markdown, heading) {
  const match = markdown.match(
    new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |\\z)`, "m"),
  );
  assert.ok(match, `missing ## ${heading} section`);
  return match[1];
}

function findMarkdownFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findMarkdownFiles(absolutePath));
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") files.push(absolutePath);
  }
  return files;
}

const skill = read("SKILL.md");
const planning = read("references/planning-workflow.md");
const sources = read("references/source-verification.md");
const userLanguage = read("references/user-facing-language.md");
const workspaceTemplate = read("assets/workspace-AGENTS-template.md");
const workspaceBootstrap = read("references/workspace-bootstrap.md");
const xiaohongshuImport = read("references/xiaohongshu-import.md");
const coreContractPath = path.join(skillRoot, "references", "core-interaction-contract.md");
const tasteReference = read("references/hybrid-taste-models.md");
const sourcePackReference = read("references/regional-source-packs.md");
const tasteSourceOnlineLogic = read("references/taste-and-source-online-logic.md");
const openaiYamlPath = path.join(skillRoot, "agents", "openai.yaml");
const openaiYaml = fs.existsSync(openaiYamlPath) ? fs.readFileSync(openaiYamlPath, "utf8") : null;
const poiSchema = read("references/poi-schema.md");
const mapFeatureContract = read("references/map-feature-contract.md");
const mapStandards = read("references/map-standards.md");
const mapProviderDeliveryPath = path.join(skillRoot, "references", "map-provider-delivery.md");
const mapProviderDelivery = fs.existsSync(mapProviderDeliveryPath)
  ? fs.readFileSync(mapProviderDeliveryPath, "utf8")
  : "";
const templateMapOnlineLogic = read("assets/guide-template/docs/online-logic/map.md");
const template = read("assets/guide-template/maps/itinerary-map.html");
const goldenDataRoot = path.join(skillRoot, "assets", "samples", "golden");
const repositoryReadmePath = path.join(repositoryRoot, "README.md");
const repositoryReadme = fs.existsSync(repositoryReadmePath)
  ? fs.readFileSync(repositoryReadmePath, "utf8")
  : null;
const repositoryEnglishReadmePath = path.join(repositoryRoot, "README.en.md");
const repositoryEnglishReadme = fs.existsSync(repositoryEnglishReadmePath)
  ? fs.readFileSync(repositoryEnglishReadmePath, "utf8")
  : null;
const redskillInstallTemplatePath = path.join(repositoryRoot, "docs", "REDSKILL_INSTALL.template.md");
const redskillInstallTemplate = fs.existsSync(redskillInstallTemplatePath)
  ? fs.readFileSync(redskillInstallTemplatePath, "utf8")
  : null;
const startupIntroduction = markdownSection(skill, "情境化启动介绍");
const planningStartup = markdownSection(planning, "启动说明");

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
    "This source calls Google Places API.",
  ),
  /unsupported positive/,
  "positive provider claims must fail the document contract",
);
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "positive-sync fixture",
    "This source automatically syncs Google Maps Saved Lists.",
  ),
  /unsupported positive/,
  "positive account-sync claims must fail the document contract",
);
assert.doesNotThrow(
  () => assertNoUnsupportedProviderClaims(
    "negative-claim fixture",
    "This source does not call Google Places API and is not automatically added to Google Maps saved lists.",
  ),
  "negative boundary copy must not be mistaken for an unsupported claim",
);

const readmeProviderLine = (repositoryReadme || "").split("\n").find(
  (line) => line.includes("当前源码不调用 Google Places API 或 Google Routes API"),
) || "";
assert.ok(readmeProviderLine, "README.md must expose a real provider-boundary line for mutation coverage");
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "README.md mixed API mutation",
    readmeProviderLine.replace(
      "当前源码不调用 Google Places API 或 Google Routes API",
      "当前源码调用 Google Places API，但不调用 Google Routes API",
    ),
  ),
  /Google Places API/,
  "a Routes negation must not hide a positive Places call in the real README line",
);

const englishReadmeProviderLine = (repositoryEnglishReadme || "").split("\n").find(
  (line) => line.includes("does not call Google Places API and does not call Google Routes API"),
) || "";
assert.ok(englishReadmeProviderLine, "README.en.md must expose a real provider-boundary line for mutation coverage");
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "README.en.md mixed API mutation",
    englishReadmeProviderLine.replace("does not call Google Places API", "calls Google Places API"),
  ),
  /Google Places API/,
  "an English Routes negation must not hide a positive Places call",
);

const installProviderLine = (redskillInstallTemplate || "").split("\n").find(
  (line) => line.includes("本包不调用 Google Places API"),
) || "";
assert.ok(installProviderLine, "REDSKILL install template must expose a real provider-boundary line for mutation coverage");
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "REDSKILL install mixed API mutation",
    installProviderLine.replace(
      "本包不调用 Google Places API",
      "本包调用 Google Places API",
    ),
  ),
  /Google Places API/,
  "the bilingual Routes negation must not hide a positive Places call in the install line",
);

const readmeSyncLine = (repositoryReadme || "").split("\n").find(
  (line) => line.includes("不会自动写入普通 Google Maps 收藏夹"),
) || "";
assert.ok(readmeSyncLine, "README.md must expose a real account-boundary line for mutation coverage");
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "README.md mixed account mutation",
    readmeSyncLine.replace(
      "不会自动写入普通 Google Maps 收藏夹",
      "会自动写入普通 Google Maps 收藏夹",
    ),
  ),
  /Google Maps 收藏夹/,
  "an AMap-favorites negation must not hide positive Google Maps account writing",
);

const englishReadmeSyncLine = (repositoryEnglishReadme || "").split("\n").find(
  (line) => line.includes("not automatically added to regular Google Maps saved lists"),
) || "";
assert.ok(englishReadmeSyncLine, "README.en.md must expose a real account-boundary line for mutation coverage");
assert.throws(
  () => assertNoUnsupportedProviderClaims(
    "README.en.md mixed account mutation",
    englishReadmeSyncLine.replace(
      "not automatically added to regular Google Maps saved lists",
      "automatically added to regular Google Maps saved lists",
    ),
  ),
  /Google Maps saved lists/,
  "an English AMap-favorites negation must not hide positive Google Maps account writing",
);

assert.doesNotThrow(
  () => assertNoUnsupportedProviderClaims(
    "documentation reference fixture",
    "The Skill uses Google Places API documentation only as a factual reference; it does not call Google Routes API.",
  ),
  "using API documentation as a factual reference is not a provider call",
);

assert.ok(fs.existsSync(mapProviderDeliveryPath), "missing map provider delivery online logic");

assert.ok(repositoryReadme, "README.md is required for the public provider workflow");
assert.ok(repositoryEnglishReadme, "README.en.md is required for the public provider workflow");
assert.ok(redskillInstallTemplate, "REDSKILL install template is required for provider setup");

assertIncludesAll("README.md", repositoryReadme, [
  "amap-gui start",
  "amap-gui status",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "进程会读取继承环境中的密钥值",
  "未完成高德路网复核；请在出发前打开高德确认。",
  "Google Maps URLs 不需要 API Key",
  "places.csv",
  "itinerary.kml",
  "不会自动写入普通 Google Maps 收藏夹",
]);
assertIncludesAll("README.en.md", repositoryEnglishReadme, [
  "amap-gui start",
  "amap-gui status",
  "check-amap-cli.js",
  "does not confirm that the AMap service container is running",
  "process reads credential values from the inherited environment",
  "AMap road-network verification was not completed. Recheck in AMap before departure.",
  "Google Maps URLs do not require an API key",
  "places.csv",
  "itinerary.kml",
  "not automatically added to regular Google Maps saved lists",
]);
assertIncludesAll("REDSKILL_INSTALL.template.md", redskillInstallTemplate, [
  "amap-gui start",
  "amap-gui status",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "进程会读取继承环境中的密钥值",
  ...routeStatusCopy,
]);
assertIncludesAll("SKILL.md", skill, [
  "amap-gui start",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "provider-error",
  "places.csv",
  "itinerary.kml",
  ...routeStatusCopy,
]);
assertIncludesAll("map-provider-delivery.md", mapProviderDelivery, [
  "amap-gui start",
  "amap-gui status",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "进程会读取继承环境中的值",
  "provider-error",
  "places.csv",
  "itinerary.kml",
  ...routeStatusCopy,
]);
assertIncludesAll("planning-workflow.md", planning, [
  "amap-gui start",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "provider-error",
  ...routeStatusCopy,
]);
assertIncludesAll("regional-source-packs.md", sourcePackReference, [
  "amap-gui start",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "provider-error",
]);
assertIncludesAll("taste-and-source-online-logic.md", tasteSourceOnlineLogic, [
  "amap-gui start",
  "check-amap-cli.js",
  "不会确认高德服务容器正在运行",
  "执行进程会读取继承环境中的密钥值",
  "provider-error",
]);
assertIncludesAll("user-facing-language.md", userLanguage, [
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
assertIncludesAll("guide-template map online logic", templateMapOnlineLogic, [
  ...routeStatusCopy,
]);
assertLosslessAmapOverviewGuidance("SKILL.md", skill);
assertLosslessAmapOverviewGuidance("map-provider-delivery.md", mapProviderDelivery);
assertLosslessAmapOverviewGuidance("guide-template map online logic", templateMapOnlineLogic);
assert.doesNotMatch(
  skill,
  /(?:兼容字段[^。\n]*overview|overview[^。\n]*兼容字段)/i,
  "SKILL.md should explain user-facing chunks without exposing the overview compatibility alias",
);

for (const [label, document] of [
  ["README.md", repositoryReadme],
  ["README.en.md", repositoryEnglishReadme],
  ["REDSKILL_INSTALL.template.md", redskillInstallTemplate],
  ["SKILL.md", skill],
  ["map-provider-delivery.md", mapProviderDelivery],
  ["planning-workflow.md", planning],
  ["regional-source-packs.md", sourcePackReference],
  ["taste-and-source-online-logic.md", tasteSourceOnlineLogic],
  ["user-facing-language.md", userLanguage],
  ["guide-template map online logic", templateMapOnlineLogic],
]) {
  assertNoUnsupportedProviderClaims(label, document);
}

const mapDeliveryDocuments = [
  skill,
  planning,
  sourcePackReference,
  tasteSourceOnlineLogic,
  userLanguage,
  templateMapOnlineLogic,
  mapProviderDelivery,
  repositoryReadme || "",
  repositoryEnglishReadme || "",
].join("\n");
assert.match(mapDeliveryDocuments, /不调用 Google Places API/);
assert.match(mapDeliveryDocuments, /不调用 Google Routes API/);
assert.match(mapDeliveryDocuments, /does not call Google Places API/);
assert.match(mapDeliveryDocuments, /does not call Google Routes API/);

if (openaiYaml !== null) {
  assert.doesNotMatch(openaiYaml, /消化/);
  assert.match(openaiYaml, /default_prompt:.*小红书收藏夹链接.*单篇笔记链接/);
  assert.match(openaiYaml, /default_prompt:.*只追问.*影响行程/);
}
assert.match(tasteSourceOnlineLogic, /情境化启动介绍/);
assert.match(tasteSourceOnlineLogic, /先回应.*2[–-]4 项.*1[–-]3 组/);
assert.match(tasteSourceOnlineLogic, /用户粘贴.*时，直接进入.*导入流程/);
assert.match(tasteSourceOnlineLogic, /局部编辑时，不重复启动介绍/);
assert.match(tasteSourceOnlineLogic, /只有匿名读取不完整且用户选择登录态补齐时才展示/);

assert.match(skill, /面向旅行者的语言/);
assert.match(startupIntroduction, /先回应用户已经提供的内容/);
assert.match(startupIntroduction, /Markdown list.*2[–-]4 项/i);
assert.match(startupIntroduction, /只询问.*1[–-]3 组.*改变路线骨架/);
assert.ok(
  startupIntroduction.indexOf("先回应用户已经提供的内容")
    < startupIntroduction.indexOf("Markdown list"),
  "startup introduction must respond to supplied context before listing capabilities",
);
assert.ok(
  startupIntroduction.indexOf("Markdown list")
    < startupIntroduction.indexOf("只询问当前缺少的 1–3 组"),
  "startup introduction must list capabilities before asking route-shaping questions",
);
assert.doesNotMatch(skill, /第一轮最多询问 3[–-]5 组/);
assert.match(
  startupIntroduction,
  /首次完整规划且用户尚未提供小红书资料时[\s\S]*?必须包含[\s\S]*?小红书收藏夹链接或单篇笔记链接.*粘贴到这里/,
);
assert.match(startupIntroduction, /其余 1[–-]3 项.*从下列示例中按当前请求选择.*不要求全部出现/);
assert.match(skill, /局部修改.*不重复.*启动介绍/);
assert.doesNotMatch(skill, /消化/);
assert.doesNotMatch(xiaohongshuImport, /消化/);
for (const markdownFile of findMarkdownFiles(skillRoot)) {
  assert.doesNotMatch(
    fs.readFileSync(markdownFile, "utf8"),
    /消化/,
    `${path.relative(skillRoot, markdownFile)} must not contain deprecated launch copy`,
  );
}
assert.match(skill, /一次旅行设计提案/);
assert.match(skill, /请 Codex 重新安排/);
assert.match(skill, /全程总览、某一天和统一地点详情/);
assert.match(skill, /用户当前主要对话语言/);
assert.match(skill, /完整攻略默认使用[^\n]*guide-template-europe-public/);
assert.match(skill, /Europe direct-copy interaction v1/i);
assert.match(skill, /PUBLIC_TRIP_DATA/);
assert.match(skill, /不得把私人母版的数据块/);
assert.match(skill, /顺序引导线[^\n]*不代表[^\n]*道路/);
assert.match(skill, /明确要求改变交互[^\n]*interaction fork/i);
assert.match(skill, /轻量模板[^\n]*用户明确要求/);
assert.match(skill, /validate-europe-derived-map\.js/);
assert.match(skill, /完整攻略[^\n]*guide-template-europe-public[^\n]*validate-europe-derived-map\.js/);
assert.match(skill, /轻量[^\n]*guide-template[^\n]*validate-map-html\.js/);
assert.match(skill, /同一产物[^\n]*不[^\n]*两个[^\n]*validator/i);
assert.match(skill, /共享[^\n]*(数据|design|设计)[^\n]*(活动|event)[^\n]*验证[^\n]*仍[^\n]*适用/i);
assert.match(skill, /--strict-routes/);
assert.match(skill, /--sources <sources\.json>[\s\S]*--require-route-evidence/);
assert.match(skill, /build-redskill-release\.js/);
assert.match(skill, /test-redskill-release\.js/);
assert.match(skill, /每两个相邻地点/);
assert.match(skill, /生活品味模板/);
assert.match(skill, /推荐 1[–-]3 个/);
assert.match(skill, /不使用现成模板/);
assert.match(skill, /一主一辅/);
assert.match(skill, /主模板[^\n]*选点[^\n]*节奏/);
assert.match(skill, /辅模板[^\n]*(一个明确领域|视觉倾向)/);
assert.match(skill, /Regional Source Pack/);
assert.match(skill, /Global[^\n]*中国大陆[^\n]*日本[^\n]*法语区/);
assert.match(skill, /为什么符合这个模板/);
assert.match(skill, /为什么安排在这里/);
assert.match(skill, /需要临近复核/);
assert.doesNotMatch(skill, /coverage|confidence|maturity/i);
for (const stage of [
  "阶段一：理解并确认旅行方向",
  "阶段二：寻找适合用户的地点",
  "阶段三：规划每日行程",
  "阶段四：制作动态地图",
  "阶段五：让用户在地图中调整",
  "阶段六：根据反馈重新安排",
]) {
  assert.match(skill, new RegExp(stage));
}
assert.match(planning, /第一轮最多询问 1[–-]3 组/);
assert.doesNotMatch(planning, /第一轮最多询问 3[–-]5 组/);
assert.match(planningStartup, /先回应用户已经提供的内容/);
assert.match(planningStartup, /Markdown list.*2[–-]4 项/i);
assert.match(planningStartup, /只询问.*1[–-]3 组.*改变路线骨架/);
assert.match(planningStartup, /其余 1[–-]3 项.*从下列示例中按当前请求选择.*不要求全部出现/);
assert.ok(
  planningStartup.indexOf("先回应用户已经提供的内容")
    < planningStartup.indexOf("Markdown list")
    && planningStartup.indexOf("Markdown list")
      < planningStartup.indexOf("只询问当前缺少的 1–3 组"),
  "planning workflow must keep the contextual startup order",
);
assert.doesNotMatch(planningStartup, /开始完整攻略前，用 2-3 句话向用户说明/);
assert.doesNotMatch(planningStartup, /我会先确认会影响路线的关键信息/);
assert.match(planning, /日内动线验收/);
assert.match(planning, /有 4 个以上正式停靠点/);
assert.match(planning, /有意折返/);
assert.ok(fs.existsSync(path.join(skillRoot, "references/user-facing-language.md")));
assert.match(userLanguage, /用户明确指定/);
assert.match(userLanguage, /简体中文/);
assert.match(userLanguage, /繁体中文/);
assert.match(userLanguage, /地点原名/);
assert.match(userLanguage, /地图生成的 Codex 请求/);
assert.match(userLanguage, /有通行译名的国家、城市、区域和著名景点/);
assert.match(userLanguage, /首次出现[^\n]*译名[^\n]*地点原名/);
assert.match(userLanguage, /后续[^\n]*只使用译名/);
assert.match(userLanguage, /不得因为来源页面使用英语/);
assert.match(workspaceTemplate, /用户当前主要对话语言/);
assert.match(workspaceTemplate, /六阶段/);
assert.match(workspaceTemplate, /每个完整旅行日[^\n]*12-18 个/);
assert.match(workspaceTemplate, /完整攻略默认[^\n]*guide-template-europe-public/);
assert.match(workspaceTemplate, /轻量模板[^\n]*用户明确要求/);
assert.match(workspaceTemplate, /必去、优先去、顺路可去/);
assert.match(workspaceBootstrap, /不得覆盖已有的 `AGENTS\.md`/);
assert.match(workspaceBootstrap, /只复制通用规则/);
assert.match(skill, /小红书[^\n]*(收藏夹|单篇笔记)/);
assert.match(skill, /references\/xiaohongshu-import\.md/);
assert.match(skill, /board\/|xhslink\.com|xiaohongshu\.com\/explore/);
assert.match(xiaohongshuImport, /先匿名读取/);
assert.match(xiaohongshuImport, /继续读取完整收藏夹/);
assert.match(xiaohongshuImport, /只导入匿名已读取部分/);
assert.match(xiaohongshuImport, /改为粘贴单篇笔记链接/);
assert.match(xiaohongshuImport, /每次导入[^\n]*重新确认/);
assert.match(xiaohongshuImport, /登录态[^\n]*只[^\n]*链接清单/);
assert.match(xiaohongshuImport, /不会读取或保存 Cookie/);
assert.match(xiaohongshuImport, /账号风控或封禁风险/);
assert.match(xiaohongshuImport, /travel-library\/xiaohongshu/);
assert.match(xiaohongshuImport, /record\.json[^\n]*唯一/);
assert.match(xiaohongshuImport, /INDEX\.md/);
assert.match(xiaohongshuImport, /note\.md/);
assert.match(xiaohongshuImport, /素材默认不下载/);
assert.match(xiaohongshuImport, /15 MiB/);
assert.match(xiaohongshuImport, /200 MiB/);
assert.match(xiaohongshuImport, /discovery[^\n]*recommendation[^\n]*experience/);
assert.match(xiaohongshuImport, /营业时间[^\n]*官方/);
assert.match(workspaceBootstrap, /travel-library\/xiaohongshu/);
assert.match(workspaceTemplate, /travel-library\//);
assert.match(sources, /用户提供[^\n]*小红书/);
assert.match(tasteSourceOnlineLogic, /当前源码[^\n]*developer-preview contract slice/);
assert.match(tasteSourceOnlineLogic, /小红书收藏夹/);
assert.match(sources, /搜索任务单/);
assert.match(sources, /当地语言/);
assert.match(sources, /搜索结果摘要/);
assert.match(sources, /停止搜索/);
assert.match(sources, /来源矩阵/);
assert.match(sources, /每个完整旅行日[^\n]*12-18 个/);
assert.match(sources, /1 天停留[^\n]*12-18 个/);
assert.match(sources, /2-3 天停留[^\n]*24-45 个/);
assert.match(sources, /正式路线预计使用量的 2-3 倍/);
assert.match(sources, /一晚计划去 2 家酒吧[^\n]*4-6 家/);
assert.match(sources, /分层复核/);
assert.match(sources, /分类覆盖基线/);
assert.match(sources, /景点、博物馆或核心体验[^\n]*4-6 个/);
assert.match(sources, /正餐候选[^\n]*4-6 家/);
assert.match(sources, /小吃、咖啡、甜品或休息[^\n]*3-5 家/);
assert.match(sources, /分类数字不能简单相加/);
assert.match(sources, /数量是质量下限，不是凑数任务/);
assert.match(tasteReference, /用户硬约束[^\n]*当前事实[^\n]*高于模板/);
assert.match(tasteReference, /不得直接复制[^\n]*样本[^\n]*店名/);
assert.match(tasteReference, /主模板[^\n]*选点[^\n]*节奏/);
assert.match(sourcePackReference, /A[：:][^\n]*可重复检索/);
assert.match(sourcePackReference, /B[：:][^\n]*条件可检索/);
assert.match(sourcePackReference, /C[：:][^\n]*仅人工/);
assert.match(sourcePackReference, /city-life-culture/);
assert.match(sourcePackReference, /industry-specialist/);
assert.match(sourcePackReference, /不得使用[^\n]*(当地媒体|local media)/i);
assert.match(tasteSourceOnlineLogic, /当前已实现/);
assert.match(tasteSourceOnlineLogic, /0\.1\.0/);
assert.match(tasteSourceOnlineLogic, /后续/);
assert.match(tasteSourceOnlineLogic, /developer-preview contract slice/);
assert.match(tasteSourceOnlineLogic, /PRD V1 public acceptance/);
assert.match(tasteSourceOnlineLogic, /8 个海外 Regional Source Pack/);
assert.match(tasteSourceOnlineLogic, /每个 taste model 至少 3 个 unseen cities/);
assert.doesNotMatch(tasteSourceOnlineLogic, /8\+[^\n]*已实现|跨 3 城[^\n]*已完成/);
assert.match(skill, /contentTier/);
assert.match(skill, /不同类型[^\n]*不[^\n]*同样/);
assert.match(poiSchema, /deep[^\n]*standard[^\n]*compact/);
assert.match(poiSchema, /detailSections/);
assert.match(poiSchema, /市场[^\n]*(买什么|逛什么)/);
assert.match(poiSchema, /价值陈述[^\n]*现场动作[^\n]*可解析证据/);
assert.match(poiSchema, /至少 40/);
assert.match(poiSchema, /sourceIds[^\n]*evidenceSources/);
assert.match(mapFeatureContract, /evidenceSources/);
assert.match(mapFeatureContract, /不得[^\n]*sourceIds/);
assert.match(sources, /事实[^\n]*推荐[^\n]*体验/);
assert.match(skill, /data\/events\.json/);
assert.match(skill, /venue[^\n]*hosted[^\n]*citywide/);
assert.match(skill, /confirmed[^\n]*program-pending/);
assert.match(skill, /当地食材结构[^\n]*居民[^\n]*季节/);
assert.match(sources, /历史届次[^\n]*不[^\n]*当前活动/);
assert.match(skill, /当前源码[^\n]*developer-preview/i);
assert.match(skill, /build-redskill-release\.js <release-directory> <version>/);
assert.match(skill, /references\/xiaohongshu-import\.md/);

if (repositoryReadme !== null) {
  assert.match(repositoryReadme, /当前源码[^\n]*developer preview/i);
  assert.match(repositoryReadme, /不等于 Public V1/i);
  assert.match(repositoryReadme, /8 个海外 Regional Source Pack/i);
  assert.match(repositoryReadme, /每个 Taste Model 至少 3 个 unseen cities/i);
  assert.match(repositoryReadme, /representative evidence/i);
  assert.match(
    repositoryReadme,
    /\[[^\]]*详细验收边界[^\]]*\]\(skill\/references\/taste-and-source-online-logic\.md\)/i,
  );
  for (const command of [
    "recommend-taste-models.js",
    "build-source-query-matrix.js",
    "probe-source-access.js",
  ]) {
    assert.match(repositoryReadme, new RegExp(command.replace(".", "\\.")));
  }
  assert.match(repositoryReadme, /--context <file>/);
  assert.match(repositoryReadme, /--stdin/);
  assert.match(repositoryReadme, /西班牙语[^\n]*加泰罗尼亚语[^\n]*词库/);
  assert.match(repositoryReadme, /词库[^\n]*不等于地区来源包/);
  assert.match(repositoryReadme, /代表性景点[^\n]*当地生活/);
  assert.match(repositoryReadme, /source probe[^\n]*有界[^\n]*访问状态[^\n]*不能证明/i);
  assert.match(repositoryReadme, /Spain[^\n]*Regional Source Pack|西班牙[^\n]*Regional Source Pack/);
}

if (repositoryEnglishReadme !== null) {
  assert.match(
    repositoryEnglishReadme,
    /Choose the newest version directory under \[`releases\/`\]\(releases\/\)/,
  );
}

for (const mode of ["first-visit", "return-visit", "landmark-light", "local-only", "balanced-visitor"]) {
  assert.match(planning, new RegExp(mode));
}
assert.match(skill, /代表性景点/);
assert.match(planning, /至少评估 3 个/);
assert.match(planning, /2[–-]4 个代表性主锚点/);
assert.match(planning, /重型景点[^\n]*每天最多 1 个/);
assert.match(planning, /同方向[^\n]*(市场|居民广场|社区)/);
assert.match(sources, /著名景点[^\n]*不能[^\n]*游客多/);
assert.match(tasteSourceOnlineLogic, /visitor mode/);
assert.match(planning, /第一次使用[^\n]*Skill[^\n]*不等于[^\n]*到访/);
assert.match(planning, /到访史未知[^\n]*balanced-visitor/);
assert.match(planning, /该城市停留段内[^\n]*2[–-]4 个代表性主锚点/);
assert.match(planning, /每座[^\n]*至少评估 3 个代表性景点[^\n]*(采用|舍弃)/);
assert.match(planning, /同方向当地生活角色[^\n]*(街区咖啡|社区饭馆|传统商业|夜间)/);

for (const testFile of ["test-core-map-state.js", "test-core-map-template.js", "test-europe-public-template.js"]) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, testFile)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

for (const [label, document] of [["SKILL.md", skill], ["map-standards.md", mapStandards]]) {
  for (const match of document.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)) {
    const commandBlock = match[1];
    assert.ok(
      !(commandBlock.includes("validate-map-html.js") && commandBlock.includes("validate-europe-derived-map.js")),
      `${label} must not present both template-specific validators as one unconditional command sequence`,
    );
  }
}

assert.match(mapStandards, /完整攻略[^\n]*guide-template-europe-public[^\n]*validate-europe-derived-map\.js/);
assert.match(mapStandards, /轻量[^\n]*guide-template[^\n]*validate-map-html\.js/);
assert.match(mapStandards, /同一产物[^\n]*不[^\n]*两个[^\n]*validator/i);
assert.match(mapStandards, /共享[^\n]*(数据|design|设计)[^\n]*(活动|event)[^\n]*验证[^\n]*仍[^\n]*适用/i);

const lightValidator = path.join(scriptDir, "validate-map-html.js");
const lightTemplateValidation = spawnSync(
  process.execPath,
  [lightValidator, path.join(skillRoot, "assets", "guide-template", "maps", "itinerary-map.html")],
  { encoding: "utf8" },
);
assert.equal(lightTemplateValidation.status, 0, lightTemplateValidation.stdout + lightTemplateValidation.stderr);

const derivedValidator = path.join(scriptDir, "validate-europe-derived-map.js");
assert.ok(fs.existsSync(derivedValidator), "missing Europe-derived map validator");
const derivedValidation = spawnSync(
  process.execPath,
  [derivedValidator, path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "itinerary-map.html")],
  { encoding: "utf8" },
);
assert.equal(derivedValidation.status, 0, derivedValidation.stdout + derivedValidation.stderr);

const derivedCopyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trip-map-canonical-v1-"));
const derivedCopyMap = path.join(derivedCopyRoot, "maps");
fs.cpSync(path.join(skillRoot, "assets", "guide-template-europe-public", "maps"), derivedCopyMap, { recursive: true });
const copiedHtml = path.join(derivedCopyMap, "itinerary-map.html");
fs.writeFileSync(
  copiedHtml,
  fs.readFileSync(copiedHtml, "utf8").replace('data-canonical-interaction="europe-map-direct-v1"', ""),
);
const modifiedCoreValidation = spawnSync(
  process.execPath,
  [derivedValidator, path.join(derivedCopyMap, "itinerary-map.html")],
  { encoding: "utf8" },
);
assert.notEqual(modifiedCoreValidation.status, 0, "derived map must reject an edited immutable Core file");
assert.match(modifiedCoreValidation.stdout + modifiedCoreValidation.stderr, /accepted Europe interaction shell token/);

fs.copyFileSync(
  path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "itinerary-map.html"),
  copiedHtml,
);
fs.writeFileSync(copiedHtml, fs.readFileSync(copiedHtml, "utf8").replace("2026 欧洲秋日节庆 18 天公开样例", "目的地视觉变体"));
const modifiedThemeValidation = spawnSync(
  process.execPath,
  [derivedValidator, path.join(derivedCopyMap, "itinerary-map.html")],
  { encoding: "utf8" },
);
assert.equal(modifiedThemeValidation.status, 0, modifiedThemeValidation.stdout + modifiedThemeValidation.stderr);

const lightTemplateAgainstDerivedValidation = spawnSync(
  process.execPath,
  [derivedValidator, path.join(skillRoot, "assets", "guide-template", "maps", "itinerary-map.html")],
  { encoding: "utf8" },
);
assert.notEqual(
  lightTemplateAgainstDerivedValidation.status,
  0,
  "lightweight template must not pass the Europe-derived full-map interaction contract",
);

assert.ok(fs.existsSync(coreContractPath), "missing Core interaction contract");
const coreContract = fs.readFileSync(coreContractPath, "utf8");
assert.match(skill, /交互壳/);
assert.match(skill, /基础功能[^\n]*视觉/);
assert.match(coreContract, /Europe direct-copy interaction v1/);
assert.match(coreContract, /拖拽/);
assert.doesNotMatch(skill, /完整攻略包先定义.*design.*token/i);

assert.doesNotMatch(template, />\s*POI\s*</);
assert.doesNotMatch(template, /Interactive Trip Map|Map canvas/);

for (const slug of fs.readdirSync(goldenDataRoot).filter((name) => name !== "README.md")) {
  const poisText = fs.readFileSync(path.join(goldenDataRoot, slug, "data", "pois.json"), "utf8");
  assert.doesNotMatch(poisText, /\bPOI\b|renderer|localStorage|themeProfile|change set|resource drawer/);
}

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "trip-map-contract-"));
const fixture = path.join(fixtureDir, "browse-only-map.html");
fs.writeFileSync(fixture, `<!doctype html>
<html><head><meta name="viewport" content="width=device-width"></head><body>
<div id="map"></div><div id="day-list" class="day-card"></div>
<input id="poi-list-search" type="search"><select id="poi-list-city"></select>
<select id="poi-list-category"></select><select id="poi-list-priority"></select>
<select id="poi-list-plan"></select><div id="poi-list"></div>
<div id="resource-drawer"><div id="image-preview"></div></div>
<p>为什么去 怎么安排 注意点 官网 预约 Google Maps 地图 小红书</p>
<script>localStorage.setItem("x", "y"); location.hash = "poi=x";</script>
</body></html>`);

const validation = spawnSync(
  process.execPath,
  [path.join(scriptDir, "validate-map-html.js"), fixture],
  { encoding: "utf8" },
);
assert.notEqual(
  validation.status,
  0,
  "只有浏览和筛选能力的地图不应通过完整行程编辑合同",
);
assert.match(validation.stdout + validation.stderr, /impact confirmation|undo control|replan dialog/);

const routePois = path.join(fixtureDir, "route-pois.json");
const routeItinerary = path.join(fixtureDir, "route-itinerary.json");
fs.writeFileSync(routePois, JSON.stringify([
  { id: "a", name: "A", name_zh: "甲", city: "Test", category: "museum", coords: [1, 1], note: "n", plan: "p", tip: "t", source: "s" },
  { id: "b", name: "B", name_zh: "乙", city: "Test", category: "food", coords: [1.01, 1.01], note: "n", plan: "p", tip: "t", source: "s" },
]));
fs.writeFileSync(routeItinerary, JSON.stringify([
  { id: "day-1", date: "2026-01-01", routeStops: [{ poiId: "a", order: 1 }, { poiId: "b", order: 2 }] },
]));
const strictRouteValidation = spawnSync(
  process.execPath,
  [path.join(scriptDir, "validate-trip-data.js"), "--pois", routePois, "--itinerary", routeItinerary, "--strict-routes"],
  { encoding: "utf8" },
);
assert.notEqual(strictRouteValidation.status, 0, "strict route validation must reject missing adjacent transit segments");
assert.match(strictRouteValidation.stdout + strictRouteValidation.stderr, /missing adjacent transit segment/);

const publicDataRoot = path.join(skillRoot, "assets", "guide-template-europe-public", "data");
const publicValidationArgs = [
  path.join(scriptDir, "validate-trip-data.js"),
  "--pois", path.join(publicDataRoot, "pois.json"),
  "--itinerary", path.join(publicDataRoot, "itinerary.json"),
];
const publicLegacyValidation = spawnSync(process.execPath, publicValidationArgs, { encoding: "utf8" });
assert.equal(
  publicLegacyValidation.status,
  0,
  `legacy public-template validation should remain compatible:\n${publicLegacyValidation.stdout}${publicLegacyValidation.stderr}`,
);

const publicStrictEvidenceValidation = spawnSync(process.execPath, [
  ...publicValidationArgs,
  "--sources", path.join(publicDataRoot, "sources.json"),
  "--require-route-evidence",
], { encoding: "utf8" });
const publicStrictOutput = publicStrictEvidenceValidation.stdout + publicStrictEvidenceValidation.stderr;
assert.notEqual(publicStrictEvidenceValidation.status, 0, "legacy Europe sample must not be misreported as evidence certified");
assert.doesNotMatch(publicStrictOutput, /itinerary must be an array/i, "strict public-template validation must understand the object schema");
assert.match(publicStrictOutput, /d\d+[\s\S]*(?:contentTier|sourceIds)/i, "strict failure must identify a positive day assignment and missing formal evidence");

console.log("interactive-trip-planner contract tests passed");
