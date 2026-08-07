#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildAmapArgs,
  executeAmapRequest,
  normalizeAmapOutput,
  validateAmapRequest,
} from "./amap-cli-runtime.js";

const secrets = {
  AMAP_KEY: "execution-web-key-secret",
  AMAP_SECURITY_KEY: "execution-security-key-secret",
};
const checkedAt = "2026-08-07T12:00:00.000Z";
const searchRequest = {
  action: "search-poi",
  keyword: "菜市场",
  city: "大理",
  center: { lng: 100.1602, lat: 25.7001 },
  radiusMeters: 1500,
  pageSize: 10,
  pageIndex: 1,
};
const routeRequest = {
  action: "route",
  origin: { name: "大理古城南门", position: { lng: 100.165, lat: 25.689 } },
  destination: { name: "北门市场", position: { lng: 100.1602, lat: 25.7001 } },
  mode: "walking",
};

const searchProviderOutput = {
  success: true,
  data: {
    keyword: "菜市场",
    city: "大理",
    total: 1,
    pageSize: 10,
    pageIndex: 1,
    pois: [{
      id: "B0FFTEST01",
      name: "北门市场",
      type: "购物服务;综合市场",
      address: "云南省大理白族自治州大理市",
      tel: "0872-0000000",
      distance: 680,
      location: [100.1602, 25.7001],
      province: "云南省",
      city: "大理白族自治州",
      district: "大理市",
      photos: [{ url: "https://example.invalid/?secret=provider-photo" }],
      headers: { authorization: "provider-header-secret" },
    }],
    arbitraryProviderField: "provider-raw-secret",
  },
  error: null,
};

const routeProviderOutput = {
  success: true,
  data: {
    type: "walking",
    from: { name: "大理古城南门", position: [100.165, 25.689], rawHtml: "<b>unsafe</b>" },
    to: { name: "北门市场", position: [100.1602, 25.7001] },
    summary: {
      distance: 1420,
      time: 1080,
      tolls: 0,
      steps: [
        { instruction: "从南门出发，沿复兴路向北步行。", distance: 720, time: 540, path: "provider-path-secret" },
        { instruction: "<b>右转</b>前往北门市场。", distance: 700, time: 540 },
      ],
      rawPolyline: "provider-polyline-secret",
    },
  },
  error: null,
};

function assertNoSecrets(value) {
  assert.doesNotMatch(
    typeof value === "string" ? value : JSON.stringify(value),
    /execution-(?:web-key|security-key)-secret|provider-(?:photo|header|raw|path|polyline)-secret/,
  );
}

function fakeSuccessRunner(providerOutput, expectedArgs) {
  return (command, args, options) => {
    assert.equal(command, "amap-gui");
    assert.equal(options.shell, false);
    assert.deepEqual(args, expectedArgs);
    for (const arg of args) {
      assert.doesNotMatch(String(arg), /execution-(?:web-key|security-key)-secret/);
    }
    assert.equal(options.env.AMAP_KEY, secrets.AMAP_KEY);
    assert.equal(options.env.AMAP_SECURITY_KEY, secrets.AMAP_SECURITY_KEY);
    return { status: 0, stdout: JSON.stringify(providerOutput), stderr: "" };
  };
}

const normalizedSearchRequest = validateAmapRequest({
  ...searchRequest,
  keyword: "  菜市场  ",
  city: "  大理  ",
});
assert.equal(normalizedSearchRequest.keyword, "菜市场");
assert.equal(normalizedSearchRequest.city, "大理");
assert.deepEqual(buildAmapArgs(searchRequest), [
  "searchPOI",
  "--keyword", "菜市场",
  "--city", "大理",
  "--center", "100.1602,25.7001",
  "--radius", "1500",
  "--pageSize", "10",
  "--pageIndex", "1",
]);
assert.deepEqual(buildAmapArgs(routeRequest), [
  "route",
  "--from", "100.165,25.689",
  "--from-name", "大理古城南门",
  "--to", "100.1602,25.7001",
  "--to-name", "北门市场",
  "--type", "walking",
]);

const searchResult = executeAmapRequest(searchRequest, {
  env: { ...secrets },
  commandExists: () => true,
  now: () => checkedAt,
  runCommand: fakeSuccessRunner(searchProviderOutput, buildAmapArgs(searchRequest)),
});
assert.deepEqual(searchResult, {
  status: "ok",
  provider: "amap",
  performed: true,
  action: "search-poi",
  keyword: "菜市场",
  city: "大理",
  center: { lng: 100.1602, lat: 25.7001, system: "gcj02" },
  radiusMeters: 1500,
  total: 1,
  pageSize: 10,
  pageIndex: 1,
  items: [{
    poiId: "B0FFTEST01",
    name: "北门市场",
    type: "购物服务;综合市场",
    address: "云南省大理白族自治州大理市",
    phone: "0872-0000000",
    distanceMeters: 680,
    position: { lng: 100.1602, lat: 25.7001, system: "gcj02" },
    province: "云南省",
    city: "大理白族自治州",
    district: "大理市",
  }],
  reviewedAt: checkedAt,
});
assertNoSecrets(searchResult);

const routeResult = executeAmapRequest(routeRequest, {
  env: { ...secrets },
  commandExists: () => true,
  now: () => checkedAt,
  runCommand: fakeSuccessRunner(routeProviderOutput, buildAmapArgs(routeRequest)),
});
assert.deepEqual(routeResult, {
  status: "ok",
  provider: "amap",
  performed: true,
  action: "route",
  origin: {
    name: "大理古城南门",
    position: { lng: 100.165, lat: 25.689, system: "gcj02" },
  },
  destination: {
    name: "北门市场",
    position: { lng: 100.1602, lat: 25.7001, system: "gcj02" },
  },
  waypoints: [],
  mode: "walking",
  distanceMeters: 1420,
  durationSeconds: 1080,
  tollsYuan: 0,
  steps: [
    { instruction: "从南门出发，沿复兴路向北步行。", distanceMeters: 720, durationSeconds: 540 },
    { instruction: "右转前往北门市场。", distanceMeters: 700, durationSeconds: 540 },
  ],
  reviewedAt: checkedAt,
});
assertNoSecrets(routeResult);

const drivingWithWaypoints = {
  ...routeRequest,
  mode: "driving",
  waypoints: [
    { name: "人民路口", position: { lng: 100.162, lat: 25.695 } },
    { name: "洋人街口", position: { lng: 100.163, lat: 25.697 } },
  ],
};
assert.deepEqual(buildAmapArgs(drivingWithWaypoints), [
  "route",
  "--from", "100.165,25.689",
  "--from-name", "大理古城南门",
  "--to", "100.1602,25.7001",
  "--to-name", "北门市场",
  "--type", "driving",
  "--waypoints", "人民路口,洋人街口",
]);
const normalizedDrivingRoute = normalizeAmapOutput(
  drivingWithWaypoints,
  { ...routeProviderOutput, data: { ...routeProviderOutput.data, type: "driving" } },
  checkedAt,
);
assert.deepEqual(normalizedDrivingRoute.waypoints, [
  { name: "人民路口", position: { lng: 100.162, lat: 25.695, system: "gcj02" } },
  { name: "洋人街口", position: { lng: 100.163, lat: 25.697, system: "gcj02" } },
]);

for (const [label, request, message] of [
  ["invalid action", { action: "provider-secret-action" }, "Invalid AMap action."],
  ["blank keyword", { ...searchRequest, keyword: "   " }, "Invalid AMap search request."],
  ["invalid search coordinates", { ...searchRequest, center: { lng: 181, lat: 25 } }, "Invalid AMap search request."],
  ["invalid route coordinates", { ...routeRequest, destination: { ...routeRequest.destination, position: { lng: 100, lat: -91 } } }, "Invalid AMap route request."],
  ["unsupported mode", { ...routeRequest, mode: "flying" }, "Invalid AMap route request."],
  ["walking waypoints", { ...routeRequest, waypoints: [drivingWithWaypoints.waypoints[0]] }, "Invalid AMap route request."],
  ["too many driving waypoints", { ...drivingWithWaypoints, waypoints: Array.from({ length: 17 }, (_, index) => ({ name: `途经点${index}`, position: { lng: 100 + index / 100, lat: 25 } })) }, "Invalid AMap route request."],
]) {
  assert.throws(() => validateAmapRequest(request), (error) => {
    assert.equal(error.message, message, label);
    assert.doesNotMatch(error.message, /provider-secret|flying|181|-91/);
    return true;
  });
}

const fallback = [
  "使用高德公开网页或 URI 入口人工复核地点和移动关系。",
  "使用其他可访问的公开地图搜索，并明确标记未完成 amap-gui 路网复核。",
];
for (const [expectedStatus, commandExists, env] of [
  ["unavailable", false, { ...secrets }],
  ["missing-credentials", true, {}],
]) {
  const downgraded = executeAmapRequest(searchRequest, {
    env,
    commandExists: () => commandExists,
    runCommand: () => assert.fail("provider must not run for a downgraded capability"),
  });
  assert.deepEqual(downgraded, {
    status: expectedStatus,
    provider: "amap",
    performed: false,
    fallback,
  });
  assertNoSecrets(downgraded);
}

for (const [label, processResult] of [
  ["malformed provider JSON", { status: 0, stdout: "{provider-malformed-secret", stderr: "" }],
  ["provider stderr secret", { status: 1, stdout: "", stderr: `failed: ${secrets.AMAP_SECURITY_KEY}` }],
  ["provider-declared failure", { status: 0, stdout: JSON.stringify({ success: false, data: null, error: secrets.AMAP_KEY }), stderr: "" }],
]) {
  const failed = executeAmapRequest(searchRequest, {
    env: { ...secrets },
    commandExists: () => true,
    runCommand: () => processResult,
  });
  assert.equal(failed.status, "provider-error", label);
  assert.equal(failed.provider, "amap");
  assert.equal(failed.performed, false);
  assert.equal(failed.message, "高德地图调用失败，请稍后重试或使用备用复核方式。");
  assert.deepEqual(failed.fallback, fallback);
  assertNoSecrets(failed);
}

assert.throws(
  () => normalizeAmapOutput(searchRequest, "{provider-direct-secret", checkedAt),
  (error) => {
    assert.equal(error.message, "高德地图调用失败，请稍后重试或使用备用复核方式。");
    assert.doesNotMatch(error.message, /provider-direct-secret/);
    return true;
  },
);

console.log("AMap execution safety contract passed");
