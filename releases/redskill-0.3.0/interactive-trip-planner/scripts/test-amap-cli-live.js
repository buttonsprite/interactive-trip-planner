#!/usr/bin/env node

import { executeAmapRequest } from "./amap-cli-runtime.js";
import { probeAmapCapability } from "./check-amap-cli.js";

if (process.env.RUN_AMAP_LIVE !== "1") {
  console.log("SKIP AMap live test: set RUN_AMAP_LIVE=1 to enable the real provider gate.");
  process.exit(0);
}

function fail(stage, status, missingRequirements = []) {
  process.stderr.write(`${JSON.stringify({
    status: "FAIL",
    stage,
    providerStatus: status,
    missingRequirements,
  })}\n`);
  process.exitCode = 1;
}

function isNormalizedPosition(value) {
  return value
    && Number.isFinite(value.lng)
    && Number.isFinite(value.lat)
    && value.system === "gcj02";
}

function normalizedSearch(result) {
  return result?.status === "ok"
    && result.performed === true
    && result.provider === "amap"
    && result.action === "search-poi"
    && result.pageSize === 3
    && Array.isArray(result.items)
    && result.items.length >= 1
    && result.items.length <= 3
    && result.items.every((item) => (
      typeof item.poiId === "string"
      && item.poiId.length > 0
      && typeof item.name === "string"
      && item.name.length > 0
      && isNormalizedPosition(item.position)
    ));
}

function normalizedRoute(result) {
  return result?.status === "ok"
    && result.performed === true
    && result.provider === "amap"
    && result.action === "route"
    && result.mode === "walking"
    && isNormalizedPosition(result.origin?.position)
    && isNormalizedPosition(result.destination?.position)
    && Number.isFinite(result.distanceMeters)
    && result.distanceMeters > 0
    && Number.isFinite(result.durationSeconds)
    && result.durationSeconds > 0
    && Array.isArray(result.steps)
    && typeof result.reviewedAt === "string"
    && result.reviewedAt.length > 0;
}

function containsCredentialValue(value) {
  const serialized = JSON.stringify(value);
  return [process.env.AMAP_KEY, process.env.AMAP_SECURITY_KEY]
    .filter((secret) => typeof secret === "string" && secret.trim())
    .some((secret) => serialized.includes(secret) || serialized.includes(secret.trim()));
}

try {
  const capability = probeAmapCapability();
  if (capability.status !== "available") {
    const missingRequirements = [
      ...(capability.cliAvailable ? [] : ["amap-gui"]),
      ...capability.missingRequirements,
    ];
    fail("capability", capability.status, [...new Set(missingRequirements)]);
  } else {
    const search = executeAmapRequest({
      action: "search-poi",
      keyword: "大理古城南门",
      city: "大理",
      pageSize: 3,
      pageIndex: 1,
    });
    if (!normalizedSearch(search)) {
      fail("search", search?.status || "invalid-normalized-output");
    } else {
      const route = executeAmapRequest({
        action: "route",
        origin: {
          name: "大理古城南门",
          position: { lng: 100.1651, lat: 25.6889 },
        },
        destination: {
          name: "五华楼",
          position: { lng: 100.164, lat: 25.6956 },
        },
        mode: "walking",
      });
      if (!normalizedRoute(route)) {
        fail("route", route?.status || "invalid-normalized-output");
      } else if (containsCredentialValue({ search, route })) {
        fail("secret-scan", "credential-value-found");
      } else {
        console.log(JSON.stringify({
          status: "PASS",
          capabilityStatus: capability.status,
          searchStatus: search.status,
          searchCount: search.items.length,
          routeStatus: route.status,
          verifiedRouteCount: 1,
        }));
      }
    }
  }
} catch {
  fail("internal", "unexpected-error");
}
