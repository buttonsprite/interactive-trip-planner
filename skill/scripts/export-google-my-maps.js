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
  const output = canonicalPlannedPath(outputValue);
  const protectedRoots = [
    path.parse(output).root,
    canonicalPlannedPath(os.homedir()),
    canonicalPlannedPath(repoRoot),
    canonicalPlannedPath(skillRoot),
    guideRoot,
  ];
  if (protectedRoots.includes(output)) throw new Error("unsafe output directory");
  if (fs.existsSync(output) && !fs.statSync(output).isDirectory()) {
    throw new Error("output must be a directory");
  }
  return output;
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

function preflightOutput(output, replace) {
  if (!fs.existsSync(output)) return;
  const entries = outputFiles.map((file) => ({ file, target: path.join(output, file) }));
  for (const entry of entries) {
    let stats;
    try {
      stats = fs.lstatSync(entry.target);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!replace || (!stats.isFile() && !stats.isSymbolicLink())) throw new Error("output conflict");
  }
}

function writeOutput(output, files, replace) {
  fs.mkdirSync(output, { recursive: true });
  if (replace) {
    for (const file of outputFiles) {
      const target = path.join(output, file);
      try {
        fs.unlinkSync(target);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  for (const file of outputFiles) {
    fs.writeFileSync(path.join(output, file), files[file], { encoding: "utf8", flag: "wx" });
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const guideRoot = assertDirectory(args.guide);
  const output = assertSafeOutput(args.output, guideRoot);
  const trip = loadTrip(guideRoot);
  const state = loadState(args.state);
  const files = loadMapDeliveryRuntime().buildMyMapsFiles({ trip, state, locale: args.locale });
  preflightOutput(output, args.replace);
  writeOutput(output, files, args.replace);
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
