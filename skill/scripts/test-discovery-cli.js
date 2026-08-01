#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-trip-planner-discovery-cli-"));
const contextPath = path.join(tempDir, "taste-context.json");
const spainPath = path.join(tempDir, "spain-context.json");
const missingPath = path.join(tempDir, "missing-context.json");
const directoryPath = path.join(tempDir, "context-directory");

fs.writeFileSync(contextPath, JSON.stringify({
  destination: "Paris",
  playStyles: ["architecture", "neighborhood-walk"],
  pace: "unhurried",
  companions: ["solo"],
  interests: ["craft", "art", "markets"],
}));
fs.writeFileSync(spainPath, JSON.stringify({
  countryCode: "ES",
  destination: "Barcelona",
  yearMonth: "octubre 2026",
  localLanguageTags: ["es", "ca"],
  tasteTerms: ["vida de barrio", "mercado municipal"],
}));
fs.mkdirSync(directoryPath);

function run(script, args = [], input) {
  return spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
    encoding: "utf8",
    input,
  });
}

try {
  const taste = run("recommend-taste-models.js", ["--context", contextPath]);
  assert.equal(taste.status, 0, taste.stderr);
  assert.equal(JSON.parse(taste.stdout).recommendations[0].id, "city-craft-rhythm");
  assert.equal(taste.stderr, "");

  const unknown = run("recommend-taste-models.js", ["--stdin"], JSON.stringify({ interests: ["street-life"] }));
  assert.equal(unknown.status, 0, unknown.stderr);
  assert.deepEqual(JSON.parse(unknown.stdout).unknownTerms.interests, ["street-life"]);

  const queries = run("build-source-query-matrix.js", ["--context", spainPath]);
  assert.equal(queries.status, 0, queries.stderr);
  assert.equal(JSON.parse(queries.stdout).status, "ready");
  assert.doesNotMatch(queries.stdout, /当地语言|\{local:/);

  const help = run("recommend-taste-models.js", ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  assert.notEqual(run("recommend-taste-models.js", ["--context", missingPath]).status, 0);
  assert.equal(run("recommend-taste-models.js", ["--context", directoryPath]).status, 2);
  assert.equal(run("recommend-taste-models.js", []).status, 2);
  assert.equal(run("recommend-taste-models.js", ["--context", contextPath, "--stdin"]).status, 2);
  assert.equal(run("recommend-taste-models.js", ["--stdin"], "not json").status, 2);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Discovery CLI contract passed");
