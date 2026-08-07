import { spawnSync } from "node:child_process";
import { probeAmapCapability } from "./check-amap-cli.js";

const INVALID_ACTION = "Invalid AMap action.";
const INVALID_SEARCH = "Invalid AMap search request.";
const INVALID_ROUTE = "Invalid AMap route request.";
const PROVIDER_ERROR_MESSAGE = "高德地图调用失败，请稍后重试或使用备用复核方式。 AMap request failed. Retry later or use a fallback verification method.";
const AMAP_COMMAND_TIMEOUT_MS = 35_000;
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

function normalizeRoutePoint(value) {
  if (!isPlainObject(value)) return null;
  const name = trimmedString(value.name);
  const position = normalizePosition(value.position);
  if (!name || !position) return null;
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
    waypoints = context.waypoints.map((waypoint) => normalizeRoutePoint(waypoint));
    if (waypoints.some((waypoint) => !waypoint) || (waypoints.length > 0 && mode !== "driving")) {
      throw new Error(INVALID_ROUTE);
    }
  }

  let city;
  if (context.city !== undefined) {
    city = trimmedString(context.city);
    if (!city) throw new Error(INVALID_ROUTE);
  }
  if (mode === "transit" && !city) throw new Error(INVALID_ROUTE);

  return { action: "route", origin, destination, mode, waypoints, ...(city ? { city } : {}) };
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

  if (request.waypoints.length > 0) {
    const payload = {
      from: {
        name: request.origin.name,
        position: [request.origin.position.lng, request.origin.position.lat],
      },
      to: {
        name: request.destination.name,
        position: [request.destination.position.lng, request.destination.position.lat],
      },
      type: request.mode,
      waypoints: request.waypoints.map((waypoint) => ({
        position: [waypoint.position.lng, waypoint.position.lat],
      })),
    };
    if (request.city !== undefined) payload.city = request.city;
    return ["route", "--json", JSON.stringify(payload)];
  }

  const args = [
    "route",
    "--from", formatPosition(request.origin.position),
    "--from-name", request.origin.name,
    "--to", formatPosition(request.destination.position),
    "--to-name", request.destination.name,
    "--type", request.mode,
  ];
  if (request.city !== undefined) args.push("--city", request.city);
  return args;
}

function containsMarkup(value) {
  return /[<>]|&(?:lt|gt|#0*60|#0*62|#x0*3c|#x0*3e);?/i.test(value);
}

function providerText(value, maximumLength = 300) {
  if (typeof value !== "string") return "";
  if (containsMarkup(value)) return "";
  return value
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

function providerRoutePointMatches(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftPosition = providerPosition(left.position);
  const rightPosition = providerPosition(right.position);
  return Boolean(leftPosition && rightPosition)
    && leftPosition.lng === rightPosition.lng
    && leftPosition.lat === rightPosition.lat
    && providerText(left.name) === providerText(right.name);
}

function providerPositionMatchesRequest(providerValue, requestValue) {
  const position = providerPosition(providerValue);
  return position
    && position.lng === requestValue.lng
    && position.lat === requestValue.lat
    ? position
    : null;
}

function normalizeRouteWaypoints(stateWaypoints, requestWaypoints) {
  if (requestWaypoints.length === 0) {
    if (stateWaypoints === undefined) return [];
    if (Array.isArray(stateWaypoints) && stateWaypoints.length === 0) return [];
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  if (!Array.isArray(stateWaypoints) || stateWaypoints.length !== requestWaypoints.length) {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  return stateWaypoints.map((stateWaypoint, index) => {
    if (!isPlainObject(stateWaypoint)) throw new Error(PROVIDER_ERROR_MESSAGE);
    const requestWaypoint = requestWaypoints[index];
    const position = providerPositionMatchesRequest(stateWaypoint.position, requestWaypoint.position);
    if (!position) throw new Error(PROVIDER_ERROR_MESSAGE);
    return {
      name: providerText(stateWaypoint.name) || requestWaypoint.name,
      position,
    };
  });
}

function credentialValues(env) {
  const values = [];
  for (const name of ["AMAP_KEY", "AMAP_SECURITY_KEY"]) {
    if (typeof env?.[name] !== "string" || !env[name].trim()) continue;
    values.push(env[name]);
    if (env[name].trim() !== env[name]) values.push(env[name].trim());
  }
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

function redactString(value, redactions) {
  return redactions.reduce(
    (redacted, secret) => redacted.split(secret).join("[REDACTED]"),
    value,
  );
}

function redactReturnedStrings(value, redactions) {
  if (typeof value === "string") return redactString(value, redactions);
  if (Array.isArray(value)) return value.map((item) => redactReturnedStrings(item, redactions));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactReturnedStrings(item, redactions)]),
  );
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
    const poiId = providerText(poi.id, 120);
    const name = providerText(poi.name);
    if (!poiId || !name) throw new Error(PROVIDER_ERROR_MESSAGE);
    return {
      poiId,
      name,
      type: providerText(poi.type),
      address: providerText(poi.address, 500),
      phone: providerText(poi.tel, 120),
      distanceMeters: providerNumber(poi.distance),
      position,
      province: providerText(poi.pname),
      city: providerText(poi.cityname),
      district: providerText(poi.adname),
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
  const state = data.state;
  if (!isPlainObject(state) || !isPlainObject(state.from) || !isPlainObject(state.to) || !isPlainObject(data.summary)) {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  if (state.type !== request.mode) throw new Error(PROVIDER_ERROR_MESSAGE);
  if (data.type !== undefined && data.type !== state.type) throw new Error(PROVIDER_ERROR_MESSAGE);
  if (data.from !== undefined && !providerRoutePointMatches(data.from, state.from)) {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  if (data.to !== undefined && !providerRoutePointMatches(data.to, state.to)) {
    throw new Error(PROVIDER_ERROR_MESSAGE);
  }
  const originPosition = providerPositionMatchesRequest(state.from.position, request.origin.position);
  const destinationPosition = providerPositionMatchesRequest(state.to.position, request.destination.position);
  const waypoints = normalizeRouteWaypoints(state.waypoints, request.waypoints);
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
      name: providerText(state.from.name) || request.origin.name,
      position: originPosition,
    },
    destination: {
      name: providerText(state.to.name) || request.destination.name,
      position: destinationPosition,
    },
    waypoints,
    mode: request.mode,
    distanceMeters,
    durationSeconds,
    tollsYuan: providerNumber(data.summary.tolls) ?? 0,
    steps,
    reviewedAt: checkedAt,
  };
}

export function normalizeAmapOutput(context, providerOutput, checkedAt, { env = process.env } = {}) {
  const request = validateAmapRequest(context);
  const data = parseProviderOutput(providerOutput);
  const result = request.action === "search-poi"
    ? normalizeSearchOutput(request, data, checkedAt)
    : normalizeRouteOutput(request, data, checkedAt);
  return redactReturnedStrings(result, credentialValues(env));
}

function defaultRunCommand(command, args, options) {
  return spawnSync(command, args, options);
}

function providerError(fallback, env) {
  return redactReturnedStrings({
    status: "provider-error",
    provider: "amap",
    performed: false,
    message: PROVIDER_ERROR_MESSAGE,
    fallback,
  }, credentialValues(env));
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
    return redactReturnedStrings({
      status: capability.status,
      provider: "amap",
      performed: false,
      fallback: capability.fallback,
    }, credentialValues(env));
  }

  try {
    const redactions = credentialValues(env);
    const commandRequest = redactReturnedStrings(request, redactions);
    const args = buildAmapArgs(commandRequest).map((arg) => redactString(arg, redactions));
    const processResult = runCommand("amap-gui", args, {
      encoding: "utf8",
      env,
      shell: false,
      timeout: AMAP_COMMAND_TIMEOUT_MS,
    });
    if (!processResult || processResult.status !== 0 || processResult.error) {
      return providerError(capability.fallback, env);
    }
    return normalizeAmapOutput(request, processResult.stdout, reviewedAt(now), { env });
  } catch {
    return providerError(capability.fallback, env);
  }
}
