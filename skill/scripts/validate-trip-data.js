#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--pois") args.pois = argv[++i];
    else if (item === "--itinerary") args.itinerary = argv[++i];
    else if (item === "--day") args.day = argv[++i];
    else if (item === "--strict-routes") args.strictRoutes = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node validate-trip-data.js --pois data/pois.json --itinerary data/itinerary.json [--strict-routes] [--day day-id]",
  ].join("\n");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse JSON ${filePath}: ${error.message}`);
  }
}

function isValidCoord(coords) {
  return Array.isArray(coords)
    && coords.length === 2
    && Number.isFinite(coords[0])
    && Number.isFinite(coords[1])
    && coords[0] >= -90
    && coords[0] <= 90
    && coords[1] >= -180
    && coords[1] <= 180;
}

function isValidRouteCoord(coords) {
  return Array.isArray(coords)
    && coords.length === 2
    && Number.isFinite(coords[0])
    && Number.isFinite(coords[1])
    && coords[0] >= -180
    && coords[0] <= 180
    && coords[1] >= -90
    && coords[1] <= 90;
}

function asPoiId(stop) {
  if (typeof stop === "string") return stop;
  if (stop && typeof stop.poiId === "string") return stop.poiId;
  return null;
}

function haversineMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earth = 6371000;
  const deltaLat = radians(right[0] - left[0]);
  const deltaLng = radians(right[1] - left[1]);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(left[0])) * Math.cos(radians(right[0])) * Math.sin(deltaLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function routeGapMessage(strictRoutes, errors, warnings, message) {
  (strictRoutes ? errors : warnings).push(message);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.pois || !args.itinerary) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const pois = readJson(path.resolve(args.pois));
  const itinerary = readJson(path.resolve(args.itinerary));
  const errors = [];
  const warnings = [];

  if (!Array.isArray(pois)) errors.push("pois must be an array");
  if (!Array.isArray(itinerary)) errors.push("itinerary must be an array");
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  const required = ["id", "name", "name_zh", "category", "coords", "note", "plan", "tip", "source"];
  const allowedPriorities = new Set(["", "must", "preferred", "nearby", "archive", "pending", "booked", "S", "A", "B", "C"]);
  const allowedContentTiers = new Set(["deep", "standard", "compact"]);
  const ids = new Set();
  const identityKeys = new Map();
  const categoryCounts = new Map();
  const cityCounts = new Map();

  for (const poi of pois) {
    for (const field of required) {
      if (poi[field] == null || poi[field] === "") {
        errors.push(`POI ${poi.id || poi.name || "<unknown>"} missing ${field}`);
      }
    }
    if (typeof poi.id === "string") {
      if (ids.has(poi.id)) errors.push(`Duplicate POI id: ${poi.id}`);
      ids.add(poi.id);
    }
    if (!isValidCoord(poi.coords)) errors.push(`POI ${poi.id || poi.name} has invalid coords`);
    if (poi.priority != null && !allowedPriorities.has(poi.priority)) {
      errors.push(`POI ${poi.id || poi.name} has invalid priority: ${poi.priority}`);
    }
    if (["S", "A", "B", "C"].includes(poi.priority)) {
      warnings.push(`POI ${poi.id || poi.name} uses legacy priority ${poi.priority}; prefer semantic values must/preferred/nearby/archive`);
    }

    if (poi.contentTier != null) {
      const poiLabel = poi.id || poi.name || "<unknown>";
      if (!allowedContentTiers.has(poi.contentTier)) {
        errors.push(`POI ${poiLabel} has invalid contentTier: ${poi.contentTier}`);
      }

      const sections = poi.detailSections;
      const hasWhy = typeof poi.whyWorthIt === "string" && poi.whyWorthIt.trim().length > 0;
      if (["deep", "standard"].includes(poi.contentTier) && !hasWhy) {
        errors.push(`POI ${poiLabel} ${poi.contentTier} content requires whyWorthIt`);
      }
      if (poi.contentTier === "deep" && (!Array.isArray(sections) || sections.length < 2 || sections.length > 4)) {
        errors.push(`POI ${poiLabel} deep content requires 2-4 detailSections`);
      }
      if (poi.contentTier === "standard" && Array.isArray(sections) && sections.length > 2) {
        errors.push(`POI ${poiLabel} standard content allows at most 2 detailSections`);
      }
      if (poi.contentTier === "compact" && sections != null && (!Array.isArray(sections) || sections.length > 0)) {
        errors.push(`POI ${poiLabel} compact content must omit detailSections`);
      }
      if (sections != null && !Array.isArray(sections)) {
        errors.push(`POI ${poiLabel} detailSections must be an array`);
      }
      if (Array.isArray(sections)) {
        sections.forEach((section, index) => {
          const titleValid = typeof section?.title === "string" && section.title.trim().length > 0;
          if (!titleValid) errors.push(`POI ${poiLabel} detailSections[${index}] missing title`);

          const bodyValid = typeof section?.body === "string" && section.body.trim().length > 0;
          const itemsValid = Array.isArray(section?.items)
            && section.items.length >= 1
            && section.items.length <= 5
            && section.items.every((item) => typeof item === "string" && item.trim().length > 0);
          if (section?.items != null && !itemsValid) {
            errors.push(`POI ${poiLabel} detailSections[${index}] needs body or 1-5 items`);
          } else if (!bodyValid && !itemsValid) {
            errors.push(`POI ${poiLabel} detailSections[${index}] needs body or 1-5 items`);
          }
        });
      }
    }

    const key = [poi.city || "", poi.category || "", poi.name || ""].join(" / ");
    if (identityKeys.has(key)) errors.push(`Duplicate city/category/name: ${key}`);
    identityKeys.set(key, true);

    if (poi.category) categoryCounts.set(poi.category, (categoryCounts.get(poi.category) || 0) + 1);
    if (poi.city) cityCounts.set(poi.city, (cityCounts.get(poi.city) || 0) + 1);
  }

  const selectedItinerary = args.day
    ? itinerary.filter((day) => day.id === args.day)
    : itinerary;
  if (args.day && selectedItinerary.length === 0) errors.push(`Unknown day id: ${args.day}`);

  for (const day of selectedItinerary) {
    const dayLabel = day.id || day.date || day.title || "<unknown day>";
    const anchors = Array.isArray(day.anchors) ? day.anchors : [];
    if (anchors.length > 3) warnings.push(`${dayLabel} has ${anchors.length} anchors; recommended max is 3`);

    const refs = [
      ...anchors,
      ...(Array.isArray(day.candidates) ? day.candidates : []),
      ...(Array.isArray(day.routeStops) ? day.routeStops.map(asPoiId) : []),
    ].filter(Boolean);

    for (const ref of refs) {
      if (!ids.has(ref)) errors.push(`${dayLabel} references missing POI: ${ref}`);
    }

    if (Array.isArray(day.routeStops)) {
      const stopIds = day.routeStops.map(asPoiId).filter(Boolean);
      const duplicateStopIds = stopIds.filter((id, index) => stopIds.indexOf(id) !== index);
      if (duplicateStopIds.length) errors.push(`${dayLabel} repeats route stops: ${[...new Set(duplicateStopIds)].join(", ")}`);

      const orders = day.routeStops
        .map((stop) => (typeof stop === "object" ? stop.order : null))
        .filter((order) => order != null);
      const duplicateOrders = orders.filter((order, index) => orders.indexOf(order) !== index);
      if (duplicateOrders.length) warnings.push(`${dayLabel} has duplicate route stop orders: ${[...new Set(duplicateOrders)].join(", ")}`);

      const segments = Array.isArray(day.transitSegments) ? day.transitSegments : [];
      for (let index = 1; index < stopIds.length; index += 1) {
        const fromPoiId = stopIds[index - 1];
        const toPoiId = stopIds[index];
        const segment = segments.find((item) => item.fromPoiId === fromPoiId && item.toPoiId === toPoiId);
        if (!segment) {
          routeGapMessage(args.strictRoutes, errors, warnings, `${dayLabel} missing adjacent transit segment: ${fromPoiId} -> ${toPoiId}`);
        } else if (!segment.mode || !segment.label) {
          routeGapMessage(args.strictRoutes, errors, warnings, `${dayLabel} incomplete transit segment: ${fromPoiId} -> ${toPoiId}`);
        }
      }

      for (const segment of segments) {
        if (!ids.has(segment.fromPoiId)) errors.push(`${dayLabel} transit segment references missing POI: ${segment.fromPoiId}`);
        if (!ids.has(segment.toPoiId)) errors.push(`${dayLabel} transit segment references missing POI: ${segment.toPoiId}`);
      }
    }

    if (day.routeGeometry != null) {
      if (!Array.isArray(day.routeGeometry) || day.routeGeometry.length < 2) {
        errors.push(`${dayLabel} routeGeometry must contain at least two [lng, lat] points`);
      } else {
        day.routeGeometry.forEach((point, index) => {
          if (!isValidRouteCoord(point)) errors.push(`${dayLabel} routeGeometry point ${index} is invalid`);
        });
      }
      if (!day.routeGeometrySource) warnings.push(`${dayLabel} routeGeometry is missing routeGeometrySource`);
      if (!day.routeGeometryReviewedAt) warnings.push(`${dayLabel} routeGeometry is missing routeGeometryReviewedAt`);
      if (!day.routeGeometryMode) warnings.push(`${dayLabel} routeGeometry is missing routeGeometryMode`);

      if (args.strictRoutes) {
        if (!day.routeReview?.sequenceRationale || !day.routeReview?.routingMethod) {
          errors.push(`${dayLabel} routeGeometry requires routeReview.sequenceRationale and routeReview.routingMethod`);
        }
        if (/示意|直线|straight|approx/i.test(day.routeGeometrySource || "")) {
          errors.push(`${dayLabel} routeGeometrySource describes an illustrative or approximate line, not a verified route`);
        }

        const routePoints = day.routeGeometry
          .filter(isValidRouteCoord)
          .map(([lng, lat]) => [lat, lng]);
        for (const stop of day.routeStops || []) {
          const poi = pois.find((item) => item.id === asPoiId(stop));
          if (!poi || !routePoints.length) continue;
          const nearest = Math.min(...routePoints.map((point) => haversineMeters(poi.coords, point)));
          if (nearest > 150) errors.push(`${dayLabel} routeGeometry misses route stop ${poi.id} by ${Math.round(nearest)}m`);
        }
      }
    } else if (args.strictRoutes && (day.routeStops || []).length > 1) {
      warnings.push(`${dayLabel} has no verified routeGeometry; the map must not draw a formal route line`);
    }
  }

  const summary = {
    poiCount: pois.length,
    dayCount: itinerary.length,
    categories: Object.fromEntries([...categoryCounts.entries()].sort()),
    cities: Object.fromEntries([...cityCounts.entries()].sort()),
    warnings,
    errors,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
