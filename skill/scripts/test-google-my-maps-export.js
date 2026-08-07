#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadMapDeliveryRuntime } from "./load-map-delivery-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const skillRoot = path.join(repoRoot, "skill");
const cliPath = path.join(scriptDir, "export-google-my-maps.js");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-trip-planner-my-maps-"));
const secretPattern = /AMAP_KEY|AMAP_SECURITY_KEY|never-print/;

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function assertSafeFailure(result) {
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Google My Maps export failed\.\n$/);
  assert.doesNotMatch(result.stderr, secretPattern);
}

function fixturePois() {
  return [
    {
      id: "quoted-stop",
      name: "Comma, \"Quote\"",
      name_zh: "逗号，“引号”",
      city: "巴黎",
      area: "左岸",
      address: "地址 \"A\", 1号",
      category: "art",
      priority: "must",
      coords: [48.86, 2.3266],
      whyWorthIt: "艺术、历史；值得看",
      plan: "上午进入",
      tip: "提前预约",
      mapUrl: "https://maps.example/quoted",
    },
    {
      id: "xml-stop",
      name: "Tea & <Art> \"Club\" 's",
      name_zh: "茶与艺术",
      city: "巴黎",
      area: "右岸",
      category: "food",
      priority: "preferred",
      coords: [48.861, 2.337],
      note: "Lunch & art <together> \"now\" 's",
      plan: "午餐",
      tip: "Walk-in",
    },
    {
      id: "gcj-only",
      name: "AMap-only market",
      name_zh: "仅高德市场",
      city: "大理",
      area: "古城",
      address: "人民路 1 号",
      category: "local-life",
      priority: "nearby",
      note: "只保留 GCJ-02 定位",
      plan: "下午逛市场",
      tip: "手动定位",
      mapProviderRefs: {
        amap: {
          status: "resolved",
          poiId: "B0FFTEST",
          address: "人民路 1 号",
          position: { lng: 100.1602, lat: 25.7001, system: "gcj02" },
        },
      },
    },
    {
      id: "candidate",
      name: "Candidate cafe",
      name_zh: "候选咖啡",
      city: "巴黎",
      area: "左岸",
      category: "coffee",
      priority: "nearby",
      coords: [48.855, 2.325],
      note: "顺路备选",
      plan: "有时间再去",
      tip: "复核营业时间",
    },
    {
      id: "unassigned",
      name: "Unassigned park",
      name_zh: "未安排公园",
      city: "巴黎",
      area: "南区",
      category: "sight",
      priority: "archive",
      coords: [48.84, 2.34],
      note: "留档地点",
      plan: "暂不安排",
      tip: "无",
    },
  ];
}

function arrayItinerary() {
  return [
    {
      id: "day-1",
      date: "2026-10-13",
      title: "左岸，艺术日",
      city: "巴黎",
      routeReview: { status: "verified" },
      routeStops: [
        { poiId: "quoted-stop", order: 1, role: "主锚点" },
        { poiId: "gcj-only", order: 2, role: "市场" },
      ],
      candidates: ["candidate"],
    },
    {
      id: "day-2",
      date: "2026-10-14",
      title: "右岸 & 午餐",
      city: "巴黎",
      routeReview: { status: "partial" },
      routeStops: [{ poiId: "xml-stop", order: 1, role: "午餐" }],
      candidates: [],
    },
  ];
}

function tripFixture() {
  return {
    title: "never-print private trip",
    pois: fixturePois(),
    days: arrayItinerary(),
    priorities: {
      must: "必须去",
      preferred: "优先去",
      nearby: "顺路可去",
      archive: "留档",
    },
  };
}

function createGuide(name, itinerary = arrayItinerary()) {
  const guide = path.join(tempRoot, name);
  writeJson(path.join(guide, "data/pois.json"), fixturePois());
  writeJson(path.join(guide, "data/itinerary.json"), itinerary);
  return guide;
}

try {
  const TripMapDelivery = loadMapDeliveryRuntime();
  const trip = tripFixture();
  const snapshot = structuredClone(trip);
  const files = TripMapDelivery.buildMyMapsFiles({ trip, locale: "zh-CN" });

  assert.deepEqual(Object.keys(files).sort(), ["README.md", "itinerary.kml", "places.csv"]);
  assert.equal(
    files["places.csv"].split("\n")[0],
    "name,local_name,city,area,address,latitude,longitude,date,day_order,trip_role,category,priority,plan_status,why_worth_it,tip,map_url",
  );
  assert.equal(files["places.csv"].trimEnd().split("\n").length, 6, "CSV must contain one row per POI");
  assert.match(
    files["places.csv"],
    /"逗号，“引号”","Comma, ""Quote""","巴黎","左岸","地址 ""A"", 1号","48\.86","2\.3266","2026-10-13","1","正式路线"/,
  );
  assert.match(files["places.csv"], /"候选地点"/);
  assert.match(files["places.csv"], /"尚未安排行程"/);
  assert.match(files["places.csv"], /"仅高德市场"[^\n]*"","","2026-10-13","2","正式路线"/);
  assert.match(files["itinerary.kml"], /<Folder><name>2026-10-13 · 左岸，艺术日<\/name>/);
  assert.match(files["itinerary.kml"], /<Folder><name>候选地点<\/name>/);
  assert.match(files["itinerary.kml"], /<coordinates>2\.3266,48\.86,0<\/coordinates>/);
  assert.match(files["itinerary.kml"], /Lunch &amp; art &lt;together&gt; &quot;now&quot; &apos;s/);
  assert.doesNotMatch(files["itinerary.kml"], /<LineString>/);
  assert.doesNotMatch(files["itinerary.kml"], /100\.1602|25\.7001|仅高德市场/);
  assert.match(files["README.md"], /需要手动定位[^\n]*1/);
  assert.doesNotMatch(JSON.stringify(files), secretPattern);
  assert.deepEqual(trip, snapshot, "buildMyMapsFiles must not mutate trip input");
  assert.equal(Object.isFrozen(TripMapDelivery), true, "delivery API must remain immutable");
  assert.throws(
    () => TripMapDelivery.buildMyMapsFiles({ trip, locale: "fr" }),
    /locale must be zh-CN or en/,
  );

  const englishFiles = TripMapDelivery.buildMyMapsFiles({ trip, locale: "en" });
  assert.match(englishFiles["places.csv"], /"Formal route"/);
  assert.match(englishFiles["README.md"], /Manual location required[^\n]*1/);

  const guide = createGuide("array-guide");
  const output = path.join(tempRoot, "array-export");
  const result = runCli(["--guide", guide, "--output", output, "--locale", "zh-CN"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "ok",
    files: ["README.md", "places.csv", "itinerary.kml"],
    counts: { places: 5, kmlPlacemarks: 4, manualLocation: 1 },
  });
  assert.deepEqual(fs.readdirSync(output).sort(), ["README.md", "itinerary.kml", "places.csv"]);
  assert.doesNotMatch(result.stdout + result.stderr, /never-print|private trip|quoted-stop/);

  const objectGuide = createGuide("object-guide", {
    trip: { title: "Object guide" },
    days: [
      { ...arrayItinerary()[0], routeStops: [{ poiId: "quoted-stop", order: 1 }] },
      { ...arrayItinerary()[1], routeStops: [] },
    ],
    defaultAssignments: [
      { name: "Comma, \"Quote\"", dayId: "day-2", order: 2 },
      { poiId: "xml-stop", dayId: "day-1", order: 1 },
    ],
  });
  const objectOutput = path.join(tempRoot, "object-export");
  const objectRun = runCli(["--guide", objectGuide, "--output", objectOutput, "--locale", "en"]);
  assert.equal(objectRun.status, 0, objectRun.stdout + objectRun.stderr);
  const objectCsv = fs.readFileSync(path.join(objectOutput, "places.csv"), "utf8");
  assert.match(objectCsv, /"Comma, ""Quote"""[^\n]*"2026-10-14","1","Formal route"/);
  assert.match(objectCsv, /"Tea & <Art> ""Club"" 's"[^\n]*"2026-10-13","1","Formal route"/);

  const statePath = path.join(tempRoot, "never-print-state.json");
  writeJson(statePath, {
    assignments: Object.fromEntries(fixturePois().map((poi) => [poi.id, poi.id === "candidate" ? "day-2" : ""])),
    priorities: Object.fromEntries(fixturePois().map((poi) => [poi.id, poi.priority])),
    orders: { "day-1": [], "day-2": ["candidate"] },
    dirtyDays: { "day-2": true },
  });
  const stateOutput = path.join(tempRoot, "state-export");
  const stateRun = runCli(["--guide", guide, "--output", stateOutput, "--state", statePath]);
  assert.equal(stateRun.status, 0, stateRun.stdout + stateRun.stderr);
  const stateCsv = fs.readFileSync(path.join(stateOutput, "places.csv"), "utf8");
  assert.match(stateCsv, /"候选咖啡"[^\n]*"2026-10-14","1","正式路线"[^\n]*"需要重新安排"/);

  for (const args of [
    [],
    ["--guide", guide],
    ["--output", path.join(tempRoot, "missing-guide")],
    ["--guide", guide, "--output", path.join(tempRoot, "bad-locale"), "--locale", "fr"],
    ["--guide", guide, "--output", path.parse(repoRoot).root],
    ["--guide", guide, "--output", os.homedir()],
    ["--guide", guide, "--output", repoRoot],
    ["--guide", guide, "--output", skillRoot],
    ["--guide", guide, "--output", guide],
  ]) {
    assertSafeFailure(runCli(args));
  }

  const guideAlias = path.join(tempRoot, "guide-alias");
  fs.symlinkSync(guide, guideAlias, "dir");
  assertSafeFailure(runCli(["--guide", guide, "--output", guideAlias]));

  const repoParentAlias = path.join(tempRoot, "repo-parent-alias");
  fs.symlinkSync(path.dirname(repoRoot), repoParentAlias, "dir");
  const unresolvedRepoAlias = path.join(repoParentAlias, path.basename(repoRoot));
  assertSafeFailure(runCli(["--guide", guide, "--output", unresolvedRepoAlias]));

  const partialOutput = path.join(tempRoot, "partial-output");
  fs.mkdirSync(partialOutput);
  fs.writeFileSync(path.join(partialOutput, "README.md"), "keep-existing");
  assertSafeFailure(runCli(["--guide", guide, "--output", partialOutput]));
  assert.deepEqual(fs.readdirSync(partialOutput), ["README.md"]);
  assert.equal(fs.readFileSync(path.join(partialOutput, "README.md"), "utf8"), "keep-existing");

  const unsafeReplaceOutput = path.join(tempRoot, "unsafe-replace-output");
  fs.mkdirSync(unsafeReplaceOutput);
  fs.writeFileSync(path.join(unsafeReplaceOutput, "README.md"), "keep-on-preflight-failure");
  fs.mkdirSync(path.join(unsafeReplaceOutput, "places.csv"));
  assertSafeFailure(runCli(["--guide", guide, "--output", unsafeReplaceOutput, "--replace"]));
  assert.equal(
    fs.readFileSync(path.join(unsafeReplaceOutput, "README.md"), "utf8"),
    "keep-on-preflight-failure",
    "replace must preflight all known targets before changing any file",
  );
  assert.equal(fs.statSync(path.join(unsafeReplaceOutput, "places.csv")).isDirectory(), true);

  const brokenSymlinkOutput = path.join(tempRoot, "broken-symlink-output");
  fs.mkdirSync(brokenSymlinkOutput);
  fs.symlinkSync(path.join(tempRoot, "missing-external.csv"), path.join(brokenSymlinkOutput, "places.csv"));
  assertSafeFailure(runCli(["--guide", guide, "--output", brokenSymlinkOutput]));
  assert.deepEqual(
    fs.readdirSync(brokenSymlinkOutput),
    ["places.csv"],
    "a broken known-file symlink must be detected before any sibling output is written",
  );

  const replaceOutput = path.join(tempRoot, "replace-output");
  fs.mkdirSync(replaceOutput);
  for (const file of ["README.md", "places.csv", "itinerary.kml"]) {
    fs.writeFileSync(path.join(replaceOutput, file), "old");
  }
  fs.writeFileSync(path.join(replaceOutput, "keep.txt"), "unrelated");
  const replaceRun = runCli(["--guide", guide, "--output", replaceOutput, "--replace"]);
  assert.equal(replaceRun.status, 0, replaceRun.stdout + replaceRun.stderr);
  assert.equal(fs.readFileSync(path.join(replaceOutput, "keep.txt"), "utf8"), "unrelated");
  assert.deepEqual(fs.readdirSync(replaceOutput).sort(), [
    "README.md",
    "itinerary.kml",
    "keep.txt",
    "places.csv",
  ]);

  console.log("Google My Maps export contract passed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
