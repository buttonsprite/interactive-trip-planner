#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonInputUsage, parseJsonInputArgs, readJsonContext } from "./cli-json-input.js";
import {
  XhsImportError,
  classifyXhsUrl,
  extractInitialState,
  normalizeBoardState,
  normalizeNoteState,
  sanitizeXhsUrl,
} from "./xhs-import-runtime.js";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 30000;

const publicFetchMessages = {
  "embedded-credentials": "Public fetch URLs must not contain embedded credentials.",
  "invalid-fetch-context": "Public fetch context must include a supported URL and valid timeout.",
};

export class XhsPublicFetchError extends Error {
  constructor(code) {
    super(publicFetchMessages[code] || "Xiaohongshu public fetch failed.");
    this.name = "XhsPublicFetchError";
    this.code = code;
  }
}

function normalizeContext(context) {
  if (!context || Array.isArray(context) || Object.getPrototypeOf(context) !== Object.prototype) {
    throw new XhsPublicFetchError("invalid-fetch-context");
  }
  let parsed;
  try {
    parsed = new URL(context.url);
  } catch {
    throw new XhsImportError("unsupported-url");
  }
  if (parsed.username || parsed.password) throw new XhsPublicFetchError("embedded-credentials");
  const classified = classifyXhsUrl(parsed.toString());
  const timeoutMs = context.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : context.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new XhsPublicFetchError("invalid-fetch-context");
  }
  return { url: parsed.toString(), timeoutMs, classified };
}

function failed(code, kind, canonicalUrl) {
  return { status: "failed", code, kind, canonicalUrl };
}

async function readBoundedHtml(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!/^text\/html(?:;|$)/i.test(contentType.trim())) return { code: "unexpected-content-type" };
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return { code: "response-too-large" };
  if (!response.body) return { html: "" };

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let size = 0;
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return { code: "response-too-large" };
    }
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
  return { html };
}

function detectBlockedPage(html) {
  if (/验证码|安全验证|访问频繁|行为异常|限制访问|captcha/i.test(html)) return "risk-control";
  if (/登录后查看|请先登录|扫码登录|登录以继续/i.test(html)) return "login-required";
  return null;
}

function redirectLocation(response, currentUrl) {
  const location = response.headers.get("location");
  if (!location) return null;
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchPublicXhs(context, { transport = globalThis.fetch } = {}) {
  const normalized = normalizeContext(context);
  let currentUrl = normalized.url;
  let kind = normalized.classified.kind;
  let canonicalUrl = sanitizeXhsUrl(currentUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), normalized.timeoutMs);
    let response;
    try {
      response = await transport(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
          "user-agent": "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      return failed(error?.name === "AbortError" ? "timeout" : "network-error", kind, canonicalUrl);
    }

    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timeout);
      if (redirects === MAX_REDIRECTS) return failed("too-many-redirects", kind, canonicalUrl);
      const nextUrl = redirectLocation(response, currentUrl);
      if (!nextUrl) return failed("invalid-redirect", kind, canonicalUrl);
      let nextClassification;
      try {
        const parsedNext = new URL(nextUrl);
        if (parsedNext.username || parsedNext.password) return failed("unsafe-redirect", kind, canonicalUrl);
        nextClassification = classifyXhsUrl(nextUrl);
      } catch {
        return failed("unsafe-redirect", kind, canonicalUrl);
      }
      currentUrl = nextUrl;
      kind = nextClassification.kind;
      canonicalUrl = sanitizeXhsUrl(currentUrl);
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      clearTimeout(timeout);
      return failed("http-error", kind, canonicalUrl);
    }

    let bounded;
    try {
      bounded = await readBoundedHtml(response);
    } catch (error) {
      clearTimeout(timeout);
      return failed(error?.name === "AbortError" ? "timeout" : "network-error", kind, canonicalUrl);
    }
    clearTimeout(timeout);
    if (bounded.code) return failed(bounded.code, kind, canonicalUrl);
    const blocked = detectBlockedPage(bounded.html);
    if (blocked) return failed(blocked, kind, canonicalUrl);

    let state;
    try {
      state = extractInitialState(bounded.html);
    } catch (error) {
      return failed(error instanceof XhsImportError ? error.code : "invalid-public-state", kind, canonicalUrl);
    }

    if (kind === "board") {
      try {
        const board = normalizeBoardState(state);
        return {
          status: board.notes.length >= board.totalCount ? "complete" : "partial",
          kind,
          canonicalUrl,
          board,
        };
      } catch (error) {
        return failed(error instanceof XhsImportError ? error.code : "invalid-board-state", kind, canonicalUrl);
      }
    }
    if (kind === "note") {
      try {
        return { status: "complete", kind, canonicalUrl, note: normalizeNoteState(state) };
      } catch (error) {
        return failed(error instanceof XhsImportError ? error.code : "invalid-note-state", kind, canonicalUrl);
      }
    }
    return failed("redirect-required", kind, canonicalUrl);
  }
  return failed("too-many-redirects", kind, canonicalUrl);
}

async function main() {
  const command = "fetch-xhs-public.js";
  try {
    const argv = process.argv.slice(2);
    const args = parseJsonInputArgs(argv);
    if (args.help) {
      process.stdout.write(JSON.stringify(jsonInputUsage(command), null, 2) + "\n");
      return;
    }
    const stdin = args.mode === "stdin" ? fs.readFileSync(0, "utf8") : "";
    const input = readJsonContext(argv, stdin);
    const result = await fetchPublicXhs(input.context);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stderr.write((error?.message || "Xiaohongshu public fetch failed.") + "\n");
    process.exitCode = 2;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

