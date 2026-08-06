#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeXhsUrl } from "./xhs-import-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(skillRoot, "..");
const templateRoot = path.join(skillRoot, "assets", "xiaohongshu-library-template");
const MAX_MATERIAL_BYTES = 15 * 1024 * 1024;
const MAX_IMPORT_MATERIAL_BYTES = 200 * 1024 * 1024;
const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const messages = {
  "invalid-library-context": "Library context is invalid.",
  "forbidden-library-root": "The library cannot be created inside the Skill or a release directory.",
  "unsafe-path": "A library or material path is unsafe.",
  "unsafe-id": "Library IDs must use only stable letters, numbers, dots, underscores, or hyphens.",
  "invalid-import": "Import payload is invalid.",
  "invalid-material": "A staged material has an unsupported type or invalid file signature.",
  "material-too-large": "A staged material exceeds the configured size boundary.",
  "import-materials-too-large": "The import exceeds the configured total material size boundary.",
  "import-exists": "The import ID already exists in this library.",
};

export class XhsLibraryError extends Error {
  constructor(code) {
    super(messages[code] || "Xiaohongshu library operation failed.");
    this.name = "XhsLibraryError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isInside(target, boundary) {
  const relative = path.relative(path.resolve(boundary), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function safeId(value) {
  if (typeof value !== "string" || !safeIdPattern.test(value) || value === "." || value === "..") {
    throw new XhsLibraryError("unsafe-id");
  }
  return value;
}

function assertNoSymlinkFrom(boundary, target) {
  const resolvedBoundary = path.resolve(boundary);
  const resolvedTarget = path.resolve(target);
  if (!isInside(resolvedTarget, resolvedBoundary)) throw new XhsLibraryError("unsafe-path");
  const relative = path.relative(resolvedBoundary, resolvedTarget);
  let current = resolvedBoundary;
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new XhsLibraryError("unsafe-path");
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new XhsLibraryError("unsafe-path");
    }
  }
}

function ensureDirectory(target, boundary) {
  assertNoSymlinkFrom(boundary, target);
  fs.mkdirSync(target, { recursive: true });
  assertNoSymlinkFrom(boundary, target);
}

function atomicWriteBuffer(file, content, boundary) {
  const directory = path.dirname(file);
  ensureDirectory(directory, boundary);
  assertNoSymlinkFrom(boundary, file);
  const temp = path.join(directory, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, file);
}

function atomicWriteText(file, content, boundary) {
  atomicWriteBuffer(file, Buffer.from(content, "utf8"), boundary);
}

function writeJson(file, value, boundary) {
  atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`, boundary);
}

function readJson(file, code = "invalid-library-context") {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!isPlainObject(parsed)) throw new Error("not object");
    return parsed;
  } catch {
    throw new XhsLibraryError(code);
  }
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
}

function escapeInline(value) {
  return normalizedText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\[\]()])/g, "\\$1")
    .replace(/\n+/g, " ");
}

function quoteBody(value) {
  const text = normalizedText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return text ? text.split("\n").map((line) => `> ${line}`).join("\n") : "> （未读取到公开正文）";
}

function listItems(values, empty = "- 无") {
  if (!Array.isArray(values) || values.length === 0) return empty;
  return values.map((value) => `- ${escapeInline(typeof value === "string" ? value : JSON.stringify(value))}`).join("\n");
}

export function resolveLibraryRoot({ workspaceRoot, libraryRoot } = {}) {
  if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) {
    throw new XhsLibraryError("invalid-library-context");
  }
  const workspace = path.resolve(workspaceRoot);
  const resolved = path.resolve(libraryRoot || path.join(workspace, "travel-library", "xiaohongshu"));
  if (isInside(resolved, skillRoot) || isInside(resolved, path.join(repositoryRoot, "releases"))) {
    throw new XhsLibraryError("forbidden-library-root");
  }
  return resolved;
}

function ensureGitBoundary(workspaceRoot, libraryRoot) {
  const gitMarker = path.join(workspaceRoot, ".git");
  if (!fs.existsSync(gitMarker) || !isInside(libraryRoot, workspaceRoot)) return;
  const relative = path.relative(workspaceRoot, libraryRoot).split(path.sep);
  if (relative[0] !== "travel-library") return;
  const ignorePath = path.join(workspaceRoot, ".gitignore");
  const current = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, "utf8") : "";
  const lines = current.split(/\r?\n/).filter(Boolean);
  if (!lines.includes("travel-library/")) lines.push("travel-library/");
  atomicWriteText(ignorePath, `${lines.join("\n")}\n`, workspaceRoot);
}

function baseIndex() {
  return {
    schemaVersion: 1,
    updatedAt: null,
    notes: [],
    collections: [],
    imports: [],
    trips: [],
  };
}

function renderIndex(library) {
  const sections = ["# 小红书旅行资料索引", "", "从这里查看最近导入、收藏夹、目的地线索和旅行选集。", ""];
  sections.push("## 最近导入", "");
  sections.push(library.imports.length
    ? library.imports.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((entry) => (
        `- [${escapeInline(entry.startedAt.slice(0, 10))} · ${escapeInline(entry.title || entry.id)}](${entry.path.replace(/manifest\.json$/, "summary.md")})`
      )).join("\n")
    : "- 暂无导入", "");
  sections.push("## 收藏夹", "");
  sections.push(library.collections.length
    ? library.collections.map((entry) => `- [${escapeInline(entry.title || entry.id)}](${entry.path.replace(/collection\.json$/, "collection.md")})`).join("\n")
    : "- 暂无收藏夹", "");
  sections.push("## 笔记", "");
  sections.push(library.notes.length
    ? library.notes.slice().sort((a, b) => a.title.localeCompare(b.title, "zh-CN")).map((entry) => (
        `- [${escapeInline(entry.title || entry.id)}](${entry.path.replace(/record\.json$/, "note.md")})`
      )).join("\n")
    : "- 暂无笔记", "");

  const destinations = new Map();
  const themes = new Map();
  for (const entry of library.notes) {
    for (const destination of entry.destinations || []) {
      if (!destinations.has(destination)) destinations.set(destination, []);
      destinations.get(destination).push(entry);
    }
    for (const theme of entry.themes || []) {
      if (!themes.has(theme)) themes.set(theme, []);
      themes.get(theme).push(entry);
    }
  }
  sections.push("## 按目的地", "");
  sections.push(destinations.size
    ? [...destinations.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([name, entries]) => (
        `- **${escapeInline(name)}**：${entries.map((entry) => `[${escapeInline(entry.title)}](${entry.path.replace(/record\.json$/, "note.md")})`).join("、")}`
      )).join("\n")
    : "- 暂无目的地线索", "");
  sections.push("## 按主题", "");
  sections.push(themes.size
    ? [...themes.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([name, entries]) => (
        `- **${escapeInline(name)}**：${entries.map((entry) => `[${escapeInline(entry.title)}](${entry.path.replace(/record\.json$/, "note.md")})`).join("、")}`
      )).join("\n")
    : "- 暂无主题", "");
  sections.push("## 旅行选集", "");
  sections.push(library.trips.length
    ? library.trips.map((entry) => `- [${escapeInline(entry.id)}](${entry.path.replace(/selection\.json$/, "selection.md")})`).join("\n")
    : "- 暂无旅行选集", "");
  return `${sections.join("\n")}\n`;
}

export function initializeLibrary({ workspaceRoot, libraryRoot } = {}) {
  const workspace = path.resolve(workspaceRoot || "");
  const root = resolveLibraryRoot({ workspaceRoot, libraryRoot });
  ensureDirectory(root, path.dirname(root));
  for (const directory of ["collections", "notes", "imports", "trips"]) {
    ensureDirectory(path.join(root, directory), root);
  }
  const readmePath = path.join(root, "README.md");
  if (!fs.existsSync(readmePath)) {
    atomicWriteText(readmePath, fs.readFileSync(path.join(templateRoot, "README.md"), "utf8"), root);
  }
  const libraryPath = path.join(root, "library.json");
  if (!fs.existsSync(libraryPath)) {
    const initial = fs.existsSync(path.join(templateRoot, "library.json"))
      ? readJson(path.join(templateRoot, "library.json"))
      : baseIndex();
    writeJson(libraryPath, initial, root);
  }
  const library = readJson(libraryPath);
  if (library.schemaVersion !== 1) throw new XhsLibraryError("invalid-library-context");
  atomicWriteText(path.join(root, "INDEX.md"), renderIndex(library), root);
  ensureGitBoundary(workspace, root);
  return library;
}

function normalizeArray(value, mapper = normalizedText) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(mapper).filter(Boolean))];
}

function normalizeSignals(signals) {
  const value = isPlainObject(signals) ? signals : {};
  const places = Array.isArray(value.places) ? value.places.map((place) => ({
    name: normalizedText(place?.name),
    city: normalizedText(place?.city),
    area: normalizedText(place?.area),
  })).filter((place) => place.name || place.city || place.area) : [];
  return {
    places,
    categories: normalizeArray(value.categories),
    experienceReasons: normalizeArray(value.experienceReasons),
    negativeSignals: normalizeArray(value.negativeSignals),
    timeHints: normalizeArray(value.timeHints),
    factsToVerify: normalizeArray(value.factsToVerify),
  };
}

function normalizeNote(note, startedAt, importId) {
  if (!isPlainObject(note)) throw new XhsLibraryError("invalid-import");
  const id = safeId(note.id);
  let canonicalUrl;
  try {
    canonicalUrl = sanitizeXhsUrl(note.canonicalUrl);
  } catch {
    throw new XhsLibraryError("invalid-import");
  }
  const title = normalizedText(note.title);
  if (!title) throw new XhsLibraryError("invalid-import");
  const access = ["anonymous-public", "authenticated-board-link-only"].includes(note.access)
    ? note.access
    : "anonymous-public";
  return {
    schemaVersion: 1,
    id,
    canonicalUrl,
    title,
    authorDisplayName: normalizedText(note.authorDisplayName),
    body: normalizedText(note.body),
    tags: normalizeArray(note.tags),
    publishedAt: note.publishedAt ? new Date(note.publishedAt).toISOString() : null,
    media: {
      types: normalizeArray(note.media?.types),
      count: Number.isInteger(note.media?.count) && note.media.count >= 0 ? note.media.count : 0,
    },
    access,
    signals: normalizeSignals(note.signals),
    userState: normalizedText(note.userState),
    userNotes: normalizedText(note.userNotes),
    firstImportedAt: startedAt,
    lastImportedAt: startedAt,
    importIds: [importId],
    materials: Array.isArray(note.materials) ? note.materials : [],
  };
}

function materialSignature(buffer, extension) {
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      ? { extension: ".jpg", mimeType: "image/jpeg" }
      : null;
  }
  if (extension === ".png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => buffer[index] === byte)
      ? { extension: ".png", mimeType: "image/png" }
      : null;
  }
  if (extension === ".webp") {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP"
      ? { extension: ".webp", mimeType: "image/webp" }
      : null;
  }
  if (extension === ".txt") {
    if (buffer.includes(0)) return null;
    return { extension: ".txt", mimeType: "text/plain; charset=utf-8" };
  }
  return null;
}

function prepareMaterial(material, assetStagingRoot) {
  if (!isPlainObject(material) || typeof assetStagingRoot !== "string" || !assetStagingRoot) {
    throw new XhsLibraryError("invalid-material");
  }
  const stagedFilename = material.stagedFilename;
  if (typeof stagedFilename !== "string" || path.basename(stagedFilename) !== stagedFilename || !stagedFilename) {
    throw new XhsLibraryError("unsafe-path");
  }
  const staging = path.resolve(assetStagingRoot);
  const source = path.resolve(staging, stagedFilename);
  assertNoSymlinkFrom(staging, source);
  let stat;
  try {
    stat = fs.lstatSync(source);
  } catch {
    throw new XhsLibraryError("invalid-material");
  }
  if (!stat.isFile()) throw new XhsLibraryError("invalid-material");
  if (stat.size > MAX_MATERIAL_BYTES) throw new XhsLibraryError("material-too-large");
  const buffer = fs.readFileSync(source);
  const signature = materialSignature(buffer, path.extname(stagedFilename).toLowerCase());
  if (!signature) throw new XhsLibraryError("invalid-material");
  if (!Number.isInteger(material.position) || material.position < 1 || material.position > 99) {
    throw new XhsLibraryError("invalid-material");
  }
  const kind = material.kind === "derived" ? "derived" : material.kind === "original" ? "original" : null;
  if (!kind || (kind === "original" && signature.mimeType.startsWith("text/"))) {
    throw new XhsLibraryError("invalid-material");
  }
  const role = normalizedText(material.role).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!role) throw new XhsLibraryError("invalid-material");
  const filename = `${String(material.position).padStart(2, "0")}-${role}${signature.extension}`;
  return {
    kind,
    filename,
    buffer,
    manifest: {
      path: `${kind}/${filename}`,
      kind,
      role,
      position: material.position,
      mimeType: signature.mimeType,
      bytes: buffer.length,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    },
  };
}

function preparePayload(payload, assetStagingRoot) {
  if (!isPlainObject(payload) || !Array.isArray(payload.notes) || !Array.isArray(payload.failures)) {
    throw new XhsLibraryError("invalid-import");
  }
  const importId = safeId(payload.importId);
  const startedAt = normalizedText(payload.startedAt);
  const startedDate = new Date(startedAt);
  if (!startedAt || Number.isNaN(startedDate.getTime())) throw new XhsLibraryError("invalid-import");
  const isoStartedAt = startedDate.toISOString();
  const notes = [];
  const seen = new Set();
  let duplicates = 0;
  let materialBytes = 0;
  for (const rawNote of payload.notes) {
    const normalized = normalizeNote(rawNote, isoStartedAt, importId);
    if (seen.has(normalized.id)) {
      duplicates += 1;
      continue;
    }
    seen.add(normalized.id);
    const preparedMaterials = normalized.materials.map((material) => prepareMaterial(material, assetStagingRoot));
    materialBytes += preparedMaterials.reduce((sum, item) => sum + item.buffer.length, 0);
    if (materialBytes > MAX_IMPORT_MATERIAL_BYTES) throw new XhsLibraryError("import-materials-too-large");
    delete normalized.materials;
    notes.push({ record: normalized, materials: preparedMaterials });
  }
  const source = isPlainObject(payload.source) ? {
    kind: normalizedText(payload.source.kind),
    id: payload.source.id ? safeId(payload.source.id) : importId,
    title: normalizedText(payload.source.title) || importId,
    canonicalUrl: payload.source.canonicalUrl ? sanitizeXhsUrl(payload.source.canonicalUrl) : null,
    totalCount: Number.isInteger(payload.source.totalCount) ? payload.source.totalCount : null,
    anonymousCount: Number.isInteger(payload.source.anonymousCount) ? payload.source.anonymousCount : 0,
    authenticatedLinkCount: Number.isInteger(payload.source.authenticatedLinkCount)
      ? payload.source.authenticatedLinkCount
      : 0,
  } : { kind: "single-links", id: importId, title: importId, canonicalUrl: null };
  const risk = isPlainObject(payload.risk) ? {
    shown: payload.risk.shown === true,
    confirmed: payload.risk.confirmed === true,
    authenticatedLinkCount: Number.isInteger(payload.risk.authenticatedLinkCount)
      ? payload.risk.authenticatedLinkCount
      : 0,
  } : { shown: false, confirmed: false, authenticatedLinkCount: 0 };
  const tripSelection = payload.tripSelection && isPlainObject(payload.tripSelection)
    ? {
        tripSlug: safeId(payload.tripSelection.tripSlug),
        entries: Array.isArray(payload.tripSelection.entries) ? payload.tripSelection.entries.map((entry) => ({
          noteId: safeId(entry.noteId),
          status: normalizedText(entry.status),
          roles: normalizeArray(entry.roles),
          placeIds: normalizeArray(entry.placeIds, safeId),
        })) : [],
      }
    : null;
  return {
    importId,
    startedAt: isoStartedAt,
    date: isoStartedAt.slice(0, 10),
    source,
    risk,
    notes,
    duplicates,
    failures: payload.failures.map((failure) => ({
      id: failure?.id ? safeId(failure.id) : null,
      code: normalizedText(failure?.code) || "unknown",
    })),
    tripSelection,
  };
}

function renderNote(record) {
  const places = record.signals.places.map((place) => (
    [place.name, place.area, place.city].filter(Boolean).join(" · ")
  ));
  return `# ${escapeInline(record.title)}

[返回资料索引](../../INDEX.md)

- 作者：${escapeInline(record.authorDisplayName || "未读取")}
- 来源：[打开规范化笔记页](${record.canonicalUrl})
- 发布时间：${escapeInline(record.publishedAt || "未读取")}
- 访问方式：${escapeInline(record.access)}
- 标签：${record.tags.length ? record.tags.map(escapeInline).join("、") : "无"}

## 正文

${quoteBody(record.body)}

## 识别出的地点

${listItems(places)}

## 推荐品类

${listItems(record.signals.categories)}

## 为什么可能适合这趟旅行

${listItems(record.signals.experienceReasons)}

## 负面与避坑信号

${listItems(record.signals.negativeSignals)}

## 时间线索

${listItems(record.signals.timeHints)}

## 需要官方复核

${listItems(record.signals.factsToVerify)}

## 我的判断

- 状态：${escapeInline(record.userState || "未标记")}
- 备注：${escapeInline(record.userNotes || "无")}
`;
}

function noteIndexEntry(record) {
  const destinations = [...new Set(record.signals.places.flatMap((place) => [place.city, place.area]).filter(Boolean))];
  const themes = [...new Set([...record.tags, ...record.signals.categories])];
  return {
    id: record.id,
    title: record.title,
    path: `notes/${record.id}/record.json`,
    firstImportedAt: record.firstImportedAt,
    lastImportedAt: record.lastImportedAt,
    destinations,
    themes,
  };
}

function writeMaterials(root, noteId, prepared, startedAt) {
  const mediaRoot = path.join(root, "notes", noteId, "media");
  ensureDirectory(path.join(mediaRoot, "original"), root);
  ensureDirectory(path.join(mediaRoot, "derived"), root);
  const manifestPath = path.join(mediaRoot, "manifest.json");
  const existing = fs.existsSync(manifestPath) ? readJson(manifestPath) : { schemaVersion: 1, files: [] };
  const byPath = new Map((existing.files || []).map((entry) => [entry.path, entry]));
  for (const item of prepared) {
    atomicWriteBuffer(path.join(mediaRoot, item.kind, item.filename), item.buffer, root);
    byPath.set(item.manifest.path, { ...item.manifest, savedAt: startedAt });
  }
  writeJson(manifestPath, { schemaVersion: 1, files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)) }, root);
}

function writeNote(root, preparedNote, library, importId, startedAt) {
  const noteRoot = path.join(root, "notes", preparedNote.record.id);
  assertNoSymlinkFrom(root, noteRoot);
  const recordPath = path.join(noteRoot, "record.json");
  const existing = fs.existsSync(recordPath) ? readJson(recordPath) : null;
  const record = {
    ...preparedNote.record,
    firstImportedAt: existing?.firstImportedAt || startedAt,
    lastImportedAt: startedAt,
    importIds: [...new Set([...(existing?.importIds || []), importId])],
  };
  writeJson(recordPath, record, root);
  atomicWriteText(path.join(noteRoot, "note.md"), renderNote(record), root);
  writeMaterials(root, record.id, preparedNote.materials, startedAt);
  const entry = noteIndexEntry(record);
  const existingIndex = library.notes.findIndex((item) => item.id === record.id);
  if (existingIndex >= 0) library.notes[existingIndex] = entry;
  else library.notes.push(entry);
  return { record, existed: Boolean(existing) };
}

function renderCollection(collection) {
  const notes = collection.notes.map((note) => (
    `- [${escapeInline(note.title || note.id)}](../../notes/${note.id}/note.md) · ${escapeInline(note.status)}`
  )).join("\n") || "- 暂无笔记";
  return `# ${escapeInline(collection.title)}

[返回资料索引](../../INDEX.md)

- 收藏夹 ID：${escapeInline(collection.id)}
- 声明总数：${collection.totalCount ?? "未知"}
- 当前已关联：${collection.notes.length}
- 最近导入：${escapeInline(collection.lastImportedAt)}

## 笔记

${notes}
`;
}

function updateCollection(root, library, prepared, importedRecords) {
  if (prepared.source.kind !== "board") return;
  const id = safeId(prepared.source.id);
  const collectionRoot = path.join(root, "collections", id);
  const dataPath = path.join(collectionRoot, "collection.json");
  const existing = fs.existsSync(dataPath) ? readJson(dataPath) : { schemaVersion: 1, id, notes: [], importIds: [] };
  const byId = new Map((existing.notes || []).map((entry) => [entry.id, entry]));
  for (const record of importedRecords) {
    byId.set(record.id, { id: record.id, title: record.title, status: "imported" });
  }
  for (const failure of prepared.failures) {
    if (failure.id && !byId.has(failure.id)) byId.set(failure.id, { id: failure.id, title: failure.id, status: failure.code });
  }
  const collection = {
    schemaVersion: 1,
    id,
    title: prepared.source.title,
    canonicalUrl: prepared.source.canonicalUrl,
    totalCount: prepared.source.totalCount,
    anonymousCount: prepared.source.anonymousCount,
    authenticatedLinkCount: prepared.source.authenticatedLinkCount,
    lastImportedAt: prepared.startedAt,
    importIds: [...new Set([...(existing.importIds || []), prepared.importId])],
    notes: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  writeJson(dataPath, collection, root);
  atomicWriteText(path.join(collectionRoot, "collection.md"), renderCollection(collection), root);
  const entry = { id, title: collection.title, path: `collections/${id}/collection.json`, lastImportedAt: prepared.startedAt };
  const index = library.collections.findIndex((item) => item.id === id);
  if (index >= 0) library.collections[index] = entry;
  else library.collections.push(entry);
}

function renderImportSummary(manifest) {
  const noteLines = manifest.notes.map((note) => `- [${escapeInline(note.title)}](../../notes/${note.id}/note.md)`).join("\n") || "- 无";
  const failureLines = manifest.failures.map((failure) => `- ${escapeInline(failure.id || "未知笔记")}：${escapeInline(failure.code)}`).join("\n") || "- 无";
  return `# 导入摘要：${escapeInline(manifest.title)}

[返回资料索引](../../INDEX.md)

- 时间：${escapeInline(manifest.startedAt)}
- 收到：${manifest.counts.received}
- 新增：${manifest.counts.imported}
- 更新：${manifest.counts.updated}
- 同批重复：${manifest.counts.duplicates}
- 失败：${manifest.counts.failed}
- 登录风险提示：${manifest.risk.shown ? "已展示" : "未触发"}
- 本次登录态读取确认：${manifest.risk.confirmed ? "已确认" : "未确认"}
- 登录态仅补齐链接数：${manifest.risk.authenticatedLinkCount}

## 已整理笔记

${noteLines}

## 失败项

${failureLines}
`;
}

function writeImport(root, library, prepared, importedRecords, counts) {
  const directoryName = `${prepared.date}-${prepared.importId}`;
  const importRoot = path.join(root, "imports", directoryName);
  if (fs.existsSync(path.join(importRoot, "manifest.json"))) throw new XhsLibraryError("import-exists");
  const manifest = {
    schemaVersion: 1,
    id: prepared.importId,
    title: prepared.source.title,
    startedAt: prepared.startedAt,
    source: prepared.source,
    risk: prepared.risk,
    counts,
    notes: importedRecords.map((record) => ({ id: record.id, title: record.title })),
    failures: prepared.failures,
    stopReason: prepared.failures.find((failure) => ["captcha", "risk-control", "rate-limited"].includes(failure.code))?.code || null,
  };
  writeJson(path.join(importRoot, "manifest.json"), manifest, root);
  atomicWriteText(path.join(importRoot, "summary.md"), renderImportSummary(manifest), root);
  library.imports.push({
    id: prepared.importId,
    title: prepared.source.title,
    startedAt: prepared.startedAt,
    path: `imports/${directoryName}/manifest.json`,
  });
  return { manifest, directoryName };
}

function renderTripSelection(selection, noteLookup) {
  const lines = selection.entries.map((entry) => {
    const note = noteLookup.get(entry.noteId);
    const title = note?.title || entry.noteId;
    return `- [${escapeInline(title)}](../../notes/${entry.noteId}/note.md) · ${escapeInline(entry.status || "candidate")} · ${entry.roles.map(escapeInline).join("、") || "未分类"}`;
  }).join("\n") || "- 暂无关联笔记";
  return `# 旅行选集：${escapeInline(selection.tripSlug)}

[返回资料索引](../../INDEX.md)

本页只保存旅行与笔记的关联，不复制笔记正文。

${lines}
`;
}

function writeTripSelection(root, library, selection, noteLookup, startedAt) {
  if (!selection) return;
  const deduped = new Map();
  for (const entry of selection.entries) deduped.set(entry.noteId, entry);
  const value = { schemaVersion: 1, tripSlug: selection.tripSlug, updatedAt: startedAt, entries: [...deduped.values()] };
  const tripRoot = path.join(root, "trips", selection.tripSlug);
  writeJson(path.join(tripRoot, "selection.json"), value, root);
  atomicWriteText(path.join(tripRoot, "selection.md"), renderTripSelection(value, noteLookup), root);
  const index = library.trips.findIndex((entry) => entry.id === selection.tripSlug);
  const libraryEntry = { id: selection.tripSlug, path: `trips/${selection.tripSlug}/selection.json`, updatedAt: startedAt };
  if (index >= 0) library.trips[index] = libraryEntry;
  else library.trips.push(libraryEntry);
}

export function importIntoLibrary({ workspaceRoot, libraryRoot, assetStagingRoot, payload } = {}) {
  const root = resolveLibraryRoot({ workspaceRoot, libraryRoot });
  const prepared = preparePayload(payload, assetStagingRoot);
  initializeLibrary({ workspaceRoot, libraryRoot: root });
  const libraryPath = path.join(root, "library.json");
  const library = readJson(libraryPath);
  if (library.imports.some((entry) => entry.id === prepared.importId)) throw new XhsLibraryError("import-exists");

  let imported = 0;
  let updated = 0;
  const importedRecords = [];
  for (const note of prepared.notes) {
    const result = writeNote(root, note, library, prepared.importId, prepared.startedAt);
    importedRecords.push(result.record);
    if (result.existed) updated += 1;
    else imported += 1;
  }
  const counts = {
    received: payload.notes.length,
    imported,
    updated,
    duplicates: prepared.duplicates,
    failed: prepared.failures.length,
  };
  updateCollection(root, library, prepared, importedRecords);
  const importResult = writeImport(root, library, prepared, importedRecords, counts);
  const noteLookup = new Map(library.notes.map((entry) => [entry.id, entry]));
  writeTripSelection(root, library, prepared.tripSelection, noteLookup, prepared.startedAt);
  library.updatedAt = prepared.startedAt;
  library.notes.sort((a, b) => a.id.localeCompare(b.id));
  library.collections.sort((a, b) => a.id.localeCompare(b.id));
  library.imports.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  library.trips.sort((a, b) => a.id.localeCompare(b.id));
  writeJson(libraryPath, library, root);
  atomicWriteText(path.join(root, "INDEX.md"), renderIndex(library), root);
  return {
    status: "imported",
    libraryRoot: root,
    importId: prepared.importId,
    counts,
    paths: {
      index: "INDEX.md",
      summary: `imports/${importResult.directoryName}/summary.md`,
    },
  };
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new XhsLibraryError("unsafe-path");
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isPlainObject(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:cookie|authorization|xsec_token|share_id|appuid|headers?)$/i.test(key)) return true;
    if (hasForbiddenKey(child)) return true;
  }
  return false;
}

export function validateLibrary({ libraryRoot } = {}) {
  const root = path.resolve(libraryRoot || "");
  const errors = [];
  const counts = { notes: 0, collections: 0, imports: 0, trips: 0, materials: 0 };
  try {
    if (!libraryRoot || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new XhsLibraryError("invalid-library-context");
    }
    walkFiles(root);
    const library = readJson(path.join(root, "library.json"));
    if (library.schemaVersion !== 1) errors.push("library schemaVersion must be 1");
    for (const key of ["notes", "collections", "imports", "trips"]) {
      if (!Array.isArray(library[key])) errors.push(`library ${key} must be an array`);
    }
    for (const entry of library.notes || []) {
      counts.notes += 1;
      try {
        safeId(entry.id);
        const recordPath = path.resolve(root, entry.path);
        if (!isInside(recordPath, root) || !fs.existsSync(recordPath)) throw new Error("missing record");
        const record = readJson(recordPath);
        if (record.id !== entry.id || hasForbiddenKey(record)) throw new Error("invalid record");
        if (sanitizeXhsUrl(record.canonicalUrl) !== record.canonicalUrl) throw new Error("unsafe canonical URL");
        const noteRoot = path.dirname(recordPath);
        if (!fs.existsSync(path.join(noteRoot, "note.md"))) throw new Error("missing note view");
        const media = readJson(path.join(noteRoot, "media", "manifest.json"));
        counts.materials += Array.isArray(media.files) ? media.files.length : 0;
        if (hasForbiddenKey(media)) throw new Error("unsafe media manifest");
      } catch {
        errors.push(`invalid note entry: ${entry.id}`);
      }
    }
    for (const [key, counter] of [["collections", "collections"], ["imports", "imports"], ["trips", "trips"]]) {
      for (const entry of library[key] || []) {
        counts[counter] += 1;
        const file = path.resolve(root, entry.path);
        if (!isInside(file, root) || !fs.existsSync(file)) errors.push(`missing ${key} entry: ${entry.id}`);
      }
    }
    if (!fs.existsSync(path.join(root, "README.md"))) errors.push("missing README.md");
    if (!fs.existsSync(path.join(root, "INDEX.md"))) errors.push("missing INDEX.md");
  } catch (error) {
    if (error instanceof XhsLibraryError && error.code === "unsafe-path") errors.push("library contains a symlink");
    else errors.push("library root or index is invalid");
  }
  return { status: errors.length ? "invalid" : "valid", errors, counts };
}

