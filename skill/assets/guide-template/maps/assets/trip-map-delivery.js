(function installTripMapDelivery(root) {
  "use strict";

  const AMAP_MARKER_ENDPOINT = "https://uri.amap.com/marker";
  const AMAP_NAVIGATION_ENDPOINT = "https://uri.amap.com/navigation";
  const GOOGLE_SEARCH_ENDPOINT = "https://www.google.com/maps/search/";
  const GOOGLE_DIRECTIONS_ENDPOINT = "https://www.google.com/maps/dir/";
  const routeStatuses = new Set(["verified", "partial", "unverified"]);

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function sourceName(options) {
    return cleanText(options?.source) || "interactive-trip-planner";
  }

  function buildUrl(endpoint, entries) {
    const url = new URL(endpoint);
    const params = new URLSearchParams();
    for (const [key, value] of entries) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    url.search = params.toString();
    return url.toString();
  }

  function displayName(poi) {
    return cleanText(poi?.name_zh) || cleanText(poi?.name) || cleanText(poi?.id) || "未命名地点";
  }

  function displayAddress(poi) {
    return cleanText(poi?.address)
      || cleanText(poi?.mapProviderRefs?.amap?.address)
      || [cleanText(poi?.area), cleanText(poi?.city)].filter(Boolean).join("，");
  }

  function validCoords(coords) {
    return Array.isArray(coords)
      && coords.length >= 2
      && Number.isFinite(Number(coords[0]))
      && Number.isFinite(Number(coords[1]))
      && Number(coords[0]) >= -90
      && Number(coords[0]) <= 90
      && Number(coords[1]) >= -180
      && Number(coords[1]) <= 180;
  }

  function resolvedAmapRef(poi) {
    const ref = poi?.mapProviderRefs?.amap;
    return ref?.status === "resolved" ? ref : null;
  }

  function validAmapPosition(poi) {
    const position = resolvedAmapRef(poi)?.position;
    if (
      position?.system !== "gcj02"
      || !Number.isFinite(Number(position.lng))
      || !Number.isFinite(Number(position.lat))
      || Number(position.lng) < -180
      || Number(position.lng) > 180
      || Number(position.lat) < -90
      || Number(position.lat) > 90
    ) {
      return null;
    }
    return { lng: Number(position.lng), lat: Number(position.lat) };
  }

  function amapMarkerToken(poi) {
    const ref = resolvedAmapRef(poi);
    const poiId = cleanText(ref?.poiId);
    if (poiId) return poiId;
    const position = validAmapPosition(poi);
    if (!position) return "";
    const name = displayName(poi).replace(/[|,]/g, " ");
    return [position.lng, position.lat, name].join(",");
  }

  function googleLocation(poi) {
    if (validCoords(poi?.coords)) return [Number(poi.coords[0]), Number(poi.coords[1])].join(",");
    const name = displayName(poi);
    const address = displayAddress(poi);
    if (name === "未命名地点" && !address) return "";
    return [name, address].filter(Boolean).join(", ");
  }

  function manualItem(poi, provider, reason) {
    return {
      poiId: cleanText(poi?.id),
      name: displayName(poi),
      address: displayAddress(poi),
      provider,
      reason,
    };
  }

  function appendManual(items, poi, provider, reason) {
    const poiId = cleanText(poi?.id);
    if (!items.some((item) => item.poiId === poiId && item.provider === provider)) {
      items.push(manualItem(poi, provider, reason));
    }
  }

  function amapPlaceLink(poi, options) {
    const marker = amapMarkerToken(poi);
    if (!marker) return null;
    return {
      provider: "amap",
      kind: "place",
      label: "在高德地图打开 / Open in AMap",
      url: buildUrl(AMAP_MARKER_ENDPOINT, [
        ["markers", marker],
        ["src", sourceName(options)],
        ["callnative", "1"],
      ]),
      poiIds: [cleanText(poi.id)],
    };
  }

  function googlePlaceLink(poi, options) {
    const query = googleLocation(poi);
    if (!query) return null;
    return {
      provider: "google",
      kind: "place",
      label: "在 Google Maps 打开 / Open in Google Maps",
      url: buildUrl(GOOGLE_SEARCH_ENDPOINT, [
        ["api", "1"],
        ["query", query],
        ["utm_source", sourceName(options)],
        ["utm_campaign", "place_details_search"],
      ]),
      poiIds: [cleanText(poi.id)],
    };
  }

  function buildPlaceLinks(poi, options) {
    const manualItems = [];
    const amap = amapPlaceLink(poi, options);
    const google = googlePlaceLink(poi, options);
    if (!amap) appendManual(manualItems, poi, "amap", "manual-location-required");
    if (!google) appendManual(manualItems, poi, "google", "manual-location-required");
    const primary = String(options?.region || "").toUpperCase() === "CN"
      ? (amap || google)
      : (google || amap);
    return { primary, amap, google, manualItems };
  }

  function poiIndex(pois) {
    if (pois instanceof Map) return new Map(pois);
    return new Map((Array.isArray(pois) ? pois : []).map((poi) => [poi.id, poi]));
  }

  function orderedDayPoiIds(day, poisById, options) {
    const requested = Array.isArray(options?.orderedPoiIds)
      ? options.orderedPoiIds
      : (Array.isArray(day?.orderedPoiIds)
        ? day.orderedPoiIds
        : [...(day?.routeStops || [])]
          .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
          .map((stop) => stop.poiId));
    return requested.filter(
      (poiId, index) => poisById.has(poiId) && requested.indexOf(poiId) === index,
    );
  }

  function normalizeMode(value, provider) {
    const raw = cleanText(value).toLowerCase();
    const mode = {
      walk: "walking",
      walking: "walking",
      "步行": "walking",
      car: "driving",
      driving: "driving",
      "驾车": "driving",
      "开车": "driving",
      ride: "bicycling",
      bicycle: "bicycling",
      bicycling: "bicycling",
      cycling: "bicycling",
      "骑行": "bicycling",
      bus: "transit",
      transit: "transit",
      "公交": "transit",
      "公共交通": "transit",
    }[raw] || "";
    if (provider === "amap") {
      return { walking: "walk", driving: "car", bicycling: "ride", transit: "bus" }[mode] || "";
    }
    return mode;
  }

  function edgeMode(day, fromPoiId, toPoiId, provider) {
    const segment = (day?.transitSegments || []).find(
      (item) => item.fromPoiId === fromPoiId && item.toPoiId === toPoiId,
    );
    return normalizeMode(segment?.mode || day?.travelMode || "", provider);
  }

  function contiguousRuns(items, locationFor, onMissing) {
    const runs = [];
    let current = [];
    for (const item of items) {
      const location = locationFor(item.poi);
      if (location) {
        current.push({ ...item, location });
      } else {
        if (current.length) runs.push(current);
        current = [];
        onMissing(item.poi);
      }
    }
    if (current.length) runs.push(current);
    return runs;
  }

  function homogeneousModeRuns(day, run, provider, manualItems) {
    const runs = [];
    let current = null;
    const flush = () => {
      if (current) runs.push(current);
      current = null;
    };
    for (let index = 0; index < run.length - 1; index += 1) {
      const from = run[index];
      const to = run[index + 1];
      const mode = edgeMode(day, from.poi.id, to.poi.id, provider);
      if (!mode) {
        flush();
        appendManual(manualItems, from.poi, provider, "route-mode-required");
        appendManual(manualItems, to.poi, provider, "route-mode-required");
      } else if (current?.mode === mode) {
        current.items.push(to);
      } else {
        flush();
        current = { mode, items: [from, to] };
      }
    }
    flush();
    return runs;
  }

  function buildGoogleRoutes(day, orderedItems, options, manualItems) {
    const locationRuns = contiguousRuns(
      orderedItems,
      googleLocation,
      (poi) => appendManual(manualItems, poi, "google", "manual-location-required"),
    );
    const chunks = [];
    for (const locationRun of locationRuns) {
      const modeRuns = homogeneousModeRuns(day, locationRun, "google", manualItems);
      for (const modeRun of modeRuns) {
        for (let start = 0; start < modeRun.items.length - 1; start += 4) {
          const items = modeRun.items.slice(start, Math.min(start + 5, modeRun.items.length));
          if (items.length >= 2) chunks.push({ items, mode: modeRun.mode });
        }
      }
    }
    return chunks.map((chunk, index) => {
      const items = chunk.items;
      return {
        provider: "google",
        kind: "directions",
        label: chunks.length === 1
          ? "在 Google Maps 打开今日路线 / Open today's route in Google Maps"
          : `Google Maps 路线 ${index + 1}/${chunks.length} / Google Maps route ${index + 1}/${chunks.length}`,
        url: buildUrl(GOOGLE_DIRECTIONS_ENDPOINT, [
          ["api", "1"],
          ["origin", items[0].location],
          ["destination", items[items.length - 1].location],
          ["travelmode", chunk.mode],
          ["waypoints", items.slice(1, -1).map((item) => item.location).join("|")],
          ["utm_source", sourceName(options)],
          ["utm_campaign", "directions_request"],
        ]),
        poiIds: items.map((item) => item.poi.id),
      };
    });
  }

  function amapNavigationLocation(poi) {
    const position = validAmapPosition(poi);
    return position ? [position.lng, position.lat].join(",") : "";
  }

  function buildAmapRoutes(day, orderedItems, options, manualItems) {
    const locationRuns = contiguousRuns(
      orderedItems,
      amapNavigationLocation,
      (poi) => appendManual(manualItems, poi, "amap", "manual-location-required"),
    );
    const chunks = [];
    for (const locationRun of locationRuns) {
      const modeRuns = homogeneousModeRuns(day, locationRun, "amap", manualItems);
      for (const modeRun of modeRuns) {
        if (modeRun.mode === "car") {
          for (let start = 0; start < modeRun.items.length - 1; start += 2) {
            chunks.push({
              items: modeRun.items.slice(start, Math.min(start + 3, modeRun.items.length)),
              mode: modeRun.mode,
            });
          }
        } else {
          for (let index = 0; index < modeRun.items.length - 1; index += 1) {
            chunks.push({ items: modeRun.items.slice(index, index + 2), mode: modeRun.mode });
          }
        }
      }
    }
    return chunks.map((chunk, index) => {
      const items = chunk.items;
      return {
        provider: "amap",
        kind: "navigation",
        label: chunks.length === 1
          ? "在高德查看这段路线 / Open this route in AMap"
          : `高德路线 ${index + 1}/${chunks.length} / AMap route ${index + 1}/${chunks.length}`,
        url: buildUrl(AMAP_NAVIGATION_ENDPOINT, [
          ["from", items[0].location],
          ["to", items[items.length - 1].location],
          ["via", chunk.mode === "car" && items.length === 3 ? items[1].location : ""],
          ["mode", chunk.mode],
          ["src", sourceName(options)],
          ["callnative", "1"],
        ]),
        poiIds: items.map((item) => item.poi.id),
      };
    });
  }

  function routeEvidenceStatus(day, orderedPoiIds) {
    if (!Array.isArray(orderedPoiIds) || orderedPoiIds.length < 2) return "unverified";
    let verifiedEdges = 0;
    for (let index = 0; index < orderedPoiIds.length - 1; index += 1) {
      const fromPoiId = orderedPoiIds[index];
      const toPoiId = orderedPoiIds[index + 1];
      const segment = (day?.transitSegments || []).find(
        (item) => item.fromPoiId === fromPoiId && item.toPoiId === toPoiId,
      );
      if (
        segment?.routeStatus === "verified"
        && cleanText(segment.routeProvider)
        && cleanText(segment.routeReviewedAt)
        && Number.isFinite(segment.distanceMeters)
        && segment.distanceMeters > 0
      ) {
        verifiedEdges += 1;
      }
    }
    if (verifiedEdges === orderedPoiIds.length - 1) return "verified";
    return verifiedEdges > 0 ? "partial" : "unverified";
  }

  function dayRouteStatus(day, options) {
    if (options?.dirty || day?.dirty) return "unverified";
    const statusRank = { unverified: 0, partial: 1, verified: 2 };
    const declarations = [day?.routeStatus, day?.routeReview?.status]
      .map(cleanText)
      .filter((status) => routeStatuses.has(status));
    const declared = declarations.reduce(
      (least, status) => statusRank[status] < statusRank[least] ? status : least,
      "verified",
    );
    if (!declarations.length || declared === "unverified") return "unverified";
    const fallbackOrder = Array.isArray(day?.orderedPoiIds)
      ? day.orderedPoiIds
      : [...(day?.routeStops || [])]
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
        .map((stop) => stop.poiId);
    const evidence = routeEvidenceStatus(day, options?.orderedPoiIds || fallbackOrder);
    return statusRank[evidence] < statusRank[declared] ? evidence : declared;
  }

  function buildDayHandoffs(day, pois, options) {
    const poisById = poiIndex(pois);
    const orderedPoiIds = orderedDayPoiIds(day, poisById, options);
    const orderedItems = orderedPoiIds.map((poiId) => ({ poiId, poi: poisById.get(poiId) }));
    const manualItems = [];
    const markerItems = orderedItems
      .map((item) => ({ ...item, marker: amapMarkerToken(item.poi) }))
      .filter((item) => {
        if (item.marker) return true;
        appendManual(manualItems, item.poi, "amap", "manual-location-required");
        return false;
      })
      .slice(0, 10);
    const overview = markerItems.length
      ? {
        provider: "amap",
        kind: "markers",
        label: "在高德查看今日地点 / View today's places in AMap",
        url: buildUrl(AMAP_MARKER_ENDPOINT, [
          ["markers", markerItems.map((item) => item.marker).join("|")],
          ["src", sourceName(options)],
          ["callnative", "1"],
        ]),
        poiIds: markerItems.map((item) => item.poiId),
      }
      : null;
    const routeLinks = [
      ...buildGoogleRoutes(day, orderedItems, options, manualItems),
      ...buildAmapRoutes(day, orderedItems, options, manualItems),
    ];
    return {
      overview,
      routeLinks,
      routeStatus: dayRouteStatus(day, { ...options, orderedPoiIds }),
      manualItems,
    };
  }

  function baseAssignments(trip) {
    const assignments = Object.fromEntries((trip?.pois || []).map((poi) => [poi.id, ""]));
    for (const day of trip?.days || []) {
      for (const stop of day.routeStops || []) {
        if (Object.prototype.hasOwnProperty.call(assignments, stop.poiId)) assignments[stop.poiId] = day.id;
      }
    }
    return assignments;
  }

  function baseOrders(trip) {
    return Object.fromEntries((trip?.days || []).map((day) => [
      day.id,
      [...(day.routeStops || [])]
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
        .map((stop) => stop.poiId),
    ]));
  }

  function basePriorities(trip) {
    return Object.fromEntries((trip?.pois || []).map((poi) => [poi.id, cleanText(poi.priority)]));
  }

  function currentTripView(trip, state) {
    const sourceTrip = trip && typeof trip === "object" ? trip : {};
    const hasState = state !== null && state !== undefined && typeof state === "object";
    const sourceState = hasState ? state : {};
    const pois = sourceTrip.pois || [];
    const days = sourceTrip.days || [];
    const assignments = clone(hasState ? (sourceState.assignments || {}) : baseAssignments(sourceTrip));
    const priorities = clone(hasState ? (sourceState.priorities || {}) : basePriorities(sourceTrip));
    const orders = clone(hasState ? (sourceState.orders || {}) : baseOrders(sourceTrip));
    const dirtyDays = clone(hasState ? (sourceState.dirtyDays || {}) : {});
    const currentDays = days.map((day) => {
      const orderedPoiIds = clone(Array.isArray(orders[day.id]) ? orders[day.id] : []);
      const dirty = Boolean(dirtyDays[day.id]);
      return {
        ...clone(day),
        orderedPoiIds,
        dirty,
        routeStatus: dayRouteStatus(day, { orderedPoiIds, dirty }),
      };
    });
    return {
      ...clone(sourceTrip),
      pois: clone(pois),
      days: currentDays,
      assignments,
      priorities,
      orders,
      dirtyDays,
    };
  }

  root.TripMapDelivery = Object.freeze({
    buildPlaceLinks,
    buildDayHandoffs,
    currentTripView,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
