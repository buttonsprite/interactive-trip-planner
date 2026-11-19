#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const publicTemplateMapsDir = path.join(skillRoot, "assets", "guide-template-europe-public", "maps");
const canonicalDeliveryPath = path.join(skillRoot, "assets", "guide-template", "maps", "assets", "trip-map-delivery.js");

const INLINE_SCRIPT_ESCAPES = {
  "<": "\\u003C",
  ">": "\\u003E",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

function serializeForInlineScript(value) {
  return JSON.stringify(value, null, 2).replace(/[<>&\u2028\u2029]/g, (ch) => INLINE_SCRIPT_ESCAPES[ch]);
}

function parseArgs(argv) {
  const idx = argv.indexOf("--guide");
  if (idx === -1 || !argv[idx + 1]) {
    console.error("Usage: node scripts/build-trip-map.js --guide <guide-directory>");
    process.exit(2);
  }
  return path.resolve(argv[idx + 1]);
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function buildTripMap(guideDir) {
  const dataDir = path.join(guideDir, "data");
  const poisPath = path.join(dataDir, "pois.json");
  const itineraryPath = path.join(dataDir, "itinerary.json");
  if (!fs.existsSync(poisPath) || !fs.existsSync(itineraryPath)) {
    throw new Error(`Missing data/pois.json or data/itinerary.json in ${guideDir}`);
  }

  const pois = JSON.parse(fs.readFileSync(poisPath, "utf8"));
  const itinerary = JSON.parse(fs.readFileSync(itineraryPath, "utf8"));
  const events = readJsonIfExists(path.join(dataDir, "events.json"), []);
  const targetMapsDir = path.join(guideDir, "maps");
  const targetHtmlPath = path.join(targetMapsDir, "itinerary-map.html");

  if (!fs.existsSync(targetHtmlPath)) {
    fs.mkdirSync(targetMapsDir, { recursive: true });
    fs.cpSync(publicTemplateMapsDir, targetMapsDir, { recursive: true });
  }

  // Always sync canonical trip-map-delivery.js
  const deliveryTarget = path.join(targetMapsDir, "assets", "trip-map-delivery.js");
  fs.mkdirSync(path.dirname(deliveryTarget), { recursive: true });
  fs.copyFileSync(canonicalDeliveryPath, deliveryTarget);

  const html = fs.readFileSync(targetHtmlPath, "utf8");
  const declaration = "const PUBLIC_TRIP_DATA = ";
  const aliasMarker = "    const stops = PUBLIC_TRIP_DATA.stops;";
  const dataStart = html.indexOf(declaration);
  const aliasStart = html.indexOf(aliasMarker, dataStart);
  if (dataStart < 0 || aliasStart < 0) {
    throw new Error("Target itinerary-map.html is missing the PUBLIC_TRIP_DATA boundary");
  }

  const directTrip = {
    trip: itinerary.trip || { slug: path.basename(guideDir), title: path.basename(guideDir), language: "zh-CN" },
    stops: itinerary.stops || [],
    localStops: itinerary.localStops || [],
    itineraryDays: Array.isArray(itinerary) ? itinerary : (itinerary.days || []),
    transitSegmentsByDay: itinerary.transitSegmentsByDay || {},
    pois,
    defaultAssignments: itinerary.defaultAssignments || [],
    events,
  };

  let nextHtml = `${html.slice(0, dataStart)}const PUBLIC_TRIP_DATA = ${serializeForInlineScript(directTrip)};\n\n${html.slice(aliasStart)}`;
  if (directTrip.trip?.title) {
    nextHtml = nextHtml.replace(/<title>[^<]*<\/title>/, `<title>${String(directTrip.trip.title).replace(/[<>&]/g, "")}</title>`);
  }
  fs.writeFileSync(targetHtmlPath, nextHtml);
  return { htmlPath: targetHtmlPath, poiCount: pois.length, dayCount: directTrip.itineraryDays.length };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const guideDir = parseArgs(process.argv.slice(2));
  const result = buildTripMap(guideDir);
  console.log(`built trip map at ${result.htmlPath} (${result.poiCount} places, ${result.dayCount} days)`);
}
