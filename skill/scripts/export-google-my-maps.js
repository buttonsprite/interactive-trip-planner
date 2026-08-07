#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapDeliveryRuntime } from "./load-map-delivery-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const skillRoot = path.join(repoRoot, "skill");
const outputFiles = ["README.md", "places.csv", "itinerary.kml"];

function parseArgs(argv) {
  const args = { guide: "", output: "", state: "", locale: "zh-CN", replace: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--replace") {
      if (seen.has(token)) throw new Error("invalid arguments");
      seen.add(token);
      args.replace = true;
      continue;
    }
    const key = { "--guide": "guide", "--output": "output", "--state": "state", "--locale": "locale" }[token];
    if (!key || seen.has(token) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw new Error("invalid arguments");
    }
    seen.add(token);
    args[key] = argv[index + 1];
    index += 1;
  }
  if (!args.guide || !args.output || !["zh-CN", "en"].includes(args.locale)) {
    throw new Error("invalid arguments");
  }
  return args;
}

function canonicalPlannedPath(value) {
  const resolved = path.resolve(value);
  const tail = [];
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error("path cannot be resolved");
    tail.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...tail);
}

function assertDirectory(value) {
  const resolved = path.resolve(value);
  if (!fs.statSync(resolved).isDirectory()) throw new Error("guide must be a directory");
  return fs.realpathSync(resolved);
}

function assertSafeOutput(outputValue, guideRoot) {
  const requested = path.resolve(outputValue);
  const requestedStats = lstatMaybe(requested);
  if (requestedStats?.isSymbolicLink()) throw new Error("unsafe output directory");
  const output = canonicalPlannedPath(outputValue);
  const protectedRoots = outputProtectedRoots(output, guideRoot);
  if (protectedRoots.includes(output)) throw new Error("unsafe output directory");
  if (fs.existsSync(output) && !fs.statSync(output).isDirectory()) {
    throw new Error("output must be a directory");
  }
  return { output, protectedRoots };
}

function outputProtectedRoots(output, guideRoot) {
  return [
    path.parse(output).root,
    canonicalPlannedPath(os.homedir()),
    canonicalPlannedPath(repoRoot),
    canonicalPlannedPath(skillRoot),
    guideRoot,
  ];
}

function lstatMaybe(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function readJson(file) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  return value;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizePois(rawPois) {
  if (!Array.isArray(rawPois)) throw new Error("pois must be an array");
  const ids = new Set();
  return rawPois.map((source, index) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("invalid poi");
    const generatedId = slugify(`${source.city || "place"}-${source.name || index + 1}`) || `place-${index + 1}`;
    const id = String(source.id || generatedId).trim();
    if (!id || ids.has(id)) throw new Error("duplicate or missing poi id");
    ids.add(id);
    return {
      ...source,
      id,
      name_zh: source.name_zh || source.zh || "",
    };
  });
}

function resolvedDefaultAssignments(days, pois, rules) {
  const daysById = new Map(days.map((day) => [day.id, day]));
  const poisById = new Map(pois.map((poi) => [poi.id, poi]));
  const poisByName = new Map();
  for (const poi of pois) {
    const matches = poisByName.get(poi.name) || [];
    matches.push(poi);
    poisByName.set(poi.name, matches);
  }
  const stopsByDay = new Map(days.map((day) => [day.id, []]));
  rules.forEach((rule, sourceIndex) => {
    if (!rule || typeof rule !== "object" || !daysById.has(rule.dayId)) {
      throw new Error("invalid default assignment");
    }
    let poi = null;
    if (typeof rule.poiId === "string") {
      poi = poisById.get(rule.poiId) || null;
    } else if (typeof rule.name === "string") {
      const matches = poisByName.get(rule.name) || [];
      if (matches.length !== 1) throw new Error("invalid default assignment");
      poi = matches[0];
    }
    const order = Number(rule.order);
    if (!poi || !Number.isInteger(order) || order < 0) throw new Error("invalid default assignment");
    stopsByDay.get(rule.dayId).push({ poiId: poi.id, order, sourceIndex });
  });
  return stopsByDay;
}

function normalizeItinerary(rawItinerary, pois) {
  if (Array.isArray(rawItinerary)) {
    return { trip: {}, days: rawItinerary };
  }
  if (!rawItinerary || typeof rawItinerary !== "object" || !Array.isArray(rawItinerary.days)) {
    throw new Error("invalid itinerary");
  }
  const sourceDays = rawItinerary.days;
  const ids = new Set();
  for (const day of sourceDays) {
    if (!day || typeof day !== "object" || typeof day.id !== "string" || !day.id || ids.has(day.id)) {
      throw new Error("invalid itinerary day");
    }
    ids.add(day.id);
  }
  if (!Array.isArray(rawItinerary.defaultAssignments)) {
    return { trip: rawItinerary.trip || {}, days: sourceDays };
  }
  const stopsByDay = resolvedDefaultAssignments(sourceDays, pois, rawItinerary.defaultAssignments);
  const days = sourceDays.map((day) => ({
    ...day,
    routeStops: stopsByDay.get(day.id)
      .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
      .map(({ poiId, order }) => ({ poiId, order })),
  }));
  return { trip: rawItinerary.trip || {}, days };
}

function defaultPriorities() {
  return {
    must: "必须去",
    preferred: "优先去",
    nearby: "顺路可去",
    archive: "留档",
    pending: "待复核",
    booked: "已预约",
  };
}

function loadTrip(guideRoot) {
  const pois = normalizePois(readJson(path.join(guideRoot, "data/pois.json")));
  const itinerary = normalizeItinerary(readJson(path.join(guideRoot, "data/itinerary.json")), pois);
  return {
    ...itinerary.trip,
    pois,
    days: itinerary.days,
    priorities: defaultPriorities(),
  };
}

function loadState(stateValue) {
  if (!stateValue) return undefined;
  const state = readJson(path.resolve(stateValue));
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("invalid state");
  return state;
}

function validWgs84(coords) {
  return Array.isArray(coords)
    && coords.length >= 2
    && Number.isFinite(Number(coords[0]))
    && Number.isFinite(Number(coords[1]))
    && Number(coords[0]) >= -90
    && Number(coords[0]) <= 90
    && Number(coords[1]) >= -180
    && Number(coords[1]) <= 180;
}

function inspectOutputDirectory(output, protectedRoots) {
  if (protectedRoots.includes(output)) throw new Error("unsafe output directory");
  const stats = lstatMaybe(output);
  if (!stats) return "absent";
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("unsafe output directory");
  const realOutput = fs.realpathSync(output);
  if (realOutput !== output || protectedRoots.includes(realOutput)) {
    throw new Error("unsafe output directory");
  }
  return "directory";
}

function ensureCanonicalDirectory(directory) {
  const missing = [];
  let cursor = directory;
  let stats = lstatMaybe(cursor);
  while (!stats) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error("unsafe output directory");
    missing.unshift(path.basename(cursor));
    cursor = parent;
    stats = lstatMaybe(cursor);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory() || fs.realpathSync(cursor) !== cursor) {
    throw new Error("unsafe output directory");
  }
  for (const segment of missing) {
    cursor = path.join(cursor, segment);
    try {
      fs.mkdirSync(cursor);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    stats = lstatMaybe(cursor);
    if (!stats?.isDirectory() || stats.isSymbolicLink() || fs.realpathSync(cursor) !== cursor) {
      throw new Error("unsafe output directory");
    }
  }
}

function inspectKnownTargets(directory, replace) {
  for (const file of outputFiles) {
    const stats = lstatMaybe(path.join(directory, file));
    if (!stats) continue;
    if (!replace || (!stats.isFile() && !stats.isSymbolicLink())) {
      throw new Error("output conflict");
    }
  }
}

function testFailure(phase, file) {
  if (
    process.env.NODE_ENV === "test"
    && process.env.TRIP_MAP_EXPORT_TEST_FAILURE === `${phase}:${file}`
  ) {
    throw new Error("injected export failure");
  }
}

function testPause(phase) {
  const pauseDir = process.env.TRIP_MAP_EXPORT_TEST_PAUSE_DIR;
  if (process.env.NODE_ENV !== "test" || !pauseDir) return;
  const ready = path.join(pauseDir, `${phase}.ready`);
  const resume = path.join(pauseDir, `${phase}.continue`);
  fs.writeFileSync(ready, "ready", { flag: "wx" });
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(resume)) {
    if (Date.now() >= deadline) throw new Error("test pause timed out");
    Atomics.wait(signal, 0, 0, 10);
  }
}

function oldStageName(file) {
  return `.old-${file}`;
}

function cleanupStage(stage) {
  for (const file of [...outputFiles, ...outputFiles.map(oldStageName)]) {
    const target = path.join(stage, file);
    const stats = lstatMaybe(target);
    if (!stats) continue;
    if (!stats.isFile() && !stats.isSymbolicLink()) throw new Error("unsafe staging entry");
    fs.unlinkSync(target);
  }
  fs.rmdirSync(stage);
}

function stageOutputFiles(parent, files) {
  const stage = fs.mkdtempSync(path.join(parent, ".trip-map-export-"));
  try {
    for (const file of outputFiles) {
      fs.writeFileSync(path.join(stage, file), files[file], { encoding: "utf8", flag: "wx" });
      testFailure("stage", file);
    }
    return stage;
  } catch (error) {
    cleanupStage(stage);
    throw error;
  }
}

function restoreCapturedOutput({ captured, output, stage, installed, movedOld }) {
  for (const file of [...installed].reverse()) {
    const installedPath = path.join(captured, file);
    if (lstatMaybe(installedPath)) fs.renameSync(installedPath, path.join(stage, file));
  }
  for (const file of [...movedOld].reverse()) {
    const oldPath = path.join(stage, oldStageName(file));
    if (lstatMaybe(oldPath)) fs.renameSync(oldPath, path.join(captured, file));
  }
  const unexpected = lstatMaybe(output);
  if (unexpected) {
    if (!unexpected.isSymbolicLink()) throw new Error("output changed during rollback");
    fs.unlinkSync(output);
  }
  fs.renameSync(captured, output);
}

function commitIntoExistingOutput(output, stage, replace) {
  const captured = `${stage}.captured`;
  fs.renameSync(output, captured);
  const capturedStats = lstatMaybe(captured);
  if (!capturedStats?.isDirectory() || capturedStats.isSymbolicLink()) {
    fs.renameSync(captured, output);
    throw new Error("unsafe output directory");
  }
  const installed = [];
  const movedOld = [];
  try {
    inspectKnownTargets(captured, replace);
    for (const file of outputFiles) {
      const current = path.join(captured, file);
      if (!lstatMaybe(current)) continue;
      fs.renameSync(current, path.join(stage, oldStageName(file)));
      movedOld.push(file);
    }
    for (const file of outputFiles) {
      fs.renameSync(path.join(stage, file), path.join(captured, file));
      installed.push(file);
      testFailure("commit", file);
    }
    if (lstatMaybe(output)) throw new Error("output changed during commit");
    fs.renameSync(captured, output);
  } catch (error) {
    restoreCapturedOutput({ captured, output, stage, installed, movedOld });
    throw error;
  }
  cleanupStage(stage);
}

function writeOutput(output, expectedState, protectedRoots, files, replace) {
  const parent = path.dirname(output);
  ensureCanonicalDirectory(parent);
  if (fs.realpathSync(parent) !== parent) throw new Error("unsafe output directory");
  const stage = stageOutputFiles(parent, files);
  try {
    const currentState = inspectOutputDirectory(output, protectedRoots);
    if (currentState !== expectedState) throw new Error("output changed during export");
    if (currentState === "absent") {
      fs.renameSync(stage, output);
      return;
    }
    commitIntoExistingOutput(output, stage, replace);
  } catch (error) {
    if (lstatMaybe(stage)?.isDirectory()) cleanupStage(stage);
    throw error;
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const guideRoot = assertDirectory(args.guide);
  const { output, protectedRoots } = assertSafeOutput(args.output, guideRoot);
  const expectedOutputState = inspectOutputDirectory(output, protectedRoots);
  if (expectedOutputState === "directory") inspectKnownTargets(output, args.replace);
  const trip = loadTrip(guideRoot);
  const state = loadState(args.state);
  const files = loadMapDeliveryRuntime().buildMyMapsFiles({ trip, state, locale: args.locale });
  testPause("before-write");
  writeOutput(output, expectedOutputState, protectedRoots, files, args.replace);
  const summary = {
    status: "ok",
    files: outputFiles,
    counts: {
      places: trip.pois.length,
      kmlPlacemarks: (files["itinerary.kml"].match(/<Placemark>/g) || []).length,
      manualLocation: trip.pois.filter((poi) => !validWgs84(poi.coords)).length,
    },
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch {
  process.stderr.write("Google My Maps export failed.\n");
  process.exitCode = 2;
}
