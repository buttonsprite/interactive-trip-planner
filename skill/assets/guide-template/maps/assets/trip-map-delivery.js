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
      label: "在高德地图打开",
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
      label: "在 Google Maps 打开",
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

  function buildGoogleRoutes(day, orderedItems, options, manualItems) {
    const runs = contiguousRuns(
      orderedItems,
      googleLocation,
      (poi) => appendManual(manualItems, poi, "google", "manual-location-required"),
    );
    const chunks = [];
    for (const run of runs) {
      for (let start = 0; start < run.length - 1; start += 4) {
        const chunk = run.slice(start, Math.min(start + 5, run.length));
        if (chunk.length >= 2) chunks.push(chunk);
      }
    }
    return chunks.map((chunk, index) => {
      const edgeModes = chunk.slice(1).map((item, edgeIndex) => (
        edgeMode(day, chunk[edgeIndex].poi.id, item.poi.id, "google")
      ));
      const travelMode = edgeModes.length && edgeModes.every((mode) => mode === edgeModes[0])
        ? edgeModes[0]
        : "";
      return {
        provider: "google",
        kind: "directions",
        label: chunks.length === 1 ? "在 Google Maps 打开今日路线" : `Google Maps 路线 ${index + 1}/${chunks.length}`,
        url: buildUrl(GOOGLE_DIRECTIONS_ENDPOINT, [
          ["api", "1"],
          ["origin", chunk[0].location],
          ["destination", chunk[chunk.length - 1].location],
          ["travelmode", travelMode],
          ["waypoints", chunk.slice(1, -1).map((item) => item.location).join("|")],
          ["utm_source", sourceName(options)],
          ["utm_campaign", "directions_request"],
        ]),
        poiIds: chunk.map((item) => item.poi.id),
      };
    });
  }

  function amapNavigationLocation(poi) {
    const position = validAmapPosition(poi);
    return position ? [position.lng, position.lat].join(",") : "";
  }

  function buildAmapRoutes(day, orderedItems, options, manualItems) {
    const runs = contiguousRuns(
      orderedItems,
      amapNavigationLocation,
      (poi) => appendManual(manualItems, poi, "amap", "manual-location-required"),
    );
    const chunks = [];
    for (const run of runs) {
      let index = 0;
      while (index < run.length - 1) {
        const firstMode = edgeMode(day, run[index].poi.id, run[index + 1].poi.id, "amap");
        const nextMode = index + 2 < run.length
          ? edgeMode(day, run[index + 1].poi.id, run[index + 2].poi.id, "amap")
          : "";
        if (firstMode === "car" && nextMode === "car") {
          chunks.push({ items: run.slice(index, index + 3), mode: "car" });
          index += 2;
        } else {
          chunks.push({ items: run.slice(index, index + 2), mode: firstMode });
          index += 1;
        }
      }
    }
    return chunks.map((chunk, index) => {
      const items = chunk.items;
      return {
        provider: "amap",
        kind: "navigation",
        label: chunks.length === 1 ? "在高德查看这段路线" : `高德路线 ${index + 1}/${chunks.length}`,
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

  function dayRouteStatus(day, options) {
    if (options?.dirty || day?.dirty) return "unverified";
    const status = cleanText(day?.routeStatus || day?.routeReview?.status);
    return routeStatuses.has(status) ? status : "unverified";
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
        label: "在高德查看今日地点",
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
      routeStatus: dayRouteStatus(day, options),
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

  function currentTripView(trip, state) {
    const sourceTrip = trip && typeof trip === "object" ? trip : {};
    const sourceState = state && typeof state === "object" ? state : {};
    const pois = sourceTrip.pois || [];
    const days = sourceTrip.days || [];
    const poiIds = new Set(pois.map((poi) => poi.id));
    const dayIds = new Set(days.map((day) => day.id));
    const defaults = baseAssignments(sourceTrip);
    const assignments = {};
    const priorities = {};
    for (const poi of pois) {
      const requestedDay = sourceState.assignments?.[poi.id];
      assignments[poi.id] = requestedDay === "" || dayIds.has(requestedDay)
        ? requestedDay
        : defaults[poi.id];
      priorities[poi.id] = cleanText(sourceState.priorities?.[poi.id] ?? poi.priority);
    }
    const dirtyDays = {};
    for (const [dayId, dirty] of Object.entries(sourceState.dirtyDays || {})) {
      if (dirty && dayIds.has(dayId)) dirtyDays[dayId] = true;
    }
    const currentDays = days.map((day) => {
      const requested = Array.isArray(sourceState.orders?.[day.id]) ? sourceState.orders[day.id] : [];
      const base = [...(day.routeStops || [])]
        .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
        .map((stop) => stop.poiId);
      const orderedPoiIds = [];
      for (const poiId of [...requested, ...base, ...pois.map((poi) => poi.id)]) {
        if (
          poiIds.has(poiId)
          && assignments[poiId] === day.id
          && !orderedPoiIds.includes(poiId)
        ) {
          orderedPoiIds.push(poiId);
        }
      }
      const dirty = Boolean(dirtyDays[day.id]);
      return {
        ...clone(day),
        orderedPoiIds,
        dirty,
        routeStatus: dirty ? "unverified" : dayRouteStatus(day),
      };
    });
    return {
      ...clone(sourceTrip),
      pois: clone(pois),
      days: currentDays,
      assignments,
      priorities,
      dirtyDays,
    };
  }

  root.TripMapDelivery = Object.freeze({
    buildPlaceLinks,
    buildDayHandoffs,
    currentTripView,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
