#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mapRoot = path.resolve(scriptDir, "..", "assets", "guide-template", "maps");
const stateSource = fs.readFileSync(path.join(mapRoot, "assets", "trip-map-state.js"), "utf8");
const coreSource = fs.readFileSync(path.join(mapRoot, "assets", "trip-map-core.js"), "utf8");

class FakeClassList {
  add() {}
  remove() {}
  toggle() {}
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.dataset = {};
    this.hidden = false;
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.className = "";
    this.classList = new FakeClassList();
    this.style = { setProperty() {}, removeProperty() {} };
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  appendChild() {}
  remove() {}
  focus() { this.focused = true; }
  select() {}
  click() { this.clicked = true; }
  scrollIntoView() {}
  setAttribute() {}
  getBoundingClientRect() { return { top: 0, bottom: 600, height: 40 }; }
}

const ids = [
  "trip-title", "trip-summary", "trip-day-count", "trip-place-count", "trip-city-count",
  "trip-overview", "detail-browse", "day-list", "quick-count", "quick-list", "day-rail",
  "day-place-list", "poi-detail", "filter-city", "filter-category", "filter-priority",
  "filter-plan", "quick-search", "change-summary", "undo-change", "change-summary-text",
  "map", "map-note", "impact-reasons", "impact-dialog", "confirm-impact", "replan-text",
  "copy-feedback", "replan-dialog", "copy-replan", "cancel-impact", "close-replan",
  "open-map-export", "map-export-dialog", "close-map-export", "map-export-error",
];
const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
const body = new FakeElement("body");
const clickedDownloads = [];
const document = {
  body,
  createElement: () => {
    const element = new FakeElement();
    element.click = () => clickedDownloads.push(element.download);
    return element;
  },
  querySelector: (selector) => selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null,
  addEventListener() {},
};
const appRoot = new FakeElement("trip-app");
appRoot.querySelector = document.querySelector;

function chain(value = {}) {
  return Object.assign(value, {
    addTo() { return this; },
    bindTooltip() { return this; },
    on() { return this; },
    openTooltip() { return this; },
  });
}

const map = chain({
  setView() { return this; },
  fitBounds() {},
  invalidateSize() {},
  panTo() {},
});
const layer = chain({ clearLayers() {} });
const revoked = [];
let exportedOptions = null;
const trip = {
  slug: "delivery-ui-test",
  title: "交付测试",
  summary: "只包含虚构地点。",
  countryCode: "CN",
  map: { center: [30, 120], zoom: 12 },
  categories: { hotel: "住宿", sight: "景点" },
  priorities: { nearby: "顺路可去" },
  pois: [
    { id: "hotel", name: "Test Hotel", name_zh: "测试住宿", city: "测试城", area: "一区", category: "hotel", priority: "nearby", coords: [30, 120] },
    { id: "a", name: "Place A", name_zh: "地点甲", city: "测试城", area: "一区", category: "sight", priority: "nearby", coords: [30.01, 120.01] },
    { id: "b", name: "Place B", name_zh: "地点乙", city: "测试城", area: "一区", category: "sight", priority: "nearby", coords: [30.02, 120.02] },
  ],
  days: [{
    id: "day-1",
    date: "2026-10-13",
    city: "测试城",
    title: "测试日",
    summary: "测试路线",
    capacity: 3,
    routeStatus: "verified",
    routeReview: { status: "verified" },
    routeStops: [
      { poiId: "hotel", order: 0 },
      { poiId: "a", order: 1 },
      { poiId: "b", order: 2 },
    ],
    transitSegments: [{ fromPoiId: "hotel", toPoiId: "a", mode: "步行" }, { fromPoiId: "a", toPoiId: "b", mode: "步行" }],
  }],
};

const sandbox = {
  console,
  document,
  navigator: { clipboard: { writeText: async () => {} } },
  location: { pathname: "/map.html", search: "", hash: "" },
  history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {} },
  innerWidth: 1200,
  setTimeout: (callback) => { callback(); return 1; },
  clearTimeout() {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  Blob,
  URLSearchParams,
  URL: Object.assign(URL, {
    createObjectURL: () => "blob:test-export",
    revokeObjectURL: (url) => revoked.push(url),
  }),
  L: {
    map: () => map,
    tileLayer: () => chain(),
    layerGroup: () => layer,
    polyline: () => chain(),
    divIcon: (options) => options,
    marker: () => chain(),
  },
  TripMapDelivery: {
    buildPlaceLinks: () => ({
      primary: { provider: "amap", label: "在高德地图打开 / Open in AMap", url: "https://uri.amap.com/marker?markers=test" },
      amap: { provider: "amap", label: "在高德地图打开 / Open in AMap", url: "https://uri.amap.com/marker?markers=test" },
      google: { provider: "google", label: "在 Google Maps 打开 / Open in Google Maps", url: "https://www.google.com/maps/search/?api=1&query=test" },
      manualItems: [],
    }),
    buildDayHandoffs: (_day, _pois, options) => ({
      routeStatus: options.dirty ? "unverified" : "verified",
      overview: null,
      routeLinks: [{ provider: "google", label: "Google Maps 路线 1/1 / Google Maps route 1/1", url: "https://www.google.com/maps/dir/" }],
      manualItems: [{ poiId: "b", name: "地点乙", provider: "amap", reason: "manual-location-required" }],
    }),
    buildMyMapsFiles: (options) => {
      exportedOptions = options;
      return { "places.csv": "csv", "itinerary.kml": "kml", "README.md": "readme" };
    },
  },
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(stateSource, sandbox, { filename: "trip-map-state.js" });
vm.runInNewContext(coreSource, sandbox, { filename: "trip-map-core.js" });

const mounted = sandbox.TripMapCore.mount({ root: appRoot, trip });
mounted.selectDay("day-1");
mounted.openPoiDetail("a", { pan: false });
assert.match(elements.get("poi-detail").innerHTML, /class="map-provider-action is-primary"[^>]+data-map-provider="amap"/);
mounted.requestAction({ type: "move-order", poiId: "b", toIndex: 1 });

assert.match(elements.get("day-place-list").innerHTML, /路线待重新复核/);
assert.match(elements.get("day-place-list").innerHTML, /data-day-handoff/);
assert.match(elements.get("day-place-list").innerHTML, /需要手动查找/);

mounted.downloadExportFile("places.csv");
assert.ok(exportedOptions, "export must call TripMapDelivery.buildMyMapsFiles");
assert.deepEqual(JSON.parse(JSON.stringify(exportedOptions.state.orders["day-1"])), ["hotel", "b", "a"]);
assert.equal(exportedOptions.state.dirtyDays["day-1"], true);
assert.equal(exportedOptions.locale, "zh-CN");
assert.deepEqual(clickedDownloads, ["places.csv"], "one export action must trigger one file download");
assert.deepEqual(revoked, ["blob:test-export"], "each download must revoke its Blob URL immediately");

console.log("light map delivery UI passed");
