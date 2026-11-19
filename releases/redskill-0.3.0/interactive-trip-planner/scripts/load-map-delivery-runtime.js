import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRuntimePath = path.resolve(
  scriptDir,
  "../assets/guide-template/maps/assets/trip-map-delivery.js",
);
const requiredFunctions = ["buildPlaceLinks", "buildDayHandoffs", "currentTripView"];

function hostValue(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function loadMapDeliveryRuntime(runtimePath = defaultRuntimePath) {
  const source = fs.readFileSync(runtimePath, "utf8");
  const sandbox = { URL, URLSearchParams };
  vm.runInNewContext(source, sandbox, { filename: runtimePath });
  const runtime = sandbox.TripMapDelivery;
  if (!runtime || requiredFunctions.some((name) => typeof runtime[name] !== "function")) {
    throw new Error("TripMapDelivery runtime is missing required functions.");
  }
  return Object.freeze(Object.fromEntries(
    Object.keys(runtime)
      .filter((name) => typeof runtime[name] === "function")
      .map((name) => [name, (...args) => hostValue(runtime[name](...args))]),
  ));
}
