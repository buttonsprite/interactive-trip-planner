# POI Detail Depth and Type Design

## Goal

POI details should tell a traveler what makes a place distinct and how to experience it without forcing every market, museum, restaurant, cafe, bar, sight, or neighborhood into the same four-section essay.

## Decision

Use two compatible fields on top of the existing `note` / `plan` / `tip` contract:

```json
{
  "contentTier": "deep",
  "whyWorthIt": "A concrete traveler-facing verdict.",
  "detailSections": [
    {"title": "At the market", "items": ["Action one", "Action two"]},
    {"title": "What to notice", "items": ["Observation one"]},
    {"title": "The story", "body": "Grounded historical context."}
  ]
}
```

`contentTier` is one of `deep`, `standard`, or `compact`:

- `deep`: main anchors and `must` places. Requires `whyWorthIt` and 2-4 type-specific detail sections.
- `standard`: scheduled supporting stops and strong `preferred` places. Requires `whyWorthIt`; may include 0-2 type-specific detail sections.
- `compact`: nearby and archive candidates. Keeps the existing concise `note` / `plan` / `tip`; detail sections are omitted.

Legacy POIs without these fields remain valid and render with the existing sections.

## Type-specific content

Section titles and content follow the place type instead of a fixed universal list:

- Markets: what to browse or buy, what to observe, market structure and neighborhood history.
- Museums and sights: what to focus on, a viewing sequence, the specific work or detail that earns the visit, and relevant history.
- Restaurants: what role the meal plays, what to order, local technique or ingredient context, reservation trade-offs.
- Cafes and bars: what to drink, service or making style, spatial character, suitable day part and night-radius role.
- Neighborhoods and public spaces: a walking sequence, street-life clues, social use, and historical change.
- Hotels and transport nodes: route utility, return or luggage logic, and trade-offs; they do not need an artificial cultural story.

`story` is not a required section name. A story section appears only when verified context materially improves the visit.

## Local-life content quality

A local-life section must explain why the observed behavior or product belongs to this place, season, or food culture. Generic actions such as “look at fish, meat, and prepared food” are not sufficient because they could describe almost any market.

Market content should connect three layers when reliable sources support them:

1. **Distinct local pantry**: identify market categories or products that reveal the destination's food habits, rather than naming universal groceries.
2. **Resident use**: explain how local residents combine, cook, serve, or schedule those products in everyday life. A dish name is useful only when it makes the relationship concrete.
3. **Date-specific season**: identify products or rituals relevant to the travel month. Phrase them as things to look or ask for unless current stall-level availability is verified.

At least one action should help the traveler participate without turning the visit into a shopping checklist. Suitable actions include comparing a prepared component with its home-cooking use, asking a vendor what is seasonal and how they cook it, or choosing one small item that connects to a later meal.

Copy must distinguish source-backed facts from interpretation. Official market categories can prove that a type of stall exists; they do not prove that a particular item will be in stock on the visit date. Seasonal guides support “look for” and “ask about” language, not guaranteed availability.

## Festivals and special activities

Date-bound festivals and activities are a separate information layer that can enrich a POI or affect the route. They are not all forced into `pois.json`. A new `data/events.json` uses one event contract and three scopes:

- `venue`: a specific performance, festival site, market or exhibition with its own mappable venue. The map may render it as an event marker and the itinerary may schedule it like a POI.
- `hosted`: a special program attached to an existing market, museum, restaurant, park or neighborhood. It appears inside the host POI detail and reuses the host marker instead of creating a duplicate place.
- `citywide`: a parade, public holiday, neighborhood festival, seasonal ritual, conference or traffic restriction that affects one or more areas. It appears in trip/day context and route warnings without pretending to be a single point.

Each event record contains:

```json
{
  "id": "event-id",
  "name": "Official event name",
  "scope": "venue",
  "city": "Madrid",
  "status": "confirmed",
  "startsAt": "2026-10-18T19:30:00+02:00",
  "endsAt": "2026-10-18T21:00:00+02:00",
  "venuePoiId": "venue-poi-id",
  "hostPoiId": null,
  "routeImpact": "candidate",
  "whyWorthIt": "What makes this event locally meaningful for this traveler.",
  "plan": "How it can change the day.",
  "tip": "Booking, crowd, safety or access caveat.",
  "officialUrl": "https://example.org/event",
  "sourceIds": ["official-event-source"],
  "recheckAt": "2026-10-01"
}
```

`scope` determines which location fields are valid: `venue` uses `venuePoiId` or coordinates, `hosted` requires `hostPoiId`, and `citywide` can omit both. `routeImpact` is one of `anchor`, `candidate`, `nearby`, or `avoidance`.

Event status controls traveler-facing behavior:

- `confirmed`: official date, time and venue are available. It can become a fixed route anchor or visible candidate.
- `announced`: official event and date window are known, but a final time, venue or booking decision is still missing. It remains a candidate and cannot be described as booked.
- `program-pending`: an official festival window exists but the useful program or sessions are not published. Show the window and recheck date, but do not create a fake session or route stop.
- `historical-lead`: only a past edition or secondary discovery lead exists. Keep it in research notes with a recheck date; do not expose it as a current event on the map.

The discovery funnel must scan festivals, religious observances, public holidays, exhibitions, performances, sports, recurring markets, neighborhood activities, natural seasons and major disruptions for the exact trip dates. Official organizers, venues, city calendars and ticketing operators confirm event facts; editorial calendars and communities only discover leads.

Events affect routing even when the traveler does not attend. A confirmed or announced closure, crowd surge, late-night finish or transport change becomes a route constraint. A hosted event can upgrade its host POI from a normal candidate to a date-bound anchor. Event records do not count toward the normal POI pool unless they are mappable `venue` events.

The map shows mappable `venue` events with an event marker, `hosted` events in the host detail, and `citywide` events in the affected day or city context. Filters and details use traveler-facing labels such as “同期活动”, “特别节目” and “可能影响路线”; internal status names remain in data only.

## Rendering

The map always shows one concise `whyWorthIt || note` paragraph. It then renders zero to four `detailSections` in their stored order. A section may contain a paragraph (`body`), a short list (`items`), or both. `plan`, `tip`, and source sections remain below the experience content.

The renderer escapes headings, paragraphs, and list items. Empty or invalid sections are ignored so legacy data and partially enriched community contributions do not break the map.

## Validation

`validate-trip-data.js` remains backward compatible. When `contentTier` is present it enforces:

- the tier is `deep`, `standard`, or `compact`;
- `deep` has a non-empty `whyWorthIt` and 2-4 valid sections;
- `standard` has a non-empty `whyWorthIt` and no more than 2 valid sections;
- `compact` has no `detailSections`;
- each section has a non-empty `title` and at least a non-empty `body` or 1-5 non-empty `items`.

Event validation rejects unknown scopes, statuses and route impacts; missing official dates for `confirmed`; a `hosted` event without `hostPoiId`; a mappable `venue` event without a valid POI/coordinates; non-HTTP official URLs; missing source references; and route anchors whose event is not `confirmed`. Map contract tests cover one renderable record for every scope and ensure `program-pending` never becomes a fabricated itinerary stop.

## Spain acceptance example

`Mercat de Sant Antoni` is the first deep example. Its copy must distinguish the Tuesday 2026-10-13 visit from the Sunday book market, give concrete on-site actions and observation cues, and ground the building story in official Barcelona market sources.

Its local-life explanation must use the market's documented cooked-legume, salt-cod, olive/preserve, charcuterie and prepared-food categories to show how a resident can assemble an everyday Catalan meal. It should connect these categories to examples such as `botifarra amb mongetes`, `esqueixada` or vermut snacks, then add an October “look or ask for” layer around mushrooms, chestnuts, sweet potatoes and pumpkin. It must not claim that a specific product is guaranteed in stock.

The Spain sample should migrate `Madrid Otra Mirada` and `Suma Flamenca` from source-only windows into `program-pending` or `announced` event records according to the latest official evidence. They remain visible as date-window candidates with recheck dates until a suitable session and venue are confirmed; they must not silently become route stops.

## Token boundary

The skill should not load every deep body into planning context by default. Discovery and routing can use `id`, `name`, `contentTier`, `whyWorthIt`, `plan`, and `tip`; full `detailSections` are needed when writing the final map, inspecting a POI, or revising a selected place.
