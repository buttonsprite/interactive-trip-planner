# Mobile Trip Map Design QA

## Comparison input

- Accepted source: `docs/design-qa/mobile-trip-map-source-390x844.png`
- Final implementation: `docs/design-qa/mobile-trip-map-final-390x844.png`
- Side-by-side comparison: `docs/design-qa/mobile-trip-map-comparison.png`
- Viewport and state: both `390 x 844`, `11/2 · 巴塞罗那`, compact day-route state, no selected POI detail.
- Source normalization: the accepted 852 x 1846 image was resized to the target CSS viewport before comparison; no crop was used.

## Visible comparison

The final Sample preserves the accepted hierarchy: a 64 px compact app bar, detailed Leaflet map as the primary upper surface, restrained teal active date and route guide, gold numbered route markers, a compact white bottom sheet with a visible handle, centered nearby dates, and a vertically scrolling ordered route.

Expected implementation differences are limited to real-map and interaction constraints: the live OpenStreetMap tile density differs from the generated source, text buttons replace unavailable source icons, and the persistent modification toolbar replaces the source-only single CTA so undo, change summary, and Codex replan remain reachable.

## QA history

1. Initial implementation: blocked. The route action stack overflowed its 60 px row and intercepted POI clicks; the active date stayed outside the visible rail; selected markers landed behind the sheet.
2. First correction: passed geometry and state checks. Route controls remained inside each row, detail clicks worked, active `11/2` centered, selected marker stayed between the app bar and sheet, and detail-back refresh remained in day view.
3. Review correction: passed data integrity checks. Change records gained structured before/after/affectedDays, copy failure retained the complete request, later edits invalidated stale fallback text, priority edits refreshed the map/list candidate set, and default candidates were limited to the nearest 8 non-hotel POIs.
4. Final visual correction: passed. Compact sheet was set to `43dvh`; mobile active date and day route guide were aligned to `#0f766e`; desktop retained its existing color and layout behavior.
5. Post-delivery detail-scroll correction: passed. The compact detail header had consumed about 190 px of a roughly 215 px scroll viewport while remaining sticky, leaving only about 25 px for the body. The mobile header now scrolls with the detail; the full body viewport can show photos and the why/plan/tip sections without the persistent footer covering them.
6. Date-switch correction: passed. Switching dates from mobile place detail now returns to the selected day's route while preserving the current map viewport and POI selection; desktop continues to keep the place detail visible beside the day list.

## Functional evidence

- Mobile: overview/day/detail/candidates, compact/expanded sheet, route click, date centering, detail-to-day date switching, marker visibility, layer popover, add, undo, change summary, replan copy, refresh restore, and 8-candidate default were exercised in the Codex in-app browser.
- Desktop: 1280 x 800 retained the 640 px sidebar / 640 px map layout, expanded layer control, working detail open, no horizontal overflow, and no console errors or warnings.
- Privacy/data: the public source, generated REDSkill release, and current Sample passed the same 18-day / 379-place contract and privacy scan; private `guides/europe-2026` remained outside the release build.

## Final result

passed
