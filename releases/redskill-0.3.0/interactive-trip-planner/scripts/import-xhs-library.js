#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { importIntoLibrary } from "./xhs-library-runtime.js";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const usage = {
  status: "usage",
  usage: "Usage: import-xhs-library.js --workspace <directory> [--library <directory>] [--asset-staging <directory>] (--context <file> | --stdin)",
};

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const result = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--stdin") {
      if (result.mode) throw new Error("Choose exactly one JSON input mode.");
      result.mode = "stdin";
      continue;
    }
    if (["--workspace", "--library", "--asset-staging", "--context"].includes(flag)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("A required command value is missing.");
      index += 1;
      if (flag === "--context") {
        if (result.mode) throw new Error("Choose exactly one JSON input mode.");
        result.mode = "context";
        result.contextPath = value;
      } else {
        const key = flag === "--workspace" ? "workspaceRoot" : flag === "--library" ? "libraryRoot" : "assetStagingRoot";
        if (result[key]) throw new Error("A command option was provided more than once.");
        result[key] = value;
      }
      continue;
    }
    throw new Error("Unknown command option.");
  }
  if (!result.workspaceRoot || !result.mode) throw new Error("Workspace and one JSON input mode are required.");
  return result;
}

function readBoundedFile(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new Error("JSON context must be a readable file.");
  }
  if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error("JSON context must be a readable bounded file.");
  return fs.readFileSync(file, "utf8");
}

function readPayload(args) {
  const source = args.mode === "stdin" ? fs.readFileSync(0, "utf8") : readBoundedFile(args.contextPath);
  if (Buffer.byteLength(source) > MAX_INPUT_BYTES) throw new Error("JSON input exceeds the size boundary.");
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("JSON input must contain a valid object.");
  }
  if (!parsed || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw new Error("JSON input must contain a valid object.");
  }
  return parsed;
}

function containsSensitiveInput(value) {
  if (typeof value === "string") {
    return /[?&](?:xsec_token|share_id|appuid)=/i.test(value)
      || /(?:^|\n)\s*(?:cookie|authorization)\s*:/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsSensitiveInput);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    /^(?:cookie|authorization|xsec_token|share_id|appuid|headers?|browserProfile)$/i.test(key)
    || containsSensitiveInput(child)
  ));
}

function requireDirectory(directory, label) {
  let stat;
  try {
    stat = fs.statSync(directory);
  } catch {
    throw new Error(`${label} must be an existing directory.`);
  }
  if (!stat.isDirectory()) throw new Error(`${label} must be an existing directory.`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${JSON.stringify(usage, null, 2)}\n`);
  } else {
    requireDirectory(args.workspaceRoot, "Workspace");
    if (args.assetStagingRoot) requireDirectory(args.assetStagingRoot, "Asset staging root");
    const payload = readPayload(args);
    if (containsSensitiveInput(payload)) throw new Error("Import payload contains forbidden credential or tracking data.");
    const result = importIntoLibrary({
      workspaceRoot: path.resolve(args.workspaceRoot),
      libraryRoot: args.libraryRoot ? path.resolve(args.libraryRoot) : undefined,
      assetStagingRoot: args.assetStagingRoot ? path.resolve(args.assetStagingRoot) : undefined,
      payload,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error?.message || "Xiaohongshu library import failed."}\n`);
  process.exitCode = 2;
}
