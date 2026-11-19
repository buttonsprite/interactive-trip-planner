#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultAmapCredentialStore, resolveAmapCredentials } from "./amap-credential-store.js";

function defaultCommandExists(command, env) {
  const searchPath = String(env.PATH || "");
  return searchPath.split(path.delimiter).filter(Boolean).some((directory) => {
    try {
      fs.accessSync(path.join(directory, command), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function probeAmapCapability({
  env = process.env,
  commandExists = (command) => defaultCommandExists(command, env),
  credentialResolution,
  store,
} = {}) {
  const cliAvailable = Boolean(commandExists("amap-gui"));
  const requiredCredentialNames = ["AMAP_KEY", "AMAP_SECURITY_KEY"];
  let resolution = credentialResolution;
  if (!resolution) {
    try {
      resolution = resolveAmapCredentials({
        env,
        store: store || createDefaultAmapCredentialStore({ env }),
      });
    } catch {
      resolution = { status: "store-unavailable", source: "none", savedProfileAvailable: false };
    }
  }
  const missingRequirements = resolution.status === "ready"
    ? []
    : requiredCredentialNames.filter((name) => typeof env[name] !== "string" || !env[name].trim());
  const credentialsConfigured = resolution.status === "ready";
  const status = !cliAvailable
    ? "missing-cli"
    : credentialsConfigured
      ? "available"
      : resolution.status;
  return {
    status,
    cliAvailable,
    credentialsConfigured,
    credentialSource: resolution.source || "none",
    savedProfileAvailable: Boolean(resolution.savedProfileAvailable),
    missingRequirements,
    routePlanningAvailable: cliAvailable && credentialsConfigured,
    routeVerification: "not-performed",
    mustNotSynthesizeRoutes: true,
    fallback: [
      "使用高德公开网页或 URI 入口人工复核地点和移动关系。 Manually verify places and travel relationships with the public AMap website or URI.",
      "使用其他可访问的公开地图搜索，并明确标记未完成 amap-gui 路网复核。 Use another accessible public map and clearly mark that amap-gui route verification was not completed.",
    ],
    factBoundary: "能力探测只确认命令与完整凭据来源可用，不输出凭据值，不执行搜索或路线，也不证明任何路线结果。",
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) process.stdout.write(JSON.stringify(probeAmapCapability(), null, 2) + "\n");
