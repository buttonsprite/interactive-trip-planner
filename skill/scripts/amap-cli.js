#!/usr/bin/env node

import fs from "node:fs";
import { jsonInputUsage, parseJsonInputArgs, readJsonContext } from "./cli-json-input.js";
import { executeAmapRequest } from "./amap-cli-runtime.js";

const command = "amap-cli.js";
const SAFE_INPUT_ERRORS = new Set([
  "Provide exactly one of --context <file> or --stdin.",
  "Context must contain valid JSON.",
  "Context must be a JSON object.",
  "Context path must be a readable file.",
  "Invalid AMap action.",
  "Invalid AMap search request.",
  "Invalid AMap route request.",
]);

try {
  const argv = process.argv.slice(2);
  const args = parseJsonInputArgs(argv);
  if (args.help) {
    process.stdout.write(JSON.stringify(jsonInputUsage(command), null, 2) + "\n");
  } else {
    const stdin = args.mode === "stdin" ? fs.readFileSync(0, "utf8") : "";
    const input = readJsonContext(argv, stdin);
    process.stdout.write(JSON.stringify(executeAmapRequest(input.context), null, 2) + "\n");
  }
} catch (error) {
  const message = SAFE_INPUT_ERRORS.has(error?.message) ? error.message : "Invalid AMap request.";
  process.stderr.write(message + "\n");
  process.exitCode = 2;
}
