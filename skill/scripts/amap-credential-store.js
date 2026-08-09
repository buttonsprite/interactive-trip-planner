import fs from "node:fs";
import path from "node:path";
import { randomUUID as nodeRandomUUID } from "node:crypto";

const STORE_ERROR = "AMap credential store failed.";
const POINTER_VERSION = 1;
const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimCredential(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePair(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const AMAP_KEY = trimCredential(value.AMAP_KEY);
  const AMAP_SECURITY_KEY = trimCredential(value.AMAP_SECURITY_KEY);
  return AMAP_KEY && AMAP_SECURITY_KEY ? { AMAP_KEY, AMAP_SECURITY_KEY } : null;
}

function isValidProfileId(value) {
  return typeof value === "string" && PROFILE_ID_PATTERN.test(value);
}

function safeBackendCall(callback) {
  try {
    return callback();
  } catch {
    throw new Error(STORE_ERROR);
  }
}

function ensureSafeDirectory(directory) {
  try {
    if (fs.existsSync(directory)) {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
      fs.chmodSync(directory, 0o700);
      return true;
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    return true;
  } catch {
    return false;
  }
}

function safeFileState(file) {
  try {
    if (!fs.existsSync(file)) return "missing";
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() ? "file" : "unsafe";
  } catch {
    return "unsafe";
  }
}

function readJsonFile(file) {
  const state = safeFileState(file);
  if (state === "missing") return { status: "missing", value: null };
  if (state !== "file") return { status: "corrupt", value: null };
  try {
    return { status: "ok", value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { status: "corrupt", value: null };
  }
}

function atomicWriteJson(file, value) {
  const directory = path.dirname(file);
  if (!ensureSafeDirectory(directory) || safeFileState(file) === "unsafe") {
    throw new Error(STORE_ERROR);
  }
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${nodeRandomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } catch {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The temporary file may not have been created.
    }
    throw new Error(STORE_ERROR);
  }
}

function safeUnlink(file) {
  const state = safeFileState(file);
  if (state === "missing") return;
  if (state !== "file") throw new Error(STORE_ERROR);
  try {
    fs.unlinkSync(file);
  } catch {
    throw new Error(STORE_ERROR);
  }
}

function parsePointer(pointerFile) {
  const result = readJsonFile(pointerFile);
  if (result.status !== "ok") return result;
  const value = result.value;
  if (!value || value.version !== POINTER_VERSION || !isValidProfileId(value.profileId)) {
    return { status: "corrupt", value: null };
  }
  return { status: "ok", value: { profileId: value.profileId } };
}

function readCandidateIds(ledgerFile) {
  const result = readJsonFile(ledgerFile);
  if (result.status === "missing") return [];
  if (result.status !== "ok" || !Array.isArray(result.value?.profileIds)) {
    throw new Error(STORE_ERROR);
  }
  if (!result.value.profileIds.every(isValidProfileId)) throw new Error(STORE_ERROR);
  return [...new Set(result.value.profileIds)];
}

function writeCandidateIds(ledgerFile, profileIds) {
  if (profileIds.length === 0) {
    safeUnlink(ledgerFile);
    return;
  }
  atomicWriteJson(ledgerFile, { version: POINTER_VERSION, profileIds });
}

function storeUnavailable(backend) {
  try {
    return backend.availability()?.status !== "available";
  } catch {
    return true;
  }
}

export function createAmapCredentialStore({
  backend,
  pointerFile,
  randomUUID = nodeRandomUUID,
} = {}) {
  if (!backend || typeof pointerFile !== "string" || !pointerFile) {
    throw new Error(STORE_ERROR);
  }
  const directory = path.dirname(pointerFile);
  const ledgerFile = `${pointerFile}.candidates`;

  function configDirectoryReady() {
    return ensureSafeDirectory(directory);
  }

  function publicStatus() {
    if (!configDirectoryReady()) {
      return { status: "store-corrupt", source: "none", savedProfileAvailable: false };
    }
    const pointer = parsePointer(pointerFile);
    if (pointer.status === "corrupt") {
      return { status: "store-corrupt", source: "none", savedProfileAvailable: true };
    }
    if (storeUnavailable(backend)) {
      return {
        status: "store-unavailable",
        source: "none",
        savedProfileAvailable: pointer.status === "ok",
      };
    }
    if (pointer.status === "missing") {
      return { status: "missing-credentials", source: "none", savedProfileAvailable: false };
    }
    const pair = safeBackendCall(() => normalizePair(backend.readPair(pointer.value.profileId)));
    return pair
      ? { status: "ready", source: "system-store", savedProfileAvailable: true }
      : { status: "store-corrupt", source: "none", savedProfileAvailable: true };
  }

  function readActive() {
    const status = publicStatus();
    if (status.status !== "ready") return status;
    const pointer = parsePointer(pointerFile);
    const credentials = safeBackendCall(() => normalizePair(backend.readPair(pointer.value.profileId)));
    if (!credentials) {
      return { status: "store-corrupt", source: "none", savedProfileAvailable: true };
    }
    return { ...status, credentials };
  }

  function cleanupStaleCandidates() {
    const staleIds = readCandidateIds(ledgerFile);
    const activePointer = parsePointer(pointerFile);
    if (activePointer.status === "corrupt") throw new Error(STORE_ERROR);
    for (const profileId of staleIds) {
      if (activePointer.status === "ok" && activePointer.value.profileId === profileId) continue;
      safeBackendCall(() => backend.deletePair(profileId));
    }
    writeCandidateIds(ledgerFile, []);
  }

  function beginCandidate() {
    if (!configDirectoryReady() || storeUnavailable(backend)) throw new Error(STORE_ERROR);
    cleanupStaleCandidates();
    const profileId = randomUUID();
    if (!isValidProfileId(profileId)) throw new Error(STORE_ERROR);
    writeCandidateIds(ledgerFile, [profileId]);
    try {
      safeBackendCall(() => backend.capturePair(profileId));
      const pair = safeBackendCall(() => normalizePair(backend.readPair(profileId)));
      if (!pair) throw new Error(STORE_ERROR);
      return { profileId };
    } catch {
      try {
        safeBackendCall(() => backend.deletePair(profileId));
        writeCandidateIds(ledgerFile, []);
      } catch {
        // Return the same fixed error without exposing backend diagnostics.
      }
      throw new Error(STORE_ERROR);
    }
  }

  function commitCandidate(profileId) {
    if (!isValidProfileId(profileId) || !configDirectoryReady()) throw new Error(STORE_ERROR);
    const candidates = readCandidateIds(ledgerFile);
    if (!candidates.includes(profileId)) throw new Error(STORE_ERROR);
    const pair = safeBackendCall(() => normalizePair(backend.readPair(profileId)));
    if (!pair) throw new Error(STORE_ERROR);
    const oldPointer = parsePointer(pointerFile);
    if (oldPointer.status === "corrupt") throw new Error(STORE_ERROR);
    atomicWriteJson(pointerFile, { version: POINTER_VERSION, profileId });
    writeCandidateIds(ledgerFile, candidates.filter((candidate) => candidate !== profileId));
    if (oldPointer.status === "ok" && oldPointer.value.profileId !== profileId) {
      safeBackendCall(() => backend.deletePair(oldPointer.value.profileId));
    }
  }

  function discardCandidate(profileId) {
    if (!isValidProfileId(profileId) || !configDirectoryReady()) throw new Error(STORE_ERROR);
    const candidates = readCandidateIds(ledgerFile);
    if (!candidates.includes(profileId)) throw new Error(STORE_ERROR);
    safeBackendCall(() => backend.deletePair(profileId));
    writeCandidateIds(ledgerFile, candidates.filter((candidate) => candidate !== profileId));
  }

  function removeActive() {
    if (!configDirectoryReady()) throw new Error(STORE_ERROR);
    const pointer = parsePointer(pointerFile);
    if (pointer.status === "corrupt") throw new Error(STORE_ERROR);
    if (pointer.status === "missing") return;
    safeBackendCall(() => backend.deletePair(pointer.value.profileId));
    safeUnlink(pointerFile);
  }

  return {
    status: publicStatus,
    readActive,
    beginCandidate,
    commitCandidate,
    discardCandidate,
    removeActive,
  };
}

export function resolveAmapCredentials({ env = process.env, store } = {}) {
  if (!store) throw new Error(STORE_ERROR);
  const AMAP_KEY = trimCredential(env.AMAP_KEY);
  const AMAP_SECURITY_KEY = trimCredential(env.AMAP_SECURITY_KEY);
  const savedProfileAvailable = Boolean(store.status().savedProfileAvailable);
  if (AMAP_KEY && AMAP_SECURITY_KEY) {
    return {
      status: "ready",
      source: "environment",
      credentials: { AMAP_KEY, AMAP_SECURITY_KEY },
      savedProfileAvailable,
    };
  }
  if (AMAP_KEY || AMAP_SECURITY_KEY) {
    return { status: "partial-environment-credentials", source: "none", savedProfileAvailable };
  }
  return store.readActive();
}
