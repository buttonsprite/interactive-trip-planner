#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectSourcePacks } from "./source-pack-runtime.js";
import { validateSourcePacks } from "./validate-source-packs.js";
import { validateTasteModels } from "./validate-taste-models.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trip-planner-contribution-"));
const fixtureSkillRoot = path.join(fixtureRoot, "skill");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

try {
  fs.mkdirSync(fixtureSkillRoot, { recursive: true });
  fs.cpSync(path.join(skillRoot, "assets"), path.join(fixtureSkillRoot, "assets"), { recursive: true });

  const tasteRoot = path.join(fixtureSkillRoot, "assets", "taste-models");
  const curatorId = "curator-slow-design-weekend";
  const curatorDirectory = path.join(tasteRoot, curatorId);
  fs.cpSync(path.join(tasteRoot, "city-craft-rhythm"), curatorDirectory, { recursive: true });
  const curatorModelPath = path.join(curatorDirectory, "model.json");
  const curatorModel = readJson(curatorModelPath);
  curatorModel.id = curatorId;
  curatorModel.name = "Curator Slow Design Weekend";
  curatorModel.sourceType = "curator-owned";
  curatorModel.version = "1.2.0";
  curatorModel.status = "community";
  curatorModel.owner = {
    name: "Fixture Curator",
    type: "curator",
    identifier: "fixture-curator",
    confirmed: true,
  };
  curatorModel.license = {
    content: "CC-BY-4.0",
    attribution: "Fixture Curator",
  };
  const curatorTripId = "curator-owned-tokyo";
  const sharedSampleRoot = path.resolve(curatorDirectory, curatorModel.representativeTrips[0].path);
  const curatorExampleRoot = path.join(curatorDirectory, "examples", curatorTripId);
  fs.cpSync(sharedSampleRoot, curatorExampleRoot, { recursive: true });
  curatorModel.representativeTrips[0].id = curatorTripId;
  curatorModel.representativeTrips[0].path = "examples/" + curatorTripId;
  curatorModel.representativeTrips[0].representativeReason = "Fixture curator-owned complete example.";
  writeJson(curatorModelPath, curatorModel);
  const tasteRegistryPath = path.join(tasteRoot, "index.json");
  const tasteRegistry = readJson(tasteRegistryPath);
  tasteRegistry.models.push({
    id: curatorId,
    path: curatorId,
    status: "community",
    version: "1.2.0",
  });
  writeJson(tasteRegistryPath, tasteRegistry);

  const sourceRoot = path.join(fixtureSkillRoot, "assets", "source-packs");
  const sourcePackId = "iberia-fixture";
  const sourcePackPath = path.join(sourceRoot, sourcePackId + ".json");
  const sourcePack = readJson(path.join(sourceRoot, "japan.json"));
  sourcePack.id = sourcePackId;
  sourcePack.name = "Iberia Fixture";
  sourcePack.version = "1.4.0";
  sourcePack.regions = ["Spain", "Portugal"];
  sourcePack.languageStrategy.localLanguageTags = ["es", "pt"];
  writeJson(sourcePackPath, sourcePack);
  const sourceRegistryPath = path.join(sourceRoot, "index.json");
  const sourceRegistry = readJson(sourceRegistryPath);
  sourceRegistry.packs.push({
    id: sourcePackId,
    path: sourcePackId + ".json",
    countryCodes: ["ES", "PT"],
    version: "1.4.0",
  });
  writeJson(sourceRegistryPath, sourceRegistry);

  assert.equal(validateTasteModels({ skillRoot: fixtureSkillRoot }).modelCount, 3);
  assert.equal(validateSourcePacks({ skillRoot: fixtureSkillRoot }).packCount, 5);
  assert.deepEqual(selectSourcePacks({ countryCode: "ES" }, { skillRoot: fixtureSkillRoot }), [
    "global-base",
    sourcePackId,
  ]);

  curatorModel.representativeTrips[0].path = "../../samples/golden/tokyo-rail-neon-craft";
  writeJson(curatorModelPath, curatorModel);
  assert.throws(
    () => validateTasteModels({ skillRoot: fixtureSkillRoot }),
    /curator-owned representative path.*inside model directory/i,
  );
  curatorModel.representativeTrips[0].path = "examples/" + curatorTripId;
  writeJson(curatorModelPath, curatorModel);

  curatorModel.owner.confirmed = false;
  writeJson(curatorModelPath, curatorModel);
  assert.throws(() => validateTasteModels({ skillRoot: fixtureSkillRoot }), /owner.*confirmed/i);
  curatorModel.owner.confirmed = true;

  curatorModel.representativeTrips[0].authorization.privacyReviewed = false;
  writeJson(curatorModelPath, curatorModel);
  assert.throws(() => validateTasteModels({ skillRoot: fixtureSkillRoot }), /privacyReviewed/i);
  curatorModel.representativeTrips[0].authorization.privacyReviewed = true;
  writeJson(curatorModelPath, curatorModel);

  const privateExampleNote = path.join(curatorExampleRoot, "docs", "private-owner-note.md");
  fs.writeFileSync(privateExampleNote, "Private source path: /Users/fixture-curator/private-trip\n");
  assert.throws(() => validateTasteModels({ skillRoot: fixtureSkillRoot }), /privacy scan/i);
  fs.rmSync(privateExampleNote);

  const unsupportedExampleFile = path.join(curatorExampleRoot, "docs", "notes.txt");
  fs.writeFileSync(unsupportedExampleFile, "unsupported curator example format\n");
  assert.throws(
    () => validateTasteModels({ skillRoot: fixtureSkillRoot }),
    /unsupported model file.*examples.*notes\.txt/i,
  );
  fs.rmSync(unsupportedExampleFile);

  const nestedExecutable = path.join(curatorExampleRoot, "nested", "bypass.js");
  fs.mkdirSync(path.dirname(nestedExecutable), { recursive: true });
  fs.writeFileSync(nestedExecutable, "export default true;\n");
  assert.throws(() => validateTasteModels({ skillRoot: fixtureSkillRoot }), /contains executable.*nested.*bypass\.js/i);

  console.log("Generic curator model and source-pack contribution fixture passed");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
