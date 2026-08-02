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

## Spain acceptance example

`Mercat de Sant Antoni` is the first deep example. Its copy must distinguish the Tuesday 2026-10-13 visit from the Sunday book market, give concrete on-site actions and observation cues, and ground the building story in official Barcelona market sources.

## Token boundary

The skill should not load every deep body into planning context by default. Discovery and routing can use `id`, `name`, `contentTier`, `whyWorthIt`, `plan`, and `tip`; full `detailSections` are needed when writing the final map, inspecting a POI, or revising a selected place.
