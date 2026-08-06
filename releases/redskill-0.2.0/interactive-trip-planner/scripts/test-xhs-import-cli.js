#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-import-cli-contract-"));
const workspace = path.join(tempRoot, "workspace");
fs.mkdirSync(path.join(workspace, ".git"), { recursive: true });

const payload = {
  importId: "cli-import-001",
  startedAt: "2026-08-05T10:00:00.000Z",
  source: {
    kind: "single-links",
    id: "single-links",
    title: "CLI Fixture Notes",
    totalCount: 2,
    anonymousCount: 2,
    authenticatedLinkCount: 0,
  },
  risk: { shown: false, confirmed: false, authenticatedLinkCount: 0 },
  notes: [
    {
      id: "cli-note-a",
      canonicalUrl: "https://www.xiaohongshu.com/explore/cli-note-a",
      title: "Fixture Market",
      authorDisplayName: "Fixture Author",
      body: "Synthetic body",
      tags: ["market"],
      media: { types: [], count: 0 },
      access: "anonymous-public",
      signals: {
        places: [{ name: "Fixture Market", city: "Fixture City", area: "Old Town" }],
        categories: ["market"],
        experienceReasons: ["看地方市场结构"],
        negativeSignals: [],
        timeHints: ["morning"],
        factsToVerify: ["营业时间"],
      },
    },
    {
      id: "cli-note-b",
      canonicalUrl: "https://www.xiaohongshu.com/explore/cli-note-b",
      title: "Fixture Cafe",
      authorDisplayName: "Fixture Author",
      body: "Synthetic body",
      tags: ["coffee"],
      media: { types: [], count: 0 },
      access: "anonymous-public",
      signals: {
        places: [{ name: "Fixture Cafe", city: "Fixture City", area: "Old Town" }],
        categories: ["coffee"],
        experienceReasons: ["社区休息点"],
        negativeSignals: [],
        timeHints: ["afternoon"],
        factsToVerify: [],
      },
    },
  ],
  failures: [],
  tripSelection: {
    tripSlug: "cli-fixture-trip",
    entries: [
      { noteId: "cli-note-a", status: "candidate", roles: ["local-life"], placeIds: ["fixture-market"] },
    ],
  },
};

function run(script, args = [], input = "") {
  return spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
    encoding: "utf8",
    input,
  });
}

function assertUsageFailure(result) {
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /\S/);
  assert.doesNotMatch(result.stderr, /Synthetic body|secret-value/);
}

try {
  const imported = run("import-xhs-library.js", ["--workspace", workspace, "--stdin"], JSON.stringify(payload));
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stderr, "");
  const importedResult = JSON.parse(imported.stdout);
  assert.equal(importedResult.status, "imported");
  assert.deepEqual(importedResult.counts, { received: 2, imported: 2, updated: 0, duplicates: 0, failed: 0 });
  assert.equal(importedResult.paths.index, "INDEX.md");
  const libraryRoot = path.join(workspace, "travel-library", "xiaohongshu");
  assert.equal(importedResult.libraryRoot, libraryRoot);
  assert.ok(fs.existsSync(path.join(libraryRoot, "INDEX.md")));

  const validated = run("validate-xhs-library.js", ["--library", libraryRoot]);
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(validated.stderr, "");
  const validation = JSON.parse(validated.stdout);
  assert.equal(validation.status, "valid");
  assert.equal(validation.counts.notes, 2);

  const summary = run("summarize-xhs-import.js", ["--library", libraryRoot, "--import", "cli-import-001"]);
  assert.equal(summary.status, 0, summary.stderr);
  assert.match(summary.stdout, /^# 导入摘要：CLI Fixture Notes/m);
  assert.match(summary.stdout, /Fixture Market/);
  assert.doesNotMatch(summary.stdout, /Synthetic body/);

  const summaryJson = run("summarize-xhs-import.js", ["--library", libraryRoot, "--import", "cli-import-001", "--json"]);
  assert.equal(summaryJson.status, 0, summaryJson.stderr);
  const parsedSummary = JSON.parse(summaryJson.stdout);
  assert.equal(parsedSummary.id, "cli-import-001");
  assert.deepEqual(parsedSummary.counts, importedResult.counts);
  assert.doesNotMatch(summaryJson.stdout, /Synthetic body/);

  const contextPath = path.join(tempRoot, "payload.json");
  fs.writeFileSync(contextPath, JSON.stringify({ ...payload, importId: "cli-import-002" }));
  const customLibrary = path.join(tempRoot, "explicit-private-library");
  const explicit = run("import-xhs-library.js", [
    "--workspace", workspace,
    "--library", customLibrary,
    "--context", contextPath,
  ]);
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(JSON.parse(explicit.stdout).libraryRoot, customLibrary);

  const help = run("import-xhs-library.js", ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(JSON.parse(help.stdout).usage, /--workspace/);
  assert.equal(help.stderr, "");

  for (const args of [
    [],
    ["--workspace", workspace],
    ["--stdin"],
    ["--workspace", workspace, "--context", contextPath, "--stdin"],
    ["--workspace", path.join(tempRoot, "missing"), "--stdin"],
    ["--workspace", workspace, "--context", path.join(tempRoot, "missing.json")],
  ]) {
    assertUsageFailure(run("import-xhs-library.js", args, JSON.stringify(payload)));
  }

  for (const invalidJson of ["null", "[]", "not json secret-value"]) {
    assertUsageFailure(run("import-xhs-library.js", ["--workspace", workspace, "--stdin"], invalidJson));
  }

  const secretPayloads = [
    { ...payload, importId: "secret-001", nested: { cookie: "secret-value" } },
    { ...payload, importId: "secret-002", nested: { Authorization: "Bearer secret-value" } },
    { ...payload, importId: "secret-003", nested: { xsec_token: "secret-value" } },
    { ...payload, importId: "secret-004", nested: { url: "https://www.xiaohongshu.com/explore/x?share_id=secret-value" } },
  ];
  for (const secretPayload of secretPayloads) {
    assertUsageFailure(run(
      "import-xhs-library.js",
      ["--workspace", workspace, "--stdin"],
      JSON.stringify(secretPayload),
    ));
    assert.ok(!fs.existsSync(path.join(libraryRoot, "imports", `2026-08-05-${secretPayload.importId}`)));
  }

  const allLibraryText = fs.readdirSync(path.join(libraryRoot, "notes"))
    .flatMap((noteId) => fs.readdirSync(path.join(libraryRoot, "notes", noteId)).map((file) => (
      fs.statSync(path.join(libraryRoot, "notes", noteId, file)).isFile()
        ? fs.readFileSync(path.join(libraryRoot, "notes", noteId, file), "utf8")
        : ""
    )))
    .join("\n");
  assert.doesNotMatch(allLibraryText, /xsec_token|share_id=|secret-value/);

  const corruptRecord = path.join(libraryRoot, "notes", "cli-note-a", "record.json");
  const corrupt = JSON.parse(fs.readFileSync(corruptRecord, "utf8"));
  corrupt.id = "wrong-id";
  fs.writeFileSync(corruptRecord, `${JSON.stringify(corrupt, null, 2)}\n`);
  const invalidValidation = run("validate-xhs-library.js", ["--library", libraryRoot]);
  assert.equal(invalidValidation.status, 1, invalidValidation.stderr);
  assert.equal(JSON.parse(invalidValidation.stdout).status, "invalid");
  assert.match(JSON.parse(invalidValidation.stdout).errors.join("\n"), /invalid note entry: cli-note-a/);
  assert.doesNotMatch(invalidValidation.stdout, /Synthetic body/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Xiaohongshu import CLI contract passed");
