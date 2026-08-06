#!/usr/bin/env node

import path from "node:path";
import { validateLibrary } from "./xhs-library-runtime.js";

const usage = {
  status: "usage",
  usage: "Usage: validate-xhs-library.js --library <directory>",
};

try {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(`${JSON.stringify(usage, null, 2)}\n`);
  } else {
    if (argv.length !== 2 || argv[0] !== "--library" || !argv[1]) {
      throw new Error("Provide exactly one --library directory.");
    }
    const result = validateLibrary({ libraryRoot: path.resolve(argv[1]) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "valid") process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error?.message || "Xiaohongshu library validation failed."}\n`);
  process.exitCode = 2;
}

