#!/usr/bin/env node

import {
  createDefaultCredentialDependencies,
  runAmapCredentialCli,
} from "./amap-credentials-runtime.js";

const argv = process.argv.slice(2);
const helpOnly = argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h");
const validAction = argv.length === 1 && new Set(["setup", "status", "update", "remove"]).has(argv[0]);
const deps = helpOnly || !validAction ? {} : createDefaultCredentialDependencies();
const result = runAmapCredentialCli(argv, deps);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
