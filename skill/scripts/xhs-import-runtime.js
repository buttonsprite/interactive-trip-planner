#!/usr/bin/env node

const XHS_PAGE_HOSTS = new Set([
  "xiaohongshu.com",
  "www.xiaohongshu.com",
  "m.xiaohongshu.com",
]);
const XHS_SHORT_HOSTS = new Set(["xhslink.com", "www.xhslink.com"]);
const ALL_XHS_HOSTS = new Set([...XHS_PAGE_HOSTS, ...XHS_SHORT_HOSTS]);

const errorMessages = {
  "unsupported-url": "URL must be a supported Xiaohongshu board, note, or share link.",
  "invalid-public-state": "The public page state is missing or invalid.",
  "invalid-board-state": "The public board state is missing required fields.",
  "invalid-note-state": "The public note state is missing required fields.",
  "invalid-workflow-state": "The board import state is invalid.",
};

export class XhsImportError extends Error {
  constructor(code) {
    super(errorMessages[code] || "Xiaohongshu import failed.");
    this.name = "XhsImportError";
    this.code = code;
  }
}

function parseAllowedUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(input));
  } catch {
    throw new XhsImportError("unsupported-url");
  }
  if (!/^https?:$/.test(parsed.protocol) || !ALL_XHS_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new XhsImportError("unsupported-url");
  }
  return parsed;
}

function pathParts(parsed) {
  return parsed.pathname.split("/").filter(Boolean);
}

export function classifyXhsUrl(input) {
  const parsed = parseAllowedUrl(input);
  const host = parsed.hostname.toLowerCase();
  const parts = pathParts(parsed);
  if (XHS_SHORT_HOSTS.has(host) && parts.length >= 1) {
    return { kind: "short-link", inputUrl: parsed.toString(), host };
  }
  if (XHS_PAGE_HOSTS.has(host) && parts[0] === "board" && parts[1]) {
    return { kind: "board", inputUrl: parsed.toString(), host };
  }
  if (
    XHS_PAGE_HOSTS.has(host)
    && ((parts[0] === "explore" && parts[1]) || (parts[0] === "discovery" && parts[1] === "item" && parts[2]))
  ) {
    return { kind: "note", inputUrl: parsed.toString(), host };
  }
  throw new XhsImportError("unsupported-url");
}

export function sanitizeXhsUrl(input, resolvedUrl) {
  const parsed = parseAllowedUrl(resolvedUrl || input);
  classifyXhsUrl(parsed.toString());
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

function replaceUndefinedOutsideStrings(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      index += 1;
      continue;
    }
    if (source.startsWith("undefined", index)) {
      const previous = source[index - 1] || "";
      const next = source[index + "undefined".length] || "";
      if (!/[A-Za-z0-9_$]/.test(previous) && !/[A-Za-z0-9_$]/.test(next)) {
        output += "null";
        index += "undefined".length;
        continue;
      }
    }
    output += char;
    index += 1;
  }
  return output;
}

export function extractInitialState(html) {
  if (typeof html !== "string") throw new XhsImportError("invalid-public-state");
  const marker = /window\.__INITIAL_STATE__\s*=\s*/g.exec(html);
  if (!marker) throw new XhsImportError("invalid-public-state");
  const start = marker.index + marker[0].length;
  if (html[start] !== "{") throw new XhsImportError("invalid-public-state");

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
      if (depth < 0) break;
    }
  }
  if (end < 0 || inString) throw new XhsImportError("invalid-public-state");

  try {
    const parsed = JSON.parse(replaceUndefinedOutsideStrings(html.slice(start, end)));
    if (!parsed || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new XhsImportError("invalid-public-state");
  }
}

function firstString(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === "string" && object[key].trim()) return object[key].trim();
  }
  return "";
}

function firstCount(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (Number.isInteger(value) && value >= 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function findObject(root, predicate) {
  const queue = [root];
  const seen = new Set();
  let visited = 0;
  while (queue.length && visited < 10000) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    visited += 1;
    if (!Array.isArray(value) && predicate(value)) return value;
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      if (child && typeof child === "object") queue.push(child);
    }
  }
  return null;
}

function noteId(note) {
  return firstString(note, ["noteId", "note_id", "id"]);
}

function displayAuthor(note) {
  return firstString(note?.user || note?.author || {}, ["nickname", "displayName", "name"])
    || firstString(note, ["authorDisplayName", "nickname"]);
}

function canonicalNoteUrl(id) {
  return `https://www.xiaohongshu.com/explore/${encodeURIComponent(id)}`;
}

export function normalizeBoardState(state) {
  const board = findObject(state, (candidate) => {
    const notes = candidate.notes || candidate.noteList || candidate.items;
    return Array.isArray(notes) && (
      firstCount(candidate, ["noteCount", "totalCount", "total", "count"]) !== null
      || firstString(candidate, ["boardId", "board_id", "id"])
    );
  });
  if (!board) throw new XhsImportError("invalid-board-state");
  const rawNotes = board.notes || board.noteList || board.items;
  const normalized = [];
  const seen = new Set();
  for (const candidate of rawNotes) {
    const id = noteId(candidate);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      title: firstString(candidate, ["displayTitle", "title", "name"]),
      authorDisplayName: displayAuthor(candidate),
      canonicalUrl: canonicalNoteUrl(id),
    });
  }
  const totalCount = firstCount(board, ["noteCount", "totalCount", "total", "count"]);
  return {
    boardId: firstString(board, ["boardId", "board_id", "id"]),
    title: firstString(board, ["name", "title", "boardName"]),
    totalCount: totalCount ?? normalized.length,
    notes: normalized,
  };
}

function normalizeTags(note) {
  const raw = note.tagList || note.tags || [];
  if (!Array.isArray(raw)) return [];
  const values = raw.map((tag) => (
    typeof tag === "string" ? tag.trim() : firstString(tag, ["name", "title", "tagName"])
  )).filter(Boolean);
  return [...new Set(values)];
}

function normalizePublishedAt(note) {
  const raw = note.time ?? note.publishTime ?? note.publishedAt;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return normalizePublishedAt({ time: Number(raw) });
  if (typeof raw === "string") {
    const timestamp = Date.parse(raw);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  const milliseconds = raw < 100000000000 ? raw * 1000 : raw;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeMedia(note) {
  const imageList = Array.isArray(note.imageList) ? note.imageList : [];
  const video = note.video || note.videoInfo || (note.type === "video" ? {} : null);
  const types = [];
  if (imageList.length) types.push("image");
  if (video) types.push("video");
  return { types, count: imageList.length + (video ? 1 : 0) };
}

export function normalizeNoteState(state) {
  const note = findObject(state, (candidate) => (
    Boolean(noteId(candidate))
    && Boolean(firstString(candidate, ["desc", "body", "content", "title", "displayTitle"]))
  ));
  if (!note) throw new XhsImportError("invalid-note-state");
  const id = noteId(note);
  return {
    id,
    canonicalUrl: canonicalNoteUrl(id),
    title: firstString(note, ["title", "displayTitle", "name"]),
    authorDisplayName: displayAuthor(note),
    body: firstString(note, ["desc", "body", "content"]),
    tags: normalizeTags(note),
    publishedAt: normalizePublishedAt(note),
    media: normalizeMedia(note),
  };
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0;
}

export function decideBoardImport({
  totalCount,
  anonymousCount,
  consent = "not-confirmed",
  loginAvailable = false,
  stopReason,
} = {}) {
  if (!validCount(totalCount) || !validCount(anonymousCount) || anonymousCount > totalCount) {
    throw new XhsImportError("invalid-workflow-state");
  }
  if (["captcha", "risk-warning", "rate-limited", "account-security"].includes(stopReason)) {
    return {
      status: "stopped-risk",
      requiresRiskConfirmation: false,
      allowedActions: ["keep-collected-links", "provide-single-note-links"],
    };
  }
  if (anonymousCount === totalCount) {
    return {
      status: "ready-anonymous",
      requiresRiskConfirmation: false,
      allowedActions: ["import-anonymous-complete"],
    };
  }
  if (consent === "declined") {
    return {
      status: "anonymous-only",
      requiresRiskConfirmation: false,
      allowedActions: ["import-anonymous-partial", "provide-single-note-links"],
    };
  }
  if (consent === "confirmed") {
    return loginAvailable
      ? {
          status: "authenticated-link-enumeration-approved",
          requiresRiskConfirmation: false,
          allowedActions: ["enumerate-rendered-links"],
        }
      : {
          status: "login-unavailable",
          requiresRiskConfirmation: false,
          allowedActions: ["import-anonymous-partial", "provide-single-note-links"],
        };
  }
  if (consent !== "not-confirmed") throw new XhsImportError("invalid-workflow-state");
  return {
    status: "needs-user-choice",
    requiresRiskConfirmation: true,
    allowedActions: [
      "authenticated-link-enumeration",
      "import-anonymous-partial",
      "provide-single-note-links",
    ],
  };
}

