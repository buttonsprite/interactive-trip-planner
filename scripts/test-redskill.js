#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const releaseRoot = path.join(repoRoot, "releases", `redskill-${repositoryPackage.version}`);
const releaseTest = path.join(repoRoot, "skill", "scripts", "test-redskill-release.js");

execFileSync(process.execPath, [releaseTest, releaseRoot, repositoryPackage.version], { stdio: "inherit" });
