#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "assets", "guide-template-europe-public");
const sourcePois = JSON.parse(fs.readFileSync(path.join(root, "data", "pois.json"), "utf8"));
const sourceItinerary = JSON.parse(fs.readFileSync(path.join(root, "data", "itinerary.json"), "utf8"));
const sourceEvents = JSON.parse(fs.readFileSync(path.join(root, "data", "events.json"), "utf8"));
const travelerEvents = sourceEvents.map(({ sourceIds: _sourceIds, ...event }) => event);

const INLINE_SCRIPT_ESCAPES = {
  "<": "\\u003C",
  ">": "\\u003E",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function serializeForInlineScript(value, spacing = 0) {
  return JSON.stringify(value, null, spacing).replace(/[<>&\u2028\u2029]/g, (character) => INLINE_SCRIPT_ESCAPES[character]);
}

if (!Array.isArray(sourcePois) || !Array.isArray(sourceEvents) || !Array.isArray(sourceItinerary.days) || !Array.isArray(sourceItinerary.defaultAssignments)) {
  throw new Error("public sample data must use the europe-autumn-2026-sample schema");
}

const categoryLabels = {
  hotel: "住宿片区",
  top50: "Top50 酒吧",
  wine: "葡萄酒",
  sweet: "甜点",
  coffee: "咖啡",
  food: "餐厅",
  art: "艺术",
  "local-life": "本地生活",
  sight: "著名景区",
  event: "同期活动",
};

const cityLabels = {
  Paris: "巴黎",
  Nice: "尼斯",
  Barcelona: "巴塞罗那",
  Sevilla: "塞维利亚",
  Transit: "跨城移动",
};

const selectedHotelByCity = {
  Paris: "Paris hotel base - Saint-Germain-des-Prés",
  Nice: "Nice hotel base - Carré d'Or / Jean Médecin",
  Barcelona: "Barcelona hotel base - Eixample / Passeig de Gràcia",
  Sevilla: "Sevilla hotel base - Arenal / Centro",
};

const mustNames = new Set([
  "Art Basel Paris at Grand Palais",
  "Salon du Chocolat Paris 2026",
  "La Castanyada activity core",
  "All Saints in Barcelona / Montjuïc",
]);

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const assignmentNames = new Set(sourceItinerary.defaultAssignments.map((rule) => rule.name));
const pois = sourcePois.map((poi) => ({
  id: slugify(`${poi.city}-${poi.name}`),
  name: poi.name,
  name_zh: poi.zh || poi.name,
  city: poi.city,
  area: poi.area,
  category: poi.category,
  priority: mustNames.has(poi.name) ? "must" : assignmentNames.has(poi.name) || poi.category === "hotel" ? "preferred" : "nearby",
  recurring: selectedHotelByCity[poi.city] === poi.name,
  coords: poi.coords,
  note: poi.note,
  contentTier: poi.contentTier,
  whyWorthIt: poi.whyWorthIt,
  detailSections: poi.detailSections,
  plan: poi.plan,
  tip: poi.tip,
  source: poi.source,
  mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  experienceUrl: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(`${poi.zh || poi.name} ${cityLabels[poi.city] || poi.city}`)}`,
  imageQuery: `${poi.name} ${poi.city}`,
}));

function groupBy(values, getKey) {
  const grouped = new Map();
  for (const value of values) {
    const key = getKey(value);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

function isoDate(shortDate) {
  const [month, day] = shortDate.split("/").map(Number);
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const poiByName = new Map(pois.map((poi) => [poi.name, poi]));
const poisByName = groupBy(pois, (poi) => poi.name);
const poisById = groupBy(pois, (poi) => poi.id);
const eventsByName = groupBy(sourceEvents, (event) => event.name);
const eventsById = groupBy(sourceEvents, (event) => event.id);
const dayById = new Map(sourceItinerary.days.map((day) => [day.id, day]));

function eventAssignmentPoi(event, day) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(event.id || "")) {
    throw new Error(`invalid public sample event assignment id: ${event.id || "<missing>"}`);
  }
  if (event.status !== "confirmed" || event.scope !== "venue") {
    throw new Error(`public sample event assignment must be confirmed + venue: ${event.name}`);
  }
  const dayDate = isoDate(day.short);
  const startsOn = String(event.startsAt || "").slice(0, 10);
  const endsOn = String(event.endsAt || "").slice(0, 10);
  const dayCity = String(day.city || "").trim().toLocaleLowerCase("en-US");
  const eventCities = [event.city, ...(Array.isArray(event.affectedCities) ? event.affectedCities : [])]
    .filter((city) => typeof city === "string")
    .map((city) => city.trim().toLocaleLowerCase("en-US"));
  if (day.city === "Transit" || !eventCities.includes(dayCity) || dayDate < startsOn || dayDate > endsOn) {
    throw new Error(`public sample event assignment is outside its eligible day: ${event.name} -> ${day.id}`);
  }
  const venue = poisById.get(event.venuePoiId)?.[0];
  const coords = Array.isArray(event.coords) ? event.coords : venue?.coords;
  if (!Array.isArray(coords) || coords.length !== 2) {
    throw new Error(`public sample event assignment has no usable location: ${event.name}`);
  }
  return {
    id: `event:${event.id}`,
    name: event.name,
    name_zh: event.name_zh || event.name,
    city: event.city,
    area: event.area || venue?.area || event.city,
    category: "event",
    priority: "preferred",
    coords,
  };
}

function resolveAssignmentItem(rule, day) {
  let poiMatches = [];
  let eventMatches = [];
  if (typeof rule.poiId === "string" && rule.poiId.startsWith("event:")) {
    eventMatches = eventsById.get(rule.poiId.slice("event:".length)) || [];
  } else if (typeof rule.poiId === "string") {
    poiMatches = poisById.get(rule.poiId) || [];
  } else if (typeof rule.name === "string") {
    poiMatches = poisByName.get(rule.name) || [];
    eventMatches = eventsByName.get(rule.name) || [];
  }
  const matchCount = poiMatches.length + eventMatches.length;
  const label = rule.name || rule.poiId || "<missing>";
  if (matchCount > 1) throw new Error(`ambiguous public sample assignment name: ${label} (${matchCount} matches)`);
  if (matchCount === 0) throw new Error(`invalid public sample assignment: ${label} -> ${rule.dayId}`);
  return eventMatches.length ? eventAssignmentPoi(eventMatches[0], day) : poiMatches[0];
}

const assignmentsByDay = new Map(sourceItinerary.days.map((day) => [day.id, []]));
for (const rule of sourceItinerary.defaultAssignments) {
  const day = dayById.get(rule.dayId);
  if (!day) throw new Error(`invalid public sample assignment day: ${rule.dayId || "<missing>"}`);
  const poi = resolveAssignmentItem(rule, day);
  assignmentsByDay.get(rule.dayId).push({ poi, order: Number(rule.order) });
}

function distanceSquared(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lat = a[0] - b[0];
  const lng = a[1] - b[1];
  return lat * lat + lng * lng;
}

const assignedIds = new Set(
  [...assignmentsByDay.values()].flatMap((entries) => entries.map((entry) => entry.poi.id)),
);

const days = sourceItinerary.days.map((day) => {
  const assigned = [...(assignmentsByDay.get(day.id) || [])].sort((a, b) => a.order - b.order);
  const hotelName = selectedHotelByCity[day.city];
  const hotel = hotelName ? poiByName.get(hotelName) : null;
  if (hotel && !assigned.some((entry) => entry.poi.id === hotel.id)) {
    assigned.unshift({ poi: hotel, order: 0 });
  }

  const routeStops = assigned.map((entry, index) => ({
    poiId: entry.poi.id,
    order: entry.poi.category === "hotel" ? 0 : index + (assigned[0]?.poi.category === "hotel" ? 0 : 1),
    time: day.events?.[Math.min(index, Math.max(0, day.events.length - 1))]?.time || "按当天节奏",
    role: categoryLabels[entry.poi.category] || "当天地点",
  }));

  const nonHotelStops = assigned.filter((entry) => entry.poi.category !== "hotel");
  const routeAreas = new Set(nonHotelStops.map((entry) => entry.poi.area));
  const routeCenter = nonHotelStops.at(-1)?.poi.coords || hotel?.coords;
  const candidates = pois
    .filter((poi) => poi.city === day.city && poi.category !== "hotel" && !assignedIds.has(poi.id))
    .sort((a, b) => {
      const areaDifference = Number(routeAreas.has(b.area)) - Number(routeAreas.has(a.area));
      return areaDifference || distanceSquared(a.coords, routeCenter) - distanceSquared(b.coords, routeCenter);
    })
    .slice(0, 8)
    .map((poi) => poi.id);

  return {
    id: day.id,
    date: isoDate(day.short),
    title: day.title,
    city: day.city,
    summary: day.summary,
    capacity: Math.max(6, nonHotelStops.length + 2),
    anchors: nonHotelStops.slice(0, 3).map((entry) => entry.poi.id),
    routeStops,
    candidates,
  };
});

const trip = {
  slug: "europe-autumn-2026-sample",
  dataRevision: "2026-07-21-canonical-v1",
  title: "2026 欧洲秋日节庆 18 天公开样例",
  eyebrow: "公开旅行地图母版 · 秋季节庆与城市生活",
  summary: "从巴黎秋季艺术周到蔚蓝海岸、巴塞罗那 Castanyada，再进入安达卢西亚的 flamenco 与雪莉酒；所有住宿与交通仅保留公开规划级信息。",
  map: { center: [44.2, 3.2], zoom: 5 },
  cities: cityLabels,
  categories: categoryLabels,
  priorities: {
    must: "必须去",
    preferred: "优先去",
    nearby: "顺路可去",
    archive: "暂不安排",
    pending: "待复核",
    booked: "已预约",
  },
  pois,
  days,
  events: travelerEvents,
};

const output = `// Generated from the public europe-autumn-2026-sample data.\nwindow.TRIP_DATA = ${JSON.stringify(trip, null, 2)};\n`;
fs.writeFileSync(path.join(root, "maps", "assets", "trip-data.js"), output);

const directTrip = {
  trip: sourceItinerary.trip,
  stops: sourceItinerary.stops,
  localStops: sourceItinerary.localStops,
  itineraryDays: sourceItinerary.days,
  transitSegmentsByDay: sourceItinerary.transitSegmentsByDay,
  pois: sourcePois,
  defaultAssignments: sourceItinerary.defaultAssignments,
  events: travelerEvents,
};
const htmlPath = path.join(root, "maps", "itinerary-map.html");
const html = fs.readFileSync(htmlPath, "utf8");
const dataStart = html.indexOf("const PUBLIC_TRIP_DATA = ");
const aliasStart = html.indexOf("    const stops = PUBLIC_TRIP_DATA.stops;", dataStart);
if (dataStart < 0 || aliasStart < 0) throw new Error("canonical HTML is missing the PUBLIC_TRIP_DATA boundary");
const nextHtml = `${html.slice(0, dataStart)}const PUBLIC_TRIP_DATA = ${serializeForInlineScript(directTrip, 2)};\n\n${html.slice(aliasStart)}`;
fs.writeFileSync(htmlPath, nextHtml);

console.log(`built Europe direct-copy public sample: ${sourcePois.length} places, ${sourceItinerary.days.length} days, ${sourceEvents.length} events`);
