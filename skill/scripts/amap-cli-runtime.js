import { spawnSync } from "node:child_process";
import { probeAmapCapability } from "./check-amap-cli.js";

const INVALID_ACTION = "Invalid AMap action.";
const INVALID_SEARCH = "Invalid AMap search request.";
const INVALID_ROUTE = "Invalid AMap route request.";
const PROVIDER_ERROR_MESSAGE = "高德地图调用失败，请稍后重试或使用备用复核方式。";
const ROUTE_MODES = new Set(["driving", "walking", "riding", "transit"]);

function isPlainObject(value) {
  return Boolean(value)
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function trimmedString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isIntegerInRange(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function normalizePosition(value) {
  if (!isPlainObject(value)) return null;
  const { lng, lat } = value;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  return { lng, lat };
}

function normalizeRoutePoint(value, { waypoint = false } = {}) {
  if (!isPlainObject(value)) return null;
  const name = trimmedString(value.name);
  const position = normalizePosition(value.position);
  if (!name || !position || (waypoint && name.includes(","))) return null;
  return { name, position };
}

function validateSearchRequest(context) {
  const keyword = trimmedString(context.keyword);
  if (!keyword) throw new Error(INVALID_SEARCH);

  const request = { action: "search-poi", keyword };
  if (context.city !== undefined) {
    const city = trimmedString(context.city);
    if (!city) throw new Error(INVALID_SEARCH);
    request.city = city;
  }
  if (context.center !== undefined) {
    const center = normalizePosition(context.center);
    if (!center) throw new Error(INVALID_SEARCH);
    request.center = center;
  }
  if (context.radiusMeters !== undefined) {
    if (!isIntegerInRange(context.radiusMeters, 1)) throw new Error(INVALID_SEARCH);
    request.radiusMeters = context.radiusMeters;
  }
  if (context.pageSize !== undefined) {
    if (!isIntegerInRange(context.pageSize, 1)) throw new Error(INVALID_SEARCH);
    request.pageSize = context.pageSize;
  }
  if (context.pageIndex !== undefined) {
    if (!isIntegerInRange(context.pageIndex, 1)) throw new Error(INVALID_SEARCH);
    request.pageIndex = context.pageIndex;
  }
  return request;
}

function validateRouteRequest(context) {
  const origin = normalizeRoutePoint(context.origin);
  const destination = normalizeRoutePoint(context.destination);
  const mode = trimmedString(context.mode);
  if (!origin || !destination || !mode || !ROUTE_MODES.has(mode)) {
    throw new Error(INVALID_ROUTE);
  }

  let waypoints = [];
  if (context.waypoints !== undefined) {
    if (!Array.isArray(context.waypoints) || context.waypoints.length > 16) {
      throw new Error(INVALID_ROUTE);
    }
    waypoints = context.waypoints.map((waypoint) => normalizeRoutePoint(waypoint, { waypoint: true }));
    if (waypoints.some((waypoint) => !waypoint) || (waypoints.length > 0 && mode !== "driving")) {
      throw new Error(INVALID_ROUTE);
    }
  }

  return { action: "route", origin, destination, mode, waypoints };
}

export function validateAmapRequest(context) {
  if (!isPlainObject(context)) throw new Error(INVALID_ACTION);
  const action = trimmedString(context.action);
  if (action === "search-poi") return validateSearchRequest(context);
  if (action === "route") return validateRouteRequest(context);
  throw new Error(INVALID_ACTION);
}

function formatPosition(position) {
  return `${position.lng},${position.lat}`;
}

export function buildAmapArgs(context) {
  const request = validateAmapRequest(context);
  if (request.action === "search-poi") {
    const args = ["searchPOI", "--keyword", request.keyword];
    if (request.city !== undefined) args.push("--city", request.city);
    if (request.center !== undefined) args.push("--center", formatPosition(request.center));
    if (request.radiusMeters !== undefined) args.push("--radius", String(request.radiusMeters));
    if (request.pageSize !== undefined) args.push("--pageSize", String(request.pageSize));
    if (request.pageIndex !== undefined) args.push("--pageIndex", String(request.pageIndex));
    return args;
  }

  const args = [
    "route",
    "--from", formatPosition(request.origin.position),
    "--from-name", request.origin.name,
    "--to", formatPosition(request.destination.position),
    "--to-name", request.destination.name,
    "--type", request.mode,
  ];
  if (request.waypoints.length > 0) {
    args.push("--waypoints", request.waypoints.map((waypoint) => waypoint.name).join(","));
  }
  return args;
}

function providerText(value, maximumLength = 300) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function providerNumber(value, { minimum = 0, integer = false } = {}) {
  if (!Number.isFinite(value) || value < minimum) return null;
  if (integer && !Number.isInteger(value)) return null;
  return value;
}

function providerPosition(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const position = normalizePosition({ lng: value[0], lat: value[1] });
  return position ? { ...position, system: "gcj02" } : null;
}

function requestPosition(value) {
  return { lng: value.lng, lat: value.lat, system: "gcj02" };
}

function parseProviderOutput(providerOutput) {
  let parsed;
  try {
    parsed = typeof providerOutput === "string" ? JSON.parse(providerOutput) : providerOutput;
  } catch {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  if (!isPlainObject(parsed) || parsed.success !== true || !isPlainObject(parsed.data)) {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  return parsed.data;
}

function normalizeSearchOutput(request, data, checkedAt) {
  if (!Array.isArray(data.pois)) throw new Error(PROVIDER_ERROR_MESSAGE);
  const items = data.pois.map((poi) => {
    if (!isPlainObject(poi)) throw new Error(PROVIDER_ERROR_MESSAGE);
    const position = providerPosition(poi.location);
    if (!position) throw new Error(PROVIDER_ERROR_MESSAGE);
    return {
      poiId: providerText(poi.id, 120),
      name: providerText(poi.name),
      type: providerText(poi.type),
      address: providerText(poi.address, 500),
      phone: providerText(poi.tel, 120),
      distanceMeters: providerNumber(poi.distance),
      position,
      province: providerText(poi.province),
      city: providerText(poi.city),
      district: providerText(poi.district),
    };
  });

  return {
    status: "ok",
    provider: "amap",
    performed: true,
    action: "search-poi",
    keyword: request.keyword,
    city: request.city || "",
    center: request.center ? requestPosition(request.center) : null,
    radiusMeters: request.radiusMeters ?? null,
    total: providerNumber(data.total, { integer: true }) ?? items.length,
    pageSize: providerNumber(data.pageSize, { minimum: 1, integer: true }) ?? request.pageSize ?? items.length,
    pageIndex: providerNumber(data.pageIndex, { minimum: 1, integer: true }) ?? request.pageIndex ?? 1,
    items,
    reviewedAt: checkedAt,
  };
}

function normalizeRouteOutput(request, data, checkedAt) {
  if (!isPlainObject(data.from) || !isPlainObject(data.to) || !isPlainObject(data.summary)) {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  const originPosition = providerPosition(data.from.position);
  const destinationPosition = providerPosition(data.to.position);
  const distanceMeters = providerNumber(data.summary.distance);
  const durationSeconds = providerNumber(data.summary.time);
  if (!originPosition || !destinationPosition || distanceMeters === null || durationSeconds === null) {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  if (!Array.isArray(data.summary.steps)) throw new Error(PROVIDER_ERROR_MESSAGE);

  const steps = data.summary.steps.map((step) => {
    if (!isPlainObject(step)) throw new Error(PROVIDER_ERROR_MESSAGE);
    const instruction = providerText(step.instruction, 500);
    const stepDistance = providerNumber(step.distance);
    const stepDuration = providerNumber(step.time);
    if (!instruction || stepDistance === null || stepDuration === null) {
      throw new Error(PROVIDER_ERROR_MESSAGE);
    }
    return {
      instruction,
      distanceMeters: stepDistance,
      durationSeconds: stepDuration,
    };
  });

  return {
    status: "ok",
    provider: "amap",
    performed: true,
    action: "route",
    origin: {
      name: providerText(data.from.name) || request.origin.name,
      position: originPosition,
    },
    destination: {
      name: providerText(data.to.name) || request.destination.name,
      position: destinationPosition,
    },
    waypoints: request.waypoints.map((waypoint) => ({
      name: waypoint.name,
      position: requestPosition(waypoint.position),
    })),
    mode: request.mode,
    distanceMeters,
    durationSeconds,
    tollsYuan: providerNumber(data.summary.tolls) ?? 0,
    steps,
    reviewedAt: checkedAt,
  };
}

export function normalizeAmapOutput(context, providerOutput, checkedAt) {
  const request = validateAmapRequest(context);
  const data = parseProviderOutput(providerOutput);
  if (request.action === "search-poi") return normalizeSearchOutput(request, data, checkedAt);
  return normalizeRouteOutput(request, data, checkedAt);
}

function defaultRunCommand(command, args, options) {
  return spawnSync(command, args, options);
}

function providerError(fallback) {
  return {
    status: "provider-error",
    provider: "amap",
    performed: false,
    message: PROVIDER_ERROR_MESSAGE,
    fallback,
  };
}

function reviewedAt(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(PROVIDER_ERROR_MESSAGE);
  return date.toISOString();
}

export function executeAmapRequest(context, {
  runCommand = defaultRunCommand,
  env = process.env,
  now = () => new Date(),
  commandExists,
} = {}) {
  const request = validateAmapRequest(context);
  const capability = probeAmapCapability({ env, commandExists });
  if (capability.status !== "available") {
    return {
      status: capability.status,
      provider: "amap",
      performed: false,
      fallback: capability.fallback,
    };
  }

  try {
    const processResult = runCommand("amap-gui", buildAmapArgs(request), {
      encoding: "utf8",
      env,
      shell: false,
    });
    if (!processResult || processResult.status !== 0 || processResult.error) {
      return providerError(capability.fallback);
    }
    return normalizeAmapOutput(request, processResult.stdout, reviewedAt(now));
  } catch {
    return providerError(capability.fallback);
  }
}
