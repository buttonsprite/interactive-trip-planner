#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const usage = {
  status: "usage",
  usage: "Usage: summarize-xhs-import.js --library <directory> --import <import-id> [--json]",
};

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const result = { help: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") {
      if (result.json) throw new Error("--json was provided more than once.");
      result.json = true;
      continue;
    }
    if (flag === "--library" || flag === "--import") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("A required command value is missing.");
      index += 1;
      const key = flag === "--library" ? "libraryRoot" : "importId";
      if (result[key]) throw new Error("A command option was provided more than once.");
      result[key] = value;
      continue;
    }
    throw new Error("Unknown command option.");
  }
  if (!result.libraryRoot || !result.importId || !safeIdPattern.test(result.importId)) {
    throw new Error("A library and safe import ID are required.");
  }
  return result;
}

function isInside(target, boundary) {
  const relative = path.relative(boundary, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${JSON.stringify(usage, null, 2)}\n`);
  } else {
    const root = path.resolve(args.libraryRoot);
    const library = JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8"));
    const entry = library.imports?.find((candidate) => candidate.id === args.importId);
    if (!entry) throw new Error("Import ID was not found in this library.");
    const manifestPath = path.resolve(root, entry.path);
    if (!isInside(manifestPath, root) || fs.lstatSync(manifestPath).isSymbolicLink()) {
      throw new Error("Import manifest path is unsafe.");
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (args.json) {
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    } else {
      const summaryPath = path.join(path.dirname(manifestPath), "summary.md");
      if (fs.lstatSync(summaryPath).isSymbolicLink()) throw new Error("Import summary path is unsafe.");
      process.stdout.write(fs.readFileSync(summaryPath, "utf8"));
    }
  }
} catch (error) {
  process.stderr.write(`${error?.message || "Xiaohongshu import summary failed."}\n`);
  process.exitCode = 2;
}

