import { spawnSync } from "node:child_process";

const SESSION_ERROR = "AMap provider session failed.";
const LIFECYCLE_TIMEOUT_MS = 35_000;

function defaultRunLifecycleCommand(command, args, options) {
  return spawnSync(command, args, options);
}

function credentialPair(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const AMAP_KEY = typeof value.AMAP_KEY === "string" ? value.AMAP_KEY.trim() : "";
  const AMAP_SECURITY_KEY = typeof value.AMAP_SECURITY_KEY === "string"
    ? value.AMAP_SECURITY_KEY.trim()
    : "";
  return AMAP_KEY && AMAP_SECURITY_KEY ? { AMAP_KEY, AMAP_SECURITY_KEY } : null;
}

function runLifecycle(runCommand, args, env) {
  let result;
  try {
    result = runCommand("amap-gui", args, {
      encoding: "utf8",
      env,
      shell: false,
      timeout: LIFECYCLE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error(SESSION_ERROR);
  }
  if (!result || result.status !== 0 || result.error) throw new Error(SESSION_ERROR);
  return result;
}

function assertReady(result) {
  try {
    const payload = JSON.parse(result.stdout);
    if (payload?.success !== true || payload?.data?.mapReady !== true) {
      throw new Error(SESSION_ERROR);
    }
  } catch {
    throw new Error(SESSION_ERROR);
  }
}

export function withAmapProviderSession({
  credentials,
  env = process.env,
  runLifecycleCommand = defaultRunLifecycleCommand,
} = {}, operation) {
  const pair = credentialPair(credentials);
  if (!pair || typeof operation !== "function") throw new Error(SESSION_ERROR);
  const providerEnv = { ...env, ...pair };
  try {
    runLifecycle(runLifecycleCommand, ["stop"], providerEnv);
    runLifecycle(runLifecycleCommand, ["start"], providerEnv);
    assertReady(runLifecycle(runLifecycleCommand, ["status"], providerEnv));
    try {
      return operation(providerEnv);
    } catch {
      throw new Error(SESSION_ERROR);
    }
  } catch {
    throw new Error(SESSION_ERROR);
  } finally {
    try {
      runLifecycle(runLifecycleCommand, ["stop"], providerEnv);
    } catch {
      throw new Error(SESSION_ERROR);
    }
  }
}
