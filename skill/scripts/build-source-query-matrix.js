#!/usr/bin/env node

import fs from "node:fs";
import { jsonInputUsage, readJsonContext } from "./cli-json-input.js";
import { buildQueryMatrix } from "./source-pack-runtime.js";

const command = "build-source-query-matrix.js";

try {
  const input = readJsonContext(process.argv.slice(2), process.argv.includes("--stdin") ? fs.readFileSync(0, "utf8") : "");
  if (input.help) {
    process.stdout.write(jsonInputUsage(command));
  } else {
    process.stdout.write(JSON.stringify(buildQueryMatrix(input.context), null, 2) + "\n");
  }
} catch (error) {
  process.stderr.write(error.message + "\n");
  process.exitCode = 2;
}
