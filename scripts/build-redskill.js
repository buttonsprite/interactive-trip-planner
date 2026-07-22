#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = repositoryPackage.version;
const releaseRoot = path.join(repoRoot, "releases", `redskill-${version}`);
const builder = path.join(repoRoot, "skill", "scripts", "build-redskill-release.js");

execFileSync(process.execPath, [builder, releaseRoot, version], { stdio: "inherit" });

const installTemplatePath = path.join(repoRoot, "docs", "REDSKILL_INSTALL.template.md");
const installText = fs.readFileSync(installTemplatePath, "utf8").replaceAll("{{VERSION}}", version);
fs.writeFileSync(path.join(releaseRoot, "INSTALL.zh-CN.md"), installText);

console.log(`prepared REDSkill ${version} at ${path.relative(repoRoot, releaseRoot)}`);
