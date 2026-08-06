#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  XhsImportError,
  classifyXhsUrl,
  decideBoardImport,
  extractInitialState,
  normalizeBoardState,
  normalizeNoteState,
  sanitizeXhsUrl,
} from "./xhs-import-runtime.js";

assert.equal(
  classifyXhsUrl("https://www.xiaohongshu.com/board/board-fixture?share_id=secret").kind,
  "board",
);
assert.equal(
  classifyXhsUrl("https://www.xiaohongshu.com/explore/note-fixture?xsec_token=secret").kind,
  "note",
);
assert.equal(classifyXhsUrl("https://xhslink.com/a/fixture").kind, "short-link");
assert.equal(
  sanitizeXhsUrl("https://user:pass@www.xiaohongshu.com/explore/note-fixture?xsec_token=secret#x"),
  "https://www.xiaohongshu.com/explore/note-fixture",
);
assert.equal(
  sanitizeXhsUrl(
    "https://xhslink.com/a/fixture?share_id=secret",
    "https://www.xiaohongshu.com/explore/note-fixture?xsec_token=secret#detail",
  ),
  "https://www.xiaohongshu.com/explore/note-fixture",
);

for (const unsafeUrl of [
  "file:///tmp/note",
  "https://xiaohongshu.com.evil.example/explore/note-fixture",
  "https://www.xiaohongshu.com/explore",
  "https://example.com/board/board-fixture",
]) {
  assert.throws(
    () => classifyXhsUrl(unsafeUrl),
    (error) => error instanceof XhsImportError && error.code === "unsupported-url",
  );
}

delete globalThis.__xhsFixtureExecuted;
const state = extractInitialState(`<!doctype html>
<script>
window.__INITIAL_STATE__ = {
  "board": {
    "boardId": "board-fixture",
    "name": "秋日市场",
    "noteCount": 3,
    "notes": [
      {"noteId":"note-a","displayTitle":"市场里吃什么","user":{"nickname":"作者甲"}},
      {"noteId":"note-b","displayTitle":"社区咖啡","user":{"nickname":"作者乙"}},
      {"noteId":"note-a","displayTitle":"重复标题","user":{"nickname":"作者甲"}}
    ]
  },
  "nullable": undefined,
  "braceInString": "literal } and escaped quote \\\" remain text"
};
globalThis.__xhsFixtureExecuted = true;
</script>`);
assert.equal(globalThis.__xhsFixtureExecuted, undefined);
assert.equal(state.nullable, null);
assert.equal(state.braceInString, "literal } and escaped quote \" remain text");

assert.deepEqual(normalizeBoardState(state), {
  boardId: "board-fixture",
  title: "秋日市场",
  totalCount: 3,
  notes: [
    {
      id: "note-a",
      title: "市场里吃什么",
      authorDisplayName: "作者甲",
      canonicalUrl: "https://www.xiaohongshu.com/explore/note-a",
    },
    {
      id: "note-b",
      title: "社区咖啡",
      authorDisplayName: "作者乙",
      canonicalUrl: "https://www.xiaohongshu.com/explore/note-b",
    },
  ],
});

const normalizedNote = normalizeNoteState({
  noteData: {
    noteId: "note-c",
    title: "十月去市场",
    desc: "留意秋季食材，不把库存写成保证。",
    user: { nickname: "作者丙" },
    tagList: [{ name: "市场" }, { name: "本地生活" }, { name: "市场" }],
    time: 1785888000000,
    type: "normal",
    imageList: [{ url: "https://image.example/1?sign=secret" }, { url: "https://image.example/2" }],
  },
});
assert.deepEqual(normalizedNote, {
  id: "note-c",
  canonicalUrl: "https://www.xiaohongshu.com/explore/note-c",
  title: "十月去市场",
  authorDisplayName: "作者丙",
  body: "留意秋季食材，不把库存写成保证。",
  tags: ["市场", "本地生活"],
  publishedAt: "2026-08-05T00:00:00.000Z",
  media: { types: ["image"], count: 2 },
});
assert.doesNotMatch(JSON.stringify(normalizedNote), /sign=secret|image\.example/);

assert.deepEqual(
  decideBoardImport({ totalCount: 28, anonymousCount: 10, consent: "not-confirmed" }),
  {
    status: "needs-user-choice",
    requiresRiskConfirmation: true,
    allowedActions: [
      "authenticated-link-enumeration",
      "import-anonymous-partial",
      "provide-single-note-links",
    ],
  },
);
assert.deepEqual(
  decideBoardImport({ totalCount: 2, anonymousCount: 2, consent: "not-confirmed" }),
  {
    status: "ready-anonymous",
    requiresRiskConfirmation: false,
    allowedActions: ["import-anonymous-complete"],
  },
);
assert.deepEqual(
  decideBoardImport({ totalCount: 28, anonymousCount: 10, consent: "confirmed", loginAvailable: true }),
  {
    status: "authenticated-link-enumeration-approved",
    requiresRiskConfirmation: false,
    allowedActions: ["enumerate-rendered-links"],
  },
);
assert.deepEqual(
  decideBoardImport({ totalCount: 28, anonymousCount: 10, consent: "declined" }),
  {
    status: "anonymous-only",
    requiresRiskConfirmation: false,
    allowedActions: ["import-anonymous-partial", "provide-single-note-links"],
  },
);
assert.deepEqual(
  decideBoardImport({ totalCount: 28, anonymousCount: 12, consent: "confirmed", loginAvailable: true, stopReason: "captcha" }),
  {
    status: "stopped-risk",
    requiresRiskConfirmation: false,
    allowedActions: ["keep-collected-links", "provide-single-note-links"],
  },
);

for (const html of [
  "<html><body>no state</body></html>",
  "<script>window.__INITIAL_STATE__ = {\"broken\": true;</script>",
  "<script>window.__INITIAL_STATE__ = {unquoted: true};</script>",
]) {
  assert.throws(
    () => extractInitialState(html),
    (error) => error instanceof XhsImportError && error.code === "invalid-public-state",
  );
}

console.log("Xiaohongshu import runtime contract passed");
