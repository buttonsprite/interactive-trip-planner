#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const read = (relativePath) => fs.readFileSync(path.join(skillRoot, relativePath), "utf8");

const skill = read("SKILL.md");
const planningWorkflow = read("references/planning-workflow.md");
const sourceVerification = read("references/source-verification.md");
const onlineLogic = read("references/taste-and-source-online-logic.md");

for (const mode of ["first-visit", "return-visit", "landmark-light", "local-only", "balanced-visitor"]) {
  assert.match(planningWorkflow, new RegExp(mode));
}
assert.match(skill, /代表性景点/);
assert.match(planningWorkflow, /至少评估 3 个/);
assert.match(planningWorkflow, /2[–-]4 个代表性主锚点/);
assert.match(planningWorkflow, /重型景点[^\n]*每天最多 1 个/);
assert.match(planningWorkflow, /同方向[^\n]*(市场|居民广场|社区)/);
assert.match(sourceVerification, /著名景点[^\n]*不能[^\n]*游客多/);
assert.match(onlineLogic, /visitor mode/);
console.log("First-visit tourist/local balance contract passed");
