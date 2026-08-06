#!/usr/bin/env node

import assert from "node:assert/strict";
import { fetchPublicXhs } from "./fetch-xhs-public.js";

const boardHtml = `<!doctype html><script>window.__INITIAL_STATE__={"board":{"boardId":"board-fixture","name":"市场收藏","noteCount":3,"notes":[{"noteId":"note-a","displayTitle":"市场甲","user":{"nickname":"作者甲"}},{"noteId":"note-b","displayTitle":"咖啡乙","user":{"nickname":"作者乙"}}]}};</script>`;
const noteHtml = `<!doctype html><script>window.__INITIAL_STATE__={"noteData":{"noteId":"note-a","title":"市场甲","desc":"看地方食材","user":{"nickname":"作者甲"},"tagList":[{"name":"市场"}],"imageList":[]}};</script>`;

function htmlResponse(html, init = {}) {
  return new Response(html, {
    status: init.status || 200,
    headers: { "content-type": "text/html; charset=utf-8", ...(init.headers || {}) },
  });
}

function createTransport(sequence) {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ url: String(url), options });
    const next = sequence.shift();
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(url, options);
    return next;
  };
  transport.calls = calls;
  return transport;
}

const boardTransport = createTransport([htmlResponse(boardHtml)]);
const boardResult = await fetchPublicXhs(
  { url: "https://www.xiaohongshu.com/board/board-fixture?share_id=secret" },
  { transport: boardTransport },
);
assert.equal(boardResult.status, "partial");
assert.equal(boardResult.kind, "board");
assert.equal(boardResult.canonicalUrl, "https://www.xiaohongshu.com/board/board-fixture");
assert.equal(boardResult.board.totalCount, 3);
assert.equal(boardResult.board.notes.length, 2);
assert.equal(boardTransport.calls.length, 1);
const sentHeaders = new Headers(boardTransport.calls[0].options.headers);
assert.equal(sentHeaders.get("cookie"), null);
assert.equal(sentHeaders.get("authorization"), null);
assert.equal(boardTransport.calls[0].options.redirect, "manual");
assert.doesNotMatch(JSON.stringify(boardResult), /share_id|secret/);

const shortTransport = createTransport([
  new Response(null, {
    status: 302,
    headers: { location: "https://www.xiaohongshu.com/explore/note-a?xsec_token=secret" },
  }),
  htmlResponse(noteHtml),
]);
const shortResult = await fetchPublicXhs(
  { url: "https://xhslink.com/a/fixture?share_id=secret" },
  { transport: shortTransport },
);
assert.equal(shortResult.status, "complete");
assert.equal(shortResult.kind, "note");
assert.equal(shortResult.note.id, "note-a");
assert.equal(shortResult.canonicalUrl, "https://www.xiaohongshu.com/explore/note-a");
assert.doesNotMatch(JSON.stringify(shortResult), /xsec_token|share_id|secret/);

const failureCases = [
  {
    label: "redirect outside allowlist",
    transport: createTransport([new Response(null, { status: 302, headers: { location: "https://evil.example/note" } })]),
    expectedCode: "unsafe-redirect",
  },
  {
    label: "too many redirects",
    transport: createTransport([
      new Response(null, { status: 302, headers: { location: "https://xhslink.com/a/2" } }),
      new Response(null, { status: 302, headers: { location: "https://xhslink.com/a/3" } }),
      new Response(null, { status: 302, headers: { location: "https://xhslink.com/a/4" } }),
      new Response(null, { status: 302, headers: { location: "https://www.xiaohongshu.com/explore/note-a" } }),
    ]),
    expectedCode: "too-many-redirects",
  },
  {
    label: "non html",
    transport: createTransport([new Response("{}", { status: 200, headers: { "content-type": "application/json" } })]),
    expectedCode: "unexpected-content-type",
  },
  {
    label: "response too large",
    transport: createTransport([htmlResponse("x".repeat(5 * 1024 * 1024 + 1))]),
    expectedCode: "response-too-large",
  },
  {
    label: "login page",
    transport: createTransport([htmlResponse("<html><body>登录后查看完整内容</body></html>")]),
    expectedCode: "login-required",
  },
  {
    label: "captcha page",
    transport: createTransport([htmlResponse("<html><body>请完成验证码 安全验证</body></html>")]),
    expectedCode: "risk-control",
  },
  {
    label: "malformed state",
    transport: createTransport([htmlResponse("<script>window.__INITIAL_STATE__={broken:true};</script>")]),
    expectedCode: "invalid-public-state",
  },
];

for (const { label, transport, expectedCode } of failureCases) {
  const result = await fetchPublicXhs(
    { url: "https://www.xiaohongshu.com/board/board-fixture?xsec_token=secret" },
    { transport },
  );
  assert.equal(result.status, "failed", label);
  assert.equal(result.code, expectedCode, label);
  assert.match(result.canonicalUrl, /^https:\/\/(?:www\.xiaohongshu\.com|xhslink\.com)\//, label);
  assert.doesNotMatch(result.canonicalUrl, /[?#]/, label);
  assert.doesNotMatch(JSON.stringify(result), /xsec_token|secret/, label);
}

const timeoutTransport = createTransport([
  (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }),
]);
const timeoutResult = await fetchPublicXhs(
  { url: "https://www.xiaohongshu.com/board/board-fixture", timeoutMs: 20 },
  { transport: timeoutTransport },
);
assert.equal(timeoutResult.status, "failed");
assert.equal(timeoutResult.code, "timeout");

const networkResult = await fetchPublicXhs(
  { url: "https://www.xiaohongshu.com/board/board-fixture?xsec_token=secret" },
  { transport: createTransport([new Error("network failed xsec_token=secret")]) },
);
assert.deepEqual(networkResult, {
  status: "failed",
  code: "network-error",
  kind: "board",
  canonicalUrl: "https://www.xiaohongshu.com/board/board-fixture",
});

for (const unsafe of [
  "https://user:pass@www.xiaohongshu.com/explore/note-a",
  "https://example.com/explore/note-a",
]) {
  await assert.rejects(
    fetchPublicXhs({ url: unsafe }, { transport: createTransport([]) }),
    (error) => error.code === "unsupported-url" || error.code === "embedded-credentials",
  );
}

console.log("Xiaohongshu public fetch contract passed");
