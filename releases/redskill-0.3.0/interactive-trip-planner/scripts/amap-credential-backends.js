import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const STORE_ERROR = "AMap credential store failed.";
const SERVICE = "com.pmacyx.interactive-trip-planner.amap";
const COMMAND_TIMEOUT_MS = 20_000;

const WINDOWS_DPAPI_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$root = [string]$request.root
$profiles = Join-Path $root 'profiles'
function Assert-SafePath([string]$target) {
  if (Test-Path -LiteralPath $target) {
    $item = Get-Item -LiteralPath $target -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'unsafe-path' }
  }
}
function Set-CurrentUserOnly([string]$target) {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $target -AclObject $acl
}
function Profile-Path([string]$id) { Join-Path $profiles ($id + '.json') }
if ($request.operation -eq 'probe') {
  [Security.Cryptography.ProtectedData] | Out-Null
  @{ status = 'ok' } | ConvertTo-Json -Compress
  exit 0
}
Assert-SafePath $root
if ($request.operation -eq 'write') {
  if (-not (Test-Path -LiteralPath $root)) { New-Item -ItemType Directory -Path $root | Out-Null }
  Assert-SafePath $root
  Set-CurrentUserOnly $root
  if (-not (Test-Path -LiteralPath $profiles)) { New-Item -ItemType Directory -Path $profiles | Out-Null }
  Assert-SafePath $profiles
  Set-CurrentUserOnly $profiles
  $keyBytes = [Text.Encoding]::UTF8.GetBytes([string]$request.AMAP_KEY)
  $securityBytes = [Text.Encoding]::UTF8.GetBytes([string]$request.AMAP_SECURITY_KEY)
  $protectedKey = [Security.Cryptography.ProtectedData]::Protect($keyBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $protectedSecurity = [Security.Cryptography.ProtectedData]::Protect($securityBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $payload = @{
    version = 1
    profileId = [string]$request.profileId
    key = [Convert]::ToBase64String($protectedKey)
    securityKey = [Convert]::ToBase64String($protectedSecurity)
  } | ConvertTo-Json -Compress
  $destination = Profile-Path ([string]$request.profileId)
  Assert-SafePath $destination
  $temporary = $destination + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
  [IO.File]::WriteAllText($temporary, $payload, (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temporary -Destination $destination -Force
  @{ status = 'ok' } | ConvertTo-Json -Compress
  exit 0
}
if ($request.operation -eq 'read') {
  $source = Profile-Path ([string]$request.profileId)
  Assert-SafePath $source
  if (-not (Test-Path -LiteralPath $source)) { @{ status = 'missing' } | ConvertTo-Json -Compress; exit 0 }
  $payload = Get-Content -LiteralPath $source -Raw | ConvertFrom-Json
  if ($payload.version -ne 1 -or [string]$payload.profileId -ne [string]$request.profileId) { throw 'invalid-profile' }
  $key = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([string]$payload.key), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))
  $securityKey = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([string]$payload.securityKey), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))
  @{ status = 'ok'; credentials = @{ AMAP_KEY = $key; AMAP_SECURITY_KEY = $securityKey } } | ConvertTo-Json -Compress
  exit 0
}
if ($request.operation -eq 'delete') {
  $source = Profile-Path ([string]$request.profileId)
  Assert-SafePath $source
  if (Test-Path -LiteralPath $source) { Remove-Item -LiteralPath $source -Force }
  @{ status = 'ok' } | ConvertTo-Json -Compress
  exit 0
}
throw 'invalid-operation'
`;

function defaultRunCommand(command, args, options) {
  return spawnSync(command, args, options);
}

function fixedError() {
  return new Error(STORE_ERROR);
}

function commandSucceeded(result) {
  return result && result.status === 0 && !result.error;
}

function runSafely(runCommand, command, args, options = {}) {
  try {
    return runCommand(command, args, {
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      shell: false,
      ...options,
      shell: false,
    });
  } catch {
    return null;
  }
}

function runRequired(runCommand, command, args, options = {}) {
  const result = runSafely(runCommand, command, args, options);
  if (!commandSucceeded(result)) throw fixedError();
  return result;
}

function cleanNativeSecret(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\r?\n$/, "");
  return cleaned ? cleaned : null;
}

function account(profileId, kind) {
  return `${profileId}:${kind}`;
}

function createMacBackend(runCommand, announcePrompt) {
  const runSecurity = (args, options) => runRequired(runCommand, "security", args, options);
  const deleteAccount = (profileId, kind) => {
    runSafely(runCommand, "security", [
      "delete-generic-password",
      "-a", account(profileId, kind),
      "-s", SERVICE,
    ]);
  };
  return {
    availability() {
      const result = runSafely(runCommand, "security", ["help"]);
      return { status: commandSucceeded(result) ? "available" : "store-unavailable" };
    },
    capturePair(profileId) {
      const kinds = ["key", "security-key"];
      try {
        for (const kind of kinds) {
          announcePrompt(kind === "key" ? "AMAP_KEY" : "AMAP_SECURITY_KEY");
          runSecurity([
            "add-generic-password",
            "-U",
            "-a", account(profileId, kind),
            "-s", SERVICE,
            "-w",
          ], { stdio: ["inherit", "pipe", "pipe"] });
        }
      } catch {
        for (const kind of kinds) deleteAccount(profileId, kind);
        throw fixedError();
      }
    },
    readPair(profileId) {
      const read = (kind) => {
        const result = runSafely(runCommand, "security", [
          "find-generic-password",
          "-a", account(profileId, kind),
          "-s", SERVICE,
          "-w",
        ]);
        return commandSucceeded(result) ? cleanNativeSecret(result.stdout) : null;
      };
      const AMAP_KEY = read("key");
      const AMAP_SECURITY_KEY = read("security-key");
      return AMAP_KEY && AMAP_SECURITY_KEY ? { AMAP_KEY, AMAP_SECURITY_KEY } : null;
    },
    deletePair(profileId) {
      deleteAccount(profileId, "key");
      deleteAccount(profileId, "security-key");
    },
  };
}

function parsePowerShellResult(result) {
  if (!commandSucceeded(result) || typeof result.stdout !== "string") throw fixedError();
  try {
    const value = JSON.parse(result.stdout.trim());
    if (!value || typeof value !== "object") throw fixedError();
    return value;
  } catch {
    throw fixedError();
  }
}

function createWindowsBackend({ runCommand, promptSecret, configRoot }) {
  const invoke = (request) => {
    const result = runRequired(runCommand, "powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", WINDOWS_DPAPI_SCRIPT,
    ], { input: JSON.stringify({ ...request, root: configRoot }), stdio: ["pipe", "pipe", "pipe"] });
    return parsePowerShellResult(result);
  };
  return {
    availability() {
      try {
        return { status: invoke({ operation: "probe" }).status === "ok" ? "available" : "store-unavailable" };
      } catch {
        return { status: "store-unavailable" };
      }
    },
    capturePair(profileId) {
      try {
        const AMAP_KEY = promptSecret("AMAP_KEY");
        if (typeof AMAP_KEY !== "string" || !AMAP_KEY) throw fixedError();
        const AMAP_SECURITY_KEY = promptSecret("AMAP_SECURITY_KEY");
        if (typeof AMAP_SECURITY_KEY !== "string" || !AMAP_SECURITY_KEY) throw fixedError();
        const result = invoke({ operation: "write", profileId, AMAP_KEY, AMAP_SECURITY_KEY });
        if (result.status !== "ok") throw fixedError();
      } catch {
        throw fixedError();
      }
    },
    readPair(profileId) {
      const result = invoke({ operation: "read", profileId });
      if (result.status === "missing") return null;
      return result.status === "ok" ? result.credentials : null;
    },
    deletePair(profileId) {
      const result = invoke({ operation: "delete", profileId });
      if (result.status !== "ok") throw fixedError();
    },
  };
}

function linuxAttributes(profileId, kind) {
  return ["service", "interactive-trip-planner", "profile", profileId, "kind", kind];
}

function createLinuxBackend({ runCommand, promptSecret, env }) {
  const available = () => {
    if (typeof env.DBUS_SESSION_BUS_ADDRESS !== "string" || !env.DBUS_SESSION_BUS_ADDRESS.trim()) return false;
    const result = runSafely(runCommand, "secret-tool", [
      "search", "--all", "service", "interactive-trip-planner",
    ], { env, stdio: ["ignore", "pipe", "pipe"] });
    return commandSucceeded(result);
  };
  const clear = (profileId, kind) => {
    runSafely(runCommand, "secret-tool", ["clear", ...linuxAttributes(profileId, kind)], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  };
  return {
    availability() {
      return { status: available() ? "available" : "store-unavailable" };
    },
    capturePair(profileId) {
      if (!available()) throw fixedError();
      const AMAP_KEY = promptSecret("AMAP_KEY");
      if (typeof AMAP_KEY !== "string" || !AMAP_KEY) throw fixedError();
      const AMAP_SECURITY_KEY = promptSecret("AMAP_SECURITY_KEY");
      if (typeof AMAP_SECURITY_KEY !== "string" || !AMAP_SECURITY_KEY) throw fixedError();
      try {
        runRequired(runCommand, "secret-tool", [
          "store", "--label", "Interactive Trip Planner AMap",
          ...linuxAttributes(profileId, "key"),
        ], { env, input: AMAP_KEY, stdio: ["pipe", "pipe", "pipe"] });
        runRequired(runCommand, "secret-tool", [
          "store", "--label", "Interactive Trip Planner AMap",
          ...linuxAttributes(profileId, "security-key"),
        ], { env, input: AMAP_SECURITY_KEY, stdio: ["pipe", "pipe", "pipe"] });
      } catch {
        clear(profileId, "key");
        clear(profileId, "security-key");
        throw fixedError();
      }
    },
    readPair(profileId) {
      if (!available()) throw fixedError();
      const read = (kind) => {
        const result = runSafely(runCommand, "secret-tool", ["lookup", ...linuxAttributes(profileId, kind)], {
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        return commandSucceeded(result) ? cleanNativeSecret(result.stdout) : null;
      };
      const AMAP_KEY = read("key");
      const AMAP_SECURITY_KEY = read("security-key");
      return AMAP_KEY && AMAP_SECURITY_KEY ? { AMAP_KEY, AMAP_SECURITY_KEY } : null;
    },
    deletePair(profileId) {
      clear(profileId, "key");
      clear(profileId, "security-key");
    },
  };
}

export function platformCredentialPaths({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
  pathApi = platform === "win32" ? path.win32 : path,
} = {}) {
  let configRoot;
  if (platform === "darwin") {
    configRoot = pathApi.join(homedir, "Library", "Application Support", "interactive-trip-planner");
  } else if (platform === "win32") {
    const appData = typeof env.APPDATA === "string" && env.APPDATA ? env.APPDATA : pathApi.join(homedir, "AppData", "Roaming");
    configRoot = pathApi.join(appData, "interactive-trip-planner");
  } else if (platform === "linux") {
    const xdg = typeof env.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME
      ? env.XDG_CONFIG_HOME
      : pathApi.join(homedir, ".config");
    configRoot = pathApi.join(xdg, "interactive-trip-planner");
  } else {
    throw fixedError();
  }
  return { configRoot, pointerFile: pathApi.join(configRoot, "amap-profile.json") };
}

export function createPlatformCredentialBackend({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
  pathApi,
  runCommand = defaultRunCommand,
  announcePrompt = (label) => {
    process.stderr.write(`请输入 ${label}（输入不会显示）。 Enter ${label} (input is hidden).\n`);
  },
  promptSecret = () => {
    throw fixedError();
  },
} = {}) {
  const paths = platformCredentialPaths({ platform, env, homedir, pathApi });
  if (platform === "darwin") return createMacBackend(runCommand, announcePrompt);
  if (platform === "win32") {
    return createWindowsBackend({ runCommand, promptSecret, configRoot: paths.configRoot });
  }
  if (platform === "linux") return createLinuxBackend({ runCommand, promptSecret, env });
  throw fixedError();
}
