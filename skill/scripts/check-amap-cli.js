#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_CREDENTIAL_NAMES = ["AMAP_KEY", "AMAP_SECURITY_KEY"];

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

export function resolveEnvAmapCredentials(env = process.env) {
  const key = typeof env?.AMAP_KEY === "string" ? env.AMAP_KEY.trim() : "";
  const securityKey = typeof env?.AMAP_SECURITY_KEY === "string" ? env.AMAP_SECURITY_KEY.trim() : "";
  if (key && securityKey) {
    return {
      status: "ready",
      source: "env",
      credentials: { AMAP_KEY: key, AMAP_SECURITY_KEY: securityKey },
    };
  }
  if (key || securityKey) {
    return { status: "partial-environment-credentials", source: "env" };
  }
  return { status: "missing-credentials", source: "none" };
}

export function probeAmapCapability({
  env = process.env,
  commandExists = (command) => defaultCommandExists(command, env),
} = {}) {
  const cliAvailable = Boolean(commandExists("amap-gui"));
  const resolution = resolveEnvAmapCredentials(env);
  const missingRequirements = REQUIRED_CREDENTIAL_NAMES.filter(
    (name) => typeof env?.[name] !== "string" || !env[name].trim(),
  );
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
    credentialSource: resolution.source,
    missingRequirements,
    routePlanningAvailable: cliAvailable && credentialsConfigured,
    routeVerification: "not-performed",
    mustNotSynthesizeRoutes: true,
    fallback: [
      "使用高德公开网页或 URI 入口人工复核地点和移动关系。",
      "使用其他可访问的公开地图搜索，并明确标记未完成高德路网复核。",
    ],
    factBoundary: "能力探测只确认 amap-gui 命令与环境变量凭据就绪，不输出凭据值，不执行搜索或路线，也不证明任何路线结果。",
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) process.stdout.write(JSON.stringify(probeAmapCapability(), null, 2) + "\n");
