#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const SCOPES = new Set(["venue", "hosted", "citywide"]);
const STATUSES = new Set(["confirmed", "announced", "program-pending", "historical-lead"]);
const ROUTE_IMPACTS = new Set(["anchor", "candidate", "nearby", "avoidance"]);

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") args.help = true;
    else if (["--events", "--pois", "--itinerary", "--sources"].includes(item)) {
      const key = item.slice(2);
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
      args[key] = value;
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node validate-trip-events.js --events data/events.json --pois data/pois.json --itinerary data/itinerary.json --sources data/sources.json",
  ].join("\n");
}

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  let stats;
  try {
    stats = fs.statSync(resolved);
  } catch (error) {
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`);
  }
  if (!stats.isFile()) throw new Error(`Cannot read JSON ${filePath}: not a file`);
  if (stats.size > MAX_JSON_BYTES) throw new Error(`Cannot read JSON ${filePath}: exceeds ${MAX_JSON_BYTES} byte limit`);
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse JSON ${filePath}: ${error.message}`);
  }
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function eventLabel(event, index) {
  return event?.id || event?.name || `<event ${index + 1}>`;
}

function isValidCoords(coords) {
  return Array.isArray(coords)
    && coords.length === 2
    && Number.isFinite(coords[0])
    && Number.isFinite(coords[1])
    && coords[0] >= -90
    && coords[0] <= 90
    && coords[1] >= -180
    && coords[1] <= 180;
}

function isCalendarDate(value) {
  if (!hasText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isDateTime(value) {
  if (!hasText(value) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function isEventDate(value) {
  return isCalendarDate(value) || isDateTime(value);
}

function dateValue(value) {
  return isCalendarDate(value) ? Date.parse(`${value}T00:00:00.000Z`) : Date.parse(value);
}

function isHttpUrl(value) {
  if (!hasText(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function countValues(events, field, allowed) {
  const counts = new Map();
  for (const event of events) {
    const value = event?.[field];
    if (allowed.has(value)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function eventReferencesFromDay(day) {
  const references = [];
  for (const item of [...(Array.isArray(day?.anchors) ? day.anchors : []), ...(Array.isArray(day?.candidates) ? day.candidates : [])]) {
    if (typeof item === "string") references.push(item);
    else if (hasText(item?.poiId)) references.push(item.poiId);
  }
  for (const stop of Array.isArray(day?.routeStops) ? day.routeStops : []) {
    if (typeof stop === "string") references.push(stop);
    else if (hasText(stop?.poiId)) references.push(stop.poiId);
  }
  return references.filter((poiId) => poiId.startsWith("event:"));
}

function validateEvents(events, pois, itinerary, sources) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(events)) errors.push("events must be an array");
  if (!Array.isArray(pois)) errors.push("pois must be an array");
  if (!Array.isArray(itinerary)) errors.push("itinerary must be an array");
  if (!Array.isArray(sources)) errors.push("sources must be an array");
  if (errors.length) {
    return { eventCount: Array.isArray(events) ? events.length : 0, scopes: {}, statuses: {}, warnings, errors };
  }

  const poiIds = new Set(pois.filter((poi) => hasText(poi?.id)).map((poi) => poi.id));
  const sourceIds = new Set(sources.filter((source) => hasText(source?.id)).map((source) => source.id));
  const eventsById = new Map();

  events.forEach((event, index) => {
    const label = eventLabel(event, index);
    if (!event || Array.isArray(event) || typeof event !== "object") {
      errors.push(`${label} must be an object`);
      return;
    }
    for (const field of ["id", "name", "city", "startsAt", "endsAt", "whyWorthIt", "plan", "tip"]) {
      if (!hasText(event[field])) errors.push(`Event ${label} missing ${field}`);
    }
    if (!hasText(event.id)) {
      errors.push(`Event ${label} missing id`);
    } else if (eventsById.has(event.id)) {
      errors.push(`Duplicate event id: ${event.id}`);
    } else {
      eventsById.set(event.id, event);
    }

    if (!SCOPES.has(event.scope)) errors.push(`Event ${label} has invalid scope: ${event.scope}`);
    if (!STATUSES.has(event.status)) errors.push(`Event ${label} has invalid status: ${event.status}`);
    if (!ROUTE_IMPACTS.has(event.routeImpact)) errors.push(`Event ${label} has invalid routeImpact: ${event.routeImpact}`);
    if (!isHttpUrl(event.officialUrl)) errors.push(`Event ${label} missing officialUrl or has invalid HTTP URL`);

    if (!Array.isArray(event.sourceIds) || event.sourceIds.length === 0 || event.sourceIds.some((sourceId) => !hasText(sourceId))) {
      errors.push(`Event ${label} missing sourceIds`);
    } else {
      for (const sourceId of event.sourceIds) {
        if (!sourceIds.has(sourceId)) errors.push(`Event ${label} references missing source: ${sourceId}`);
      }
    }

    const startIsDate = isEventDate(event.startsAt);
    const endIsDate = isEventDate(event.endsAt);
    if (!startIsDate) errors.push(`Event ${label} has invalid startsAt`);
    if (!endIsDate) errors.push(`Event ${label} has invalid endsAt`);
    if (startIsDate && endIsDate && dateValue(event.startsAt) > dateValue(event.endsAt)) {
      errors.push(`Event ${label} endsAt must not be before startsAt`);
    }
    if (event.status === "confirmed" && (!isDateTime(event.startsAt) || !isDateTime(event.endsAt))) {
      errors.push(`Event ${label} confirmed event requires startsAt and endsAt with date and time`);
    }

    if (event.coords !== undefined && !isValidCoords(event.coords)) errors.push(`Event ${label} has invalid coords`);
    if (event.scope === "venue") {
      const hasVenuePoi = hasText(event.venuePoiId);
      const hasCoords = isValidCoords(event.coords);
      if (!hasVenuePoi && !hasCoords) errors.push(`Event ${label} venue event requires venuePoiId or valid coords`);
      if (hasVenuePoi && !poiIds.has(event.venuePoiId)) errors.push(`Event ${label} references missing venue POI: ${event.venuePoiId}`);
    }
    if (event.scope === "hosted") {
      if (!hasText(event.hostPoiId)) {
        errors.push(`Event ${label} hosted event requires hostPoiId`);
      } else if (!poiIds.has(event.hostPoiId)) {
        errors.push(`Event ${label} references missing host POI: ${event.hostPoiId}`);
      }
    }
  });

  for (const day of itinerary) {
    const dayLabel = day?.id || day?.date || day?.title || "<unknown day>";
    for (const reference of eventReferencesFromDay(day)) {
      const eventId = reference.slice("event:".length);
      const event = eventsById.get(eventId);
      if (!event) {
        errors.push(`${dayLabel} references missing event: ${reference}`);
      } else if (event.status !== "confirmed" || event.scope !== "venue") {
        errors.push(`${dayLabel} ${reference} must reference a confirmed venue event`);
      }
    }
  }

  return {
    eventCount: events.length,
    scopes: countValues(events, "scope", SCOPES),
    statuses: countValues(events, "status", STATUSES),
    warnings,
    errors,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.events || !args.pois || !args.itinerary || !args.sources) {
    process.stdout.write(usage() + "\n");
    return args.help ? 0 : 1;
  }
  const summary = validateEvents(
    readJson(args.events),
    readJson(args.pois),
    readJson(args.itinerary),
    readJson(args.sources),
  );
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  return summary.errors.length > 0 ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
}
