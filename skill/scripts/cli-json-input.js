#!/usr/bin/env node

import fs from "node:fs";

export function jsonInputUsage(command) {
  return `Usage: ${command} (--context <file> | --stdin)\n`;
}

export function readJsonContext(argv, stdin) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };

  let source;
  if (argv.length === 2 && argv[0] === "--context") {
    const contextPath = argv[1];
    if (!fs.existsSync(contextPath)) throw new Error("Context file does not exist.");
    if (!fs.statSync(contextPath).isFile()) throw new Error("Context path must be a file.");
    source = fs.readFileSync(contextPath, "utf8");
  } else if (argv.length === 1 && argv[0] === "--stdin") {
    source = stdin;
  } else {
    throw new Error("Provide exactly one of --context <file> or --stdin.");
  }

  try {
    return { help: false, context: JSON.parse(source) };
  } catch {
    throw new Error("Context must contain valid JSON.");
  }
}
