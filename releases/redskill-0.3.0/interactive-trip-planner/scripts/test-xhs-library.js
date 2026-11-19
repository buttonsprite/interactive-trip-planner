#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  XhsLibraryError,
  importIntoLibrary,
  initializeLibrary,
  resolveLibraryRoot,
  validateLibrary,
} from "./xhs-library-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(skillRoot, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-library-contract-"));

function makeWorkspace(name) {
  const workspace = path.join(tempRoot, name);
  fs.mkdirSync(path.join(workspace, ".git"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".gitignore"), "dist/\n");
  return workspace;
}

function syntheticNote(id, title, materials = []) {
  return {
    id,
    canonicalUrl: `https://www.xiaohongshu.com/explore/${id}`,
    title,
    authorDisplayName: "Fixture Author",
    body: `${title} 的合成正文，只用于测试。`,
    tags: ["市场", "local-life"],
    publishedAt: "2026-08-01T00:00:00.000Z",
    media: { types: materials.some((item) => item.kind === "original") ? ["image"] : [], count: materials.length },
    access: "anonymous-public",
    signals: {
      places: [{ name: "Fixture Market", city: "Fixture City", area: "Old Town" }],
      categories: ["market"],
      experienceReasons: ["观察地方食材与居民采购节奏"],
      negativeSignals: [],
      timeHints: ["morning"],
      factsToVerify: ["营业日期需要官方复核"],
    },
    userState: "want-to-go",
    userNotes: "优先看市场摊位结构",
    materials,
  };
}

function syntheticPayload(notes, overrides = {}) {
  return {
    importId: overrides.importId || "import-001",
    startedAt: overrides.startedAt || "2026-08-05T12:00:00.000Z",
    source: overrides.source || {
      kind: "board",
      id: "board-fixture",
      title: "Fixture Market Board",
      canonicalUrl: "https://www.xiaohongshu.com/board/board-fixture",
      totalCount: 3,
      anonymousCount: 2,
      authenticatedLinkCount: 1,
    },
    risk: overrides.risk || {
      shown: true,
      confirmed: true,
      authenticatedLinkCount: 1,
    },
    notes,
    failures: overrides.failures || [{ id: "note-missing", code: "login-required" }],
    tripSelection: overrides.tripSelection || {
      tripSlug: "fixture-autumn-trip",
      entries: notes.map((note) => ({
        noteId: note.id,
        status: "candidate",
        roles: ["local-life"],
        placeIds: ["fixture-market"],
      })),
    },
  };
}

function writeValidStaging(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "cover.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(root, "market-ocr.txt"), "摊位：秋季食材\n", "utf8");
}

try {
  const workspace = makeWorkspace("happy-workspace");
  const staging = path.join(tempRoot, "happy-staging");
  writeValidStaging(staging);
  const root = resolveLibraryRoot({ workspaceRoot: workspace });
  assert.equal(root, path.join(workspace, "travel-library", "xiaohongshu"));

  const initialized = initializeLibrary({ workspaceRoot: workspace });
  assert.equal(initialized.schemaVersion, 1);
  assert.ok(fs.existsSync(path.join(root, "README.md")));
  assert.ok(fs.existsSync(path.join(root, "INDEX.md")));
  assert.match(fs.readFileSync(path.join(workspace, ".gitignore"), "utf8"), /^travel-library\/$/m);

  const firstPayload = syntheticPayload([
    syntheticNote("note-a", "市场里看什么", [
      { stagedFilename: "cover.jpg", kind: "original", position: 1, role: "cover" },
      { stagedFilename: "market-ocr.txt", kind: "derived", position: 1, role: "ocr" },
    ]),
    syntheticNote("note-b", "社区咖啡怎么选"),
    syntheticNote("note-a", "同批次重复标题"),
  ]);
  const first = importIntoLibrary({
    workspaceRoot: workspace,
    assetStagingRoot: staging,
    payload: firstPayload,
  });
  assert.deepEqual(first.counts, { received: 3, imported: 2, updated: 0, duplicates: 1, failed: 1 });
  assert.ok(fs.existsSync(path.join(root, "notes", "note-a", "record.json")));
  assert.ok(fs.existsSync(path.join(root, "notes", "note-a", "note.md")));
  assert.ok(fs.existsSync(path.join(root, "collections", "board-fixture", "collection.md")));
  assert.ok(fs.existsSync(path.join(root, "imports", "2026-08-05-import-001", "summary.md")));
  assert.ok(fs.existsSync(path.join(root, "trips", "fixture-autumn-trip", "selection.md")));

  const library = JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8"));
  assert.equal(library.notes.length, 2);
  assert.equal(library.collections.length, 1);
  assert.equal(library.imports.length, 1);
  assert.equal(library.trips.length, 1);
  assert.match(fs.readFileSync(path.join(root, "INDEX.md"), "utf8"), /notes\/note-a\/note\.md/);
  assert.match(fs.readFileSync(path.join(root, "notes", "note-a", "note.md"), "utf8"), /观察地方食材与居民采购节奏/);
  assert.match(fs.readFileSync(path.join(root, "collections", "board-fixture", "collection.md"), "utf8"), /\.\.\/\.\.\/notes\/note-a\/note\.md/);

  const mediaManifest = JSON.parse(fs.readFileSync(path.join(root, "notes", "note-a", "media", "manifest.json"), "utf8"));
  assert.deepEqual(mediaManifest.files.map((item) => item.path), [
    "derived/01-ocr.txt",
    "original/01-cover.jpg",
  ]);
  const coverManifest = mediaManifest.files.find((item) => item.path === "original/01-cover.jpg");
  assert.match(coverManifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(coverManifest.bytes, 4);
  assert.ok(fs.existsSync(path.join(root, "notes", "note-a", "media", "original", "01-cover.jpg")));
  assert.ok(fs.existsSync(path.join(root, "notes", "note-a", "media", "derived", "01-ocr.txt")));
  assert.doesNotMatch(JSON.stringify(mediaManifest), /https?:|sign=|token/i);

  const second = importIntoLibrary({
    workspaceRoot: workspace,
    payload: syntheticPayload([
      syntheticNote("note-a", "更新后的市场标题"),
      syntheticNote("note-c", "街区小馆"),
    ], {
      importId: "import-002",
      startedAt: "2026-08-06T08:00:00.000Z",
      failures: [],
    }),
  });
  assert.deepEqual(second.counts, { received: 2, imported: 1, updated: 1, duplicates: 0, failed: 0 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8")).notes.length, 3);
  assert.match(fs.readFileSync(path.join(root, "notes", "note-a", "note.md"), "utf8"), /更新后的市场标题/);
  assert.equal(fs.readdirSync(path.join(root, "notes")).filter((name) => name === "note-a").length, 1);

  const validation = validateLibrary({ libraryRoot: root });
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.status, "valid");
  assert.equal(validation.counts.notes, 3);

  const invalidCases = [];

  const invalidSignatureStaging = path.join(tempRoot, "invalid-signature-staging");
  fs.mkdirSync(invalidSignatureStaging);
  fs.writeFileSync(path.join(invalidSignatureStaging, "fake.jpg"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  invalidCases.push({
    name: "invalid-signature",
    staging: invalidSignatureStaging,
    note: syntheticNote("note-invalid-signature", "Invalid", [
      { stagedFilename: "fake.jpg", kind: "original", position: 1, role: "cover" },
    ]),
    code: "invalid-material",
  });

  const symlinkStaging = path.join(tempRoot, "symlink-staging");
  fs.mkdirSync(symlinkStaging);
  fs.symlinkSync(path.join(staging, "cover.jpg"), path.join(symlinkStaging, "link.jpg"));
  invalidCases.push({
    name: "symlink-material",
    staging: symlinkStaging,
    note: syntheticNote("note-symlink-material", "Symlink", [
      { stagedFilename: "link.jpg", kind: "original", position: 1, role: "cover" },
    ]),
    code: "unsafe-path",
  });

  const oversizedStaging = path.join(tempRoot, "oversized-staging");
  fs.mkdirSync(oversizedStaging);
  fs.closeSync(fs.openSync(path.join(oversizedStaging, "large.jpg"), "w"));
  fs.truncateSync(path.join(oversizedStaging, "large.jpg"), 15 * 1024 * 1024 + 1);
  invalidCases.push({
    name: "oversized-material",
    staging: oversizedStaging,
    note: syntheticNote("note-oversized-material", "Oversized", [
      { stagedFilename: "large.jpg", kind: "original", position: 1, role: "cover" },
    ]),
    code: "material-too-large",
  });

  for (const fixture of invalidCases) {
    assert.throws(
      () => importIntoLibrary({
        workspaceRoot: workspace,
        assetStagingRoot: fixture.staging,
        payload: syntheticPayload([fixture.note], { importId: fixture.name, failures: [] }),
      }),
      (error) => error instanceof XhsLibraryError && error.code === fixture.code,
      fixture.name,
    );
    assert.ok(!fs.existsSync(path.join(root, "notes", fixture.note.id)), fixture.name);
  }

  assert.throws(
    () => importIntoLibrary({
      workspaceRoot: workspace,
      payload: syntheticPayload([syntheticNote("../escape", "Escape")], { importId: "path-traversal", failures: [] }),
    }),
    (error) => error instanceof XhsLibraryError && error.code === "unsafe-id",
  );
  assert.ok(!fs.existsSync(path.join(workspace, "travel-library", "escape")));

  assert.throws(
    () => resolveLibraryRoot({ workspaceRoot: repositoryRoot, libraryRoot: path.join(skillRoot, "travel-library") }),
    (error) => error instanceof XhsLibraryError && error.code === "forbidden-library-root",
  );
  assert.throws(
    () => resolveLibraryRoot({ workspaceRoot: repositoryRoot, libraryRoot: path.join(repositoryRoot, "releases", "redskill-0.2.0", "travel-library") }),
    (error) => error instanceof XhsLibraryError && error.code === "forbidden-library-root",
  );

  const symlinkWorkspace = makeWorkspace("destination-symlink-workspace");
  const symlinkRoot = resolveLibraryRoot({ workspaceRoot: symlinkWorkspace });
  initializeLibrary({ workspaceRoot: symlinkWorkspace });
  const outsideNotes = path.join(tempRoot, "outside-notes");
  fs.mkdirSync(outsideNotes);
  fs.rmSync(path.join(symlinkRoot, "notes"), { recursive: true, force: true });
  fs.symlinkSync(outsideNotes, path.join(symlinkRoot, "notes"));
  assert.throws(
    () => importIntoLibrary({
      workspaceRoot: symlinkWorkspace,
      payload: syntheticPayload([syntheticNote("note-destination-symlink", "Destination Symlink")], { importId: "destination-symlink", failures: [] }),
    }),
    (error) => error instanceof XhsLibraryError && error.code === "unsafe-path",
  );
  assert.deepEqual(fs.readdirSync(outsideNotes), []);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Xiaohongshu library contract passed");
