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
const providerErrorMessage = "高德地图调用失败，请稍后重试或使用备用复核方式。 AMap request failed. Retry later or use a fallback verification method.";
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
    state: {
      keyword: "菜市场",
      pageSize: 10,
      pageIndex: 1,
      extensions: "all",
      resultCount: 1,
      city: "大理",
    },
    total: 1,
    pageSize: 10,
    pageIndex: 1,
    pois: [{
      id: "B0FFTEST01",
      name: `${secrets.AMAP_KEY} 北门市场`,
      type: "购物服务;综合市场",
      address: "云南省大理白族自治州大理市",
      tel: "0872-0000000",
      distance: 680,
      location: [100.1602, 25.7001],
      pname: "云南省",
      cityname: "大理白族自治州",
      adname: "大理市",
      province: "错误旧省份",
      city: "错误旧城市",
      district: "错误旧区域",
      photo: "https://example.invalid/?secret=provider-photo",
      headers: { authorization: "provider-header-secret" },
    }],
    arbitraryProviderField: "provider-raw-secret",
  },
  error: null,
};

const routeProviderOutput = {
  success: true,
  data: {
    state: {
      from: { name: "大理古城南门", position: [100.165, 25.689], rawHtml: "<b>unsafe</b>" },
      to: { name: "北门市场", position: [100.1602, 25.7001] },
      waypoints: [],
      type: "walking",
    },
    summary: {
      distance: 1420,
      time: 1080,
      tolls: 0,
      steps: [
        { instruction: `从南门出发，${secrets.AMAP_SECURITY_KEY}，沿复兴路向北步行。`, road: "复兴路", distance: 720, time: 540, action: "直行", path: "provider-path-secret" },
        { instruction: "右转前往北门市场。", road: "人民路", distance: 700, time: 540, action: "右转" },
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
    assert.equal(options.timeout, 35_000);
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
    name: "[REDACTED] 北门市场",
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
    { instruction: "从南门出发，[REDACTED]，沿复兴路向北步行。", distanceMeters: 720, durationSeconds: 540 },
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
const drivingProviderState = {
  ...routeProviderOutput.data.state,
  type: "driving",
  waypoints: drivingWithWaypoints.waypoints.map((waypoint) => ({
    position: [waypoint.position.lng, waypoint.position.lat],
  })),
};
const waypointArgs = buildAmapArgs(drivingWithWaypoints);
assert.deepEqual(waypointArgs.slice(0, 2), ["route", "--json"]);
assert.equal(waypointArgs.length, 3);
assert.deepEqual(JSON.parse(waypointArgs[2]), {
  from: { name: "大理古城南门", position: [100.165, 25.689] },
  to: { name: "北门市场", position: [100.1602, 25.7001] },
  type: "driving",
  waypoints: [
    { position: [100.162, 25.695] },
    { position: [100.163, 25.697] },
  ],
});
const normalizedDrivingRoute = normalizeAmapOutput(
  drivingWithWaypoints,
  {
    ...routeProviderOutput,
    data: {
      ...routeProviderOutput.data,
      state: drivingProviderState,
    },
  },
  checkedAt,
  { env: secrets },
);
assert.deepEqual(normalizedDrivingRoute.waypoints, [
  { name: "人民路口", position: { lng: 100.162, lat: 25.695, system: "gcj02" } },
  { name: "洋人街口", position: { lng: 100.163, lat: 25.697, system: "gcj02" } },
]);
assertNoSecrets(normalizedDrivingRoute);

const providerNamedDrivingRoute = normalizeAmapOutput(
  drivingWithWaypoints,
  {
    ...routeProviderOutput,
    data: {
      ...routeProviderOutput.data,
      state: {
        ...drivingProviderState,
        waypoints: [
          { ...drivingProviderState.waypoints[0], name: "高德人民路口" },
          drivingProviderState.waypoints[1],
        ],
      },
    },
  },
  checkedAt,
  { env: secrets },
);
assert.deepEqual(providerNamedDrivingRoute.waypoints, [
  { name: "高德人民路口", position: { lng: 100.162, lat: 25.695, system: "gcj02" } },
  { name: "洋人街口", position: { lng: 100.163, lat: 25.697, system: "gcj02" } },
]);
assertNoSecrets(providerNamedDrivingRoute);

const secretNamedDrivingRoute = {
  ...drivingWithWaypoints,
  origin: {
    ...drivingWithWaypoints.origin,
    name: `${secrets.AMAP_KEY} 大理古城南门`,
  },
  destination: {
    ...drivingWithWaypoints.destination,
    name: `${secrets.AMAP_SECURITY_KEY} 北门市场`,
  },
  waypoints: drivingWithWaypoints.waypoints.map((waypoint, index) => ({
    ...waypoint,
    name: `${index === 0 ? secrets.AMAP_KEY : secrets.AMAP_SECURITY_KEY} ${waypoint.name}`,
  })),
};
const secretNamedRouteResult = executeAmapRequest(secretNamedDrivingRoute, {
  env: { ...secrets },
  commandExists: () => true,
  now: () => checkedAt,
  runCommand: (command, args, options) => {
    assert.equal(command, "amap-gui");
    assert.equal(options.shell, false);
    assert.equal(options.timeout, 35_000);
    assert.deepEqual(args.slice(0, 2), ["route", "--json"]);
    for (const arg of args) assertNoSecrets(arg);
    assert.deepEqual(JSON.parse(args[2]), {
      from: { name: "[REDACTED] 大理古城南门", position: [100.165, 25.689] },
      to: { name: "[REDACTED] 北门市场", position: [100.1602, 25.7001] },
      type: "driving",
      waypoints: [
        { position: [100.162, 25.695] },
        { position: [100.163, 25.697] },
      ],
    });
    return {
      status: 0,
      stdout: JSON.stringify({
        ...routeProviderOutput,
        data: {
          ...routeProviderOutput.data,
          state: {
            ...drivingProviderState,
            from: { ...drivingProviderState.from, name: secretNamedDrivingRoute.origin.name },
            to: { ...drivingProviderState.to, name: secretNamedDrivingRoute.destination.name },
          },
        },
      }),
      stderr: "",
    };
  },
});
assert.equal(secretNamedRouteResult.status, "ok");
assert.equal(secretNamedRouteResult.origin.name, "[REDACTED] 大理古城南门");
assert.equal(secretNamedRouteResult.destination.name, "[REDACTED] 北门市场");
assert.deepEqual(secretNamedRouteResult.waypoints, [
  { name: "[REDACTED] 人民路口", position: { lng: 100.162, lat: 25.695, system: "gcj02" } },
  { name: "[REDACTED] 洋人街口", position: { lng: 100.163, lat: 25.697, system: "gcj02" } },
]);
assertNoSecrets(secretNamedRouteResult);

const escapedCredentials = {
  AMAP_KEY: "json\"web-secret",
  AMAP_SECURITY_KEY: "json\\security-secret",
};
const escapedSecretRequest = {
  ...drivingWithWaypoints,
  origin: { ...drivingWithWaypoints.origin, name: `${escapedCredentials.AMAP_KEY} 南门` },
  destination: { ...drivingWithWaypoints.destination, name: `${escapedCredentials.AMAP_SECURITY_KEY} 北门` },
};
const escapedSecretResult = executeAmapRequest(escapedSecretRequest, {
  env: escapedCredentials,
  commandExists: () => true,
  now: () => checkedAt,
  runCommand: (_command, args) => {
    const payload = JSON.parse(args[2]);
    assert.equal(payload.from.name, "[REDACTED] 南门");
    assert.equal(payload.to.name, "[REDACTED] 北门");
    return {
      status: 0,
      stdout: JSON.stringify({
        ...routeProviderOutput,
        data: {
          ...routeProviderOutput.data,
          state: drivingProviderState,
        },
      }),
      stderr: "",
    };
  },
});
assert.equal(escapedSecretResult.status, "ok");

const transitRoute = {
  ...routeRequest,
  mode: "transit",
  city: "  大理  ",
};
assert.equal(validateAmapRequest(transitRoute).city, "大理");
assert.deepEqual(buildAmapArgs(transitRoute), [
  "route",
  "--from", "100.165,25.689",
  "--from-name", "大理古城南门",
  "--to", "100.1602,25.7001",
  "--to-name", "北门市场",
  "--type", "transit",
  "--city", "大理",
]);

for (const [label, request, message] of [
  ["invalid action", { action: "provider-secret-action" }, "Invalid AMap action."],
  ["blank keyword", { ...searchRequest, keyword: "   " }, "Invalid AMap search request."],
  ["invalid search coordinates", { ...searchRequest, center: { lng: 181, lat: 25 } }, "Invalid AMap search request."],
  ["invalid route coordinates", { ...routeRequest, destination: { ...routeRequest.destination, position: { lng: 100, lat: -91 } } }, "Invalid AMap route request."],
  ["unsupported mode", { ...routeRequest, mode: "flying" }, "Invalid AMap route request."],
  ["walking waypoints", { ...routeRequest, waypoints: [drivingWithWaypoints.waypoints[0]] }, "Invalid AMap route request."],
  ["too many driving waypoints", { ...drivingWithWaypoints, waypoints: Array.from({ length: 17 }, (_, index) => ({ name: `途经点${index}`, position: { lng: 100 + index / 100, lat: 25 } })) }, "Invalid AMap route request."],
  ["missing transit city", { ...routeRequest, mode: "transit" }, "Invalid AMap route request."],
  ["blank transit city", { ...routeRequest, mode: "transit", city: "   " }, "Invalid AMap route request."],
]) {
  assert.throws(() => validateAmapRequest(request), (error) => {
    assert.equal(error.message, message, label);
    assert.doesNotMatch(error.message, /provider-secret|flying|181|-91/);
    return true;
  });
}

const fallback = [
  "使用高德公开网页或 URI 入口人工复核地点和移动关系。 Manually verify places and travel relationships with the public AMap website or URI.",
  "使用其他可访问的公开地图搜索，并明确标记未完成 amap-gui 路网复核。 Use another accessible public map and clearly mark that amap-gui route verification was not completed.",
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
  ["provider timeout", { status: null, stdout: "", stderr: "", error: { code: "ETIMEDOUT", message: secrets.AMAP_KEY } }],
]) {
  const failed = executeAmapRequest(searchRequest, {
    env: { ...secrets },
    commandExists: () => true,
    runCommand: () => processResult,
  });
  assert.equal(failed.status, "provider-error", label);
  assert.equal(failed.provider, "amap");
  assert.equal(failed.performed, false);
  assert.equal(failed.message, providerErrorMessage);
  assert.deepEqual(failed.fallback, fallback);
  assertNoSecrets(failed);
}

assert.throws(
  () => normalizeAmapOutput(searchRequest, "{provider-direct-secret", checkedAt),
  (error) => {
    assert.equal(error.message, providerErrorMessage);
    assert.doesNotMatch(error.message, /provider-direct-secret/);
    return true;
  },
);

for (const [label, malformedPoi] of [
  ["missing POI id", { ...searchProviderOutput.data.pois[0], id: "" }],
  ["missing POI name", { ...searchProviderOutput.data.pois[0], name: "   " }],
]) {
  const malformedIdentity = executeAmapRequest(searchRequest, {
    env: { ...secrets },
    commandExists: () => true,
    runCommand: () => ({
      status: 0,
      stdout: JSON.stringify({
        ...searchProviderOutput,
        data: { ...searchProviderOutput.data, pois: [malformedPoi] },
      }),
      stderr: "",
    }),
  });
  assert.equal(malformedIdentity.status, "provider-error", label);
  assertNoSecrets(malformedIdentity);
}

const mismatchedRoute = executeAmapRequest(routeRequest, {
  env: { ...secrets },
  commandExists: () => true,
  runCommand: () => ({
    status: 0,
    stdout: JSON.stringify({
      ...routeProviderOutput,
      data: {
        ...routeProviderOutput.data,
        state: { ...routeProviderOutput.data.state, type: "driving" },
      },
    }),
    stderr: "",
  }),
});
assert.equal(mismatchedRoute.status, "provider-error");
assert.equal(mismatchedRoute.message, providerErrorMessage);
assertNoSecrets(mismatchedRoute);

for (const [label, stateOverride] of [
  ["origin", { from: { name: "上海外滩", position: [121.490317, 31.241701] } }],
  ["destination", { to: { name: "上海虹桥站", position: [121.326997, 31.200547] } }],
]) {
  const mismatchedEndpoint = executeAmapRequest(routeRequest, {
    env: { ...secrets },
    commandExists: () => true,
    runCommand: () => ({
      status: 0,
      stdout: JSON.stringify({
        ...routeProviderOutput,
        data: {
          ...routeProviderOutput.data,
          state: {
            ...routeProviderOutput.data.state,
            ...stateOverride,
          },
        },
      }),
      stderr: "",
    }),
  });
  assert.equal(mismatchedEndpoint.status, "provider-error", label);
  assert.equal(mismatchedEndpoint.message, providerErrorMessage, label);
  assertNoSecrets(mismatchedEndpoint);
}

const missingProviderWaypoints = executeAmapRequest(drivingWithWaypoints, {
  env: { ...secrets },
  commandExists: () => true,
  runCommand: () => ({
    status: 0,
    stdout: JSON.stringify({
      ...routeProviderOutput,
      data: {
        ...routeProviderOutput.data,
        state: {
          ...drivingProviderState,
          waypoints: [],
        },
      },
    }),
    stderr: "",
  }),
});
assert.equal(missingProviderWaypoints.status, "provider-error");
assert.equal(missingProviderWaypoints.message, providerErrorMessage);
assertNoSecrets(missingProviderWaypoints);

const reorderedProviderWaypoints = executeAmapRequest(drivingWithWaypoints, {
  env: { ...secrets },
  commandExists: () => true,
  runCommand: () => ({
    status: 0,
    stdout: JSON.stringify({
      ...routeProviderOutput,
      data: {
        ...routeProviderOutput.data,
        state: {
          ...drivingProviderState,
          waypoints: [...drivingProviderState.waypoints].reverse(),
        },
      },
    }),
    stderr: "",
  }),
});
assert.equal(reorderedProviderWaypoints.status, "provider-error");
assert.equal(reorderedProviderWaypoints.message, providerErrorMessage);
assertNoSecrets(reorderedProviderWaypoints);

const routeWithoutProviderWaypointField = normalizeAmapOutput(
  routeRequest,
  {
    ...routeProviderOutput,
    data: {
      ...routeProviderOutput.data,
      state: {
        from: routeProviderOutput.data.state.from,
        to: routeProviderOutput.data.state.to,
        type: routeProviderOutput.data.state.type,
      },
    },
  },
  checkedAt,
  { env: secrets },
);
assert.deepEqual(routeWithoutProviderWaypointField.waypoints, []);
assertNoSecrets(routeWithoutProviderWaypointField);

const unexpectedProviderWaypoint = executeAmapRequest(routeRequest, {
  env: { ...secrets },
  commandExists: () => true,
  runCommand: () => ({
    status: 0,
    stdout: JSON.stringify({
      ...routeProviderOutput,
      data: {
        ...routeProviderOutput.data,
        state: {
          ...routeProviderOutput.data.state,
          waypoints: [{ position: [100.162, 25.695] }],
        },
      },
    }),
    stderr: "",
  }),
});
assert.equal(unexpectedProviderWaypoint.status, "provider-error");
assert.equal(unexpectedProviderWaypoint.message, providerErrorMessage);
assertNoSecrets(unexpectedProviderWaypoint);

const conflictingLegacyRoute = executeAmapRequest(routeRequest, {
  env: { ...secrets },
  commandExists: () => true,
  runCommand: () => ({
    status: 0,
    stdout: JSON.stringify({
      ...routeProviderOutput,
      data: {
        ...routeProviderOutput.data,
        type: "walking",
        from: { name: "错误兼容起点", position: [101, 26] },
        to: { name: "错误兼容终点", position: [102, 27] },
      },
    }),
    stderr: "",
  }),
});
assert.equal(conflictingLegacyRoute.status, "provider-error");
assert.equal(conflictingLegacyRoute.message, providerErrorMessage);
assertNoSecrets(conflictingLegacyRoute);

const encodedMarkupOutput = normalizeAmapOutput(
  searchRequest,
  {
    ...searchProviderOutput,
    data: {
      ...searchProviderOutput.data,
      pois: [{ ...searchProviderOutput.data.pois[0], address: "&lt;script&gt;encoded-alert" }],
    },
  },
  checkedAt,
  { env: secrets },
);
assert.equal(encodedMarkupOutput.items[0].address, "");
assert.equal(encodedMarkupOutput.items[0].type, "购物服务;综合市场", "normal provider text must remain intact");
assertNoSecrets(encodedMarkupOutput);

assert.throws(
  () => normalizeAmapOutput(
    routeRequest,
    {
      ...routeProviderOutput,
      data: {
        ...routeProviderOutput.data,
        summary: {
          ...routeProviderOutput.data.summary,
          steps: [{ instruction: "向北步行<script", distance: 100, time: 60 }],
        },
      },
    },
    checkedAt,
    { env: secrets },
  ),
  (error) => {
    assert.equal(error.message, providerErrorMessage);
    return true;
  },
);

console.log("AMap execution safety contract passed");
