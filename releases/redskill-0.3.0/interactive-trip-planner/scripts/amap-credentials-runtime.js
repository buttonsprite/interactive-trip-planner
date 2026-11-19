import os from "node:os";
import { spawnSync } from "node:child_process";
import { createDefaultAmapCredentialStore, resolveAmapCredentials } from "./amap-credential-store.js";
import { probeAmapCapability } from "./check-amap-cli.js";
import { executeAmapRequest } from "./amap-cli-runtime.js";

const USAGE = "Usage: amap-credentials.js <setup|status|update|remove>";
const ACTIONS = new Set(["setup", "status", "update", "remove"]);
const INVALID_COMMAND = "Invalid AMap credential command.";

const NEXT_STEPS = {
  ready: "高德地图已连接。地点搜索和路线复核会自动使用当前安全配置。 AMap is connected. Place search and route review will use the current secure configuration automatically.",
  "already-configured": "本机已有高德安全配置；如需替换，请运行 update。 A saved AMap configuration already exists. Run update to replace it.",
  "missing-cli": "请先安装 @amap-lbs/amap-gui，再重新运行此命令。 Install @amap-lbs/amap-gui, then run this command again.",
  "missing-credentials": "请运行 setup 完成一次安全配置。 Run setup once to save AMap credentials securely.",
  "interactive-required": "请在交互式终端运行 setup 或 update；不要把密钥粘贴进聊天或命令参数。 Run setup or update in an interactive terminal; do not paste secrets into chat or command arguments.",
  "partial-environment-credentials": "环境变量只提供了一项凭据；请补齐两项或全部清除。 Only one environment credential is set; provide both or clear both.",
  "store-unavailable": "当前系统安全存储不可用；请启用系统 Keychain/DPAPI/Secret Service，或仅为本次会话提供完整环境变量。 The system credential store is unavailable; enable Keychain, DPAPI, or Secret Service, or provide the complete environment pair for this session only.",
  "store-corrupt": "已保存配置无法安全读取；请先运行 remove，再重新 setup。 The saved configuration cannot be read safely. Run remove, then setup again.",
  "invalid-credentials": "新凭据未通过真实 POI 与路线验证，旧配置保持不变。 The new credentials did not pass real POI and route validation; the previous configuration remains active.",
  removed: "已删除本 Skill 的本机高德配置；高德控制台中的 Key 不受影响。 This Skill's saved AMap configuration was removed; the Key in the AMap console is unchanged.",
};

function publicResult({ status, platform, source = "none", savedProfileAvailable = false, nextStep }) {
  return {
    status,
    platform,
    source,
    savedProfileAvailable: Boolean(savedProfileAvailable),
    providerReady: false,
    nextStep: nextStep || NEXT_STEPS[status] || NEXT_STEPS["store-unavailable"],
  };
}

function safeStoreStatus(store) {
  try {
    return store.status();
  } catch {
    return { status: "store-unavailable", source: "none", savedProfileAvailable: false };
  }
}

function safeResolution(env, store) {
  try {
    return resolveAmapCredentials({ env, store });
  } catch {
    return { status: "store-unavailable", source: "none", savedProfileAvailable: false };
  }
}

export function runAmapCredentialAction(action, {
  platform = process.platform,
  env = process.env,
  store,
  cliAvailable = false,
  isTTY = false,
  validateCredentials = () => ({ searchStatus: "provider-error", routeStatus: "provider-error" }),
  stopProvider = () => {},
} = {}) {
  if (!ACTIONS.has(action) || !store) throw new Error(INVALID_COMMAND);

  const resolution = safeResolution(env, store);
  if (action === "status") {
    if (!cliAvailable) {
      return publicResult({
        status: "missing-cli",
        platform,
        source: resolution.source,
        savedProfileAvailable: resolution.savedProfileAvailable,
      });
    }
    return publicResult({ ...resolution, platform });
  }

  if (action === "remove") {
    try {
      stopProvider();
    } catch {
      // Removal still proceeds; raw provider diagnostics are intentionally ignored.
    }
    try {
      store.removeActive();
    } catch {
      return publicResult({
        status: "store-corrupt",
        platform,
        savedProfileAvailable: safeStoreStatus(store).savedProfileAvailable,
      });
    }
    return publicResult({ status: "removed", platform });
  }

  if (!cliAvailable) {
    return publicResult({
      status: "missing-cli",
      platform,
      source: resolution.source,
      savedProfileAvailable: resolution.savedProfileAvailable,
    });
  }
  if (!isTTY) {
    return publicResult({
      status: resolution.status === "ready" ? "ready" : "missing-credentials",
      platform,
      source: resolution.source,
      savedProfileAvailable: resolution.savedProfileAvailable,
      nextStep: NEXT_STEPS["interactive-required"],
    });
  }

  const storeState = safeStoreStatus(store);
  if (action === "setup" && storeState.savedProfileAvailable) {
    return publicResult({
      status: resolution.status,
      platform,
      source: resolution.source,
      savedProfileAvailable: true,
      nextStep: NEXT_STEPS["already-configured"],
    });
  }

  let candidateId = null;
  try {
    const candidate = store.beginCandidate();
    candidateId = candidate.profileId;
    const credentials = store.readCandidate(candidateId);
    const validation = validateCredentials(credentials);
    if (validation?.searchStatus !== "ok" || validation?.routeStatus !== "ok") {
      store.discardCandidate(candidateId);
      candidateId = null;
      return publicResult({
        status: "invalid-credentials",
        platform,
        source: resolution.source,
        savedProfileAvailable: storeState.savedProfileAvailable,
      });
    }
    store.commitCandidate(candidateId);
    candidateId = null;
    return publicResult({
      status: "ready",
      platform,
      source: "system-store",
      savedProfileAvailable: true,
    });
  } catch {
    if (candidateId) {
      try {
        store.discardCandidate(candidateId);
      } catch {
        // Candidate cleanup is retried by the store on the next setup/update.
      }
    }
    return publicResult({
      status: "store-unavailable",
      platform,
      source: resolution.source,
      savedProfileAvailable: safeStoreStatus(store).savedProfileAvailable,
    });
  }
}

export function runAmapCredentialCli(argv, deps) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ status: "usage", usage: USAGE }, null, 2)}\n`,
      stderr: "",
    };
  }
  if (argv.length !== 1 || !ACTIONS.has(argv[0])) {
    return { exitCode: 2, stdout: "", stderr: `${INVALID_COMMAND}\n` };
  }
  try {
    const result = runAmapCredentialAction(argv[0], deps);
    return { exitCode: 0, stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: "" };
  } catch {
    return { exitCode: 2, stdout: "", stderr: `${INVALID_COMMAND}\n` };
  }
}

const HIDDEN_PROMPT_SCRIPT = String.raw`
const readline = require('node:readline');
const label = process.argv[1] || 'Secret';
process.stderr.write(label + ': ');
const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl._writeToOutput = function () {};
rl.question('', (answer) => {
  rl.close();
  process.stderr.write('\n');
  process.stdout.write(answer);
});
rl.on('SIGINT', () => process.exit(130));
`;

export function promptHiddenSecret(label) {
  const result = spawnSync(process.execPath, ["-e", HIDDEN_PROMPT_SCRIPT, label], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
    shell: false,
    timeout: 120_000,
  });
  return result?.status === 0 && typeof result.stdout === "string" && result.stdout
    ? result.stdout
    : null;
}

export function validateAmapCredentials(credentials, {
  executeRequest = executeAmapRequest,
} = {}) {
  const credentialResolution = {
    status: "ready",
    source: "system-store",
    credentials,
    savedProfileAvailable: false,
  };
  const search = executeRequest({
    action: "search-poi",
    keyword: "大理古城南门",
    city: "大理",
    pageSize: 3,
    pageIndex: 1,
  }, { credentialResolution });
  const route = executeRequest({
    action: "route",
    origin: {
      name: "大理古城南门",
      position: { lng: 100.1651, lat: 25.6889 },
    },
    destination: {
      name: "五华楼",
      position: { lng: 100.164, lat: 25.6956 },
    },
    mode: "walking",
  }, { credentialResolution });
  return { searchStatus: search?.status || "provider-error", routeStatus: route?.status || "provider-error" };
}

export function stopAmapProvider() {
  try {
    spawnSync("amap-gui", ["stop"], {
      encoding: "utf8",
      shell: false,
      timeout: 35_000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    // Raw provider diagnostics are intentionally ignored.
  }
}

export function createDefaultCredentialDependencies({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
  promptSecret = promptHiddenSecret,
  validateCredentials: validator = validateAmapCredentials,
  stopProvider = stopAmapProvider,
} = {}) {
  const store = createDefaultAmapCredentialStore({ platform, env, homedir, promptSecret });
  const capability = probeAmapCapability({ env, store });
  return {
    platform,
    env,
    store,
    cliAvailable: capability.cliAvailable,
    isTTY: Boolean(process.stdin.isTTY && process.stderr.isTTY),
    validateCredentials: validator,
    stopProvider,
  };
}
