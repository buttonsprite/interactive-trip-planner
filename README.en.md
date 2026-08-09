# Interactive Trip Planner

[中文](README.md) | **English**

## Bring your taste in everyday life to a city you've never visited

It goes beyond generating a list of attractions. It learns how you want to travel, combines local-language research with landmark context, neighborhood life, and practical constraints, then turns them into a comfortable, trustworthy itinerary you can keep editing.

![Sant Antoni Market, the daily itinerary, and the Market Roof interactive map in the Spain example](docs/assets/readme/spain-market-roof-map.png)

> Use interactive-trip-planner to plan a first visit that includes both the city's defining places and the texture of local everyday life.

## How this differs from a typical AI itinerary

| Typical itinerary | Interactive Trip Planner |
| --- | --- |
| Assembles attractions from popularity lists | Understands your travel style and trade-offs before selecting places |
| Searches only in English or your own language | Creates local-language research tasks for the destination |
| Leaves saved research scattered inside a platform | Turns a board or individual notes into a browsable private travel library |
| Treats “local” and landmarks as an either-or choice | Balances defining places with everyday life on a first visit |
| Gives every POI a generic recommendation | Explains what to do, what to notice, and the story of the place |
| Fills the day by popularity | Plans around neighborhoods, timing, energy, and nighttime safety |
| Produces static text | Produces an interactive map where you can add, remove, reorder, and save |

## What you will get

- An itinerary brief with a clear theme, pace, and set of trade-offs.
- A source-backed pool of places with reasons for inclusion.
- One to three daily anchors, plus nearby food, rest, and replacement options.
- Reminders to recheck events, exhibitions, closures, reservations, and other changing facts.
- An interactive map that keeps the trip overview, daily order, and editing state together.
- One-click AMap / Google Maps place and route handoffs, plus portable Google My Maps files.
- A Xiaohongshu travel library that is readable in Finder or an editor and does not download media by default.

The map does not force every candidate into the itinerary. Browse by date, add or remove places, change priorities and same-day order, then ask Codex to review the consequences and rearrange the plan.

## Turn saved notes into usable research

If you already have many saved Xiaohongshu travel notes, paste a board URL or a set of individual note URLs first. The Skill tries anonymous public reading without cookies, extracts text, places, experience signals, and source URLs, and organizes them locally. It never silently falls back to your signed-in session when public reading fails.

A complete board often requires a signed-in session to enumerate its notes. The Skill may use that session for one import only after you explicitly accept a risk notice, and only to collect note URLs: it does not read cookies, export account data, like, follow, comment, auto-scroll, or crawl at high speed. If you do not accept that risk, paste individual share URLs instead; both paths produce the same library structure.

```text
travel-library/xiaohongshu/
  INDEX.md                         # Human-readable entrypoint for boards, notes, imports, and trips
  library.json                     # Machine-readable catalog
  collections/<board-id>/          # One board description and its note list
  notes/<note-id>/                 # One note, structured record, and optional media
  imports/<date>-<import-id>/       # Result, failures, and risk record for one import
  trips/<trip-slug>/               # Notes actually selected for a trip
```

Each note uses `record.json` as its source of truth and generates a readable `note.md`. The root `INDEX.md` uses relative links, so the library remains browsable after it is moved. Media is off by default; when explicitly enabled, bounded files are stored under the note's `media/` directory with provenance and SHA-256, while temporary signed URLs are rejected. The library lives in the travel workspace, should normally be Git-ignored, and is excluded from public Skill packages.

Xiaohongshu remains discovery and experience evidence. It can surface places, recommended dishes, queue patterns, and Chinese-traveler context, but hours, tickets, transport, events, and safety still require official or recent authoritative verification. See [Xiaohongshu board and note import](skill/references/xiaohongshu-import.md) for the complete workflow and risk boundary.

## From personal taste to an unfamiliar city

A Hybrid Taste Model captures selection logic that can travel: what matters to you, what you avoid, how you like a day to unfold, how you judge a shop or neighborhood, and which sources and visual language you prefer. It does not copy a fixed route or reproduce someone's unprocessed purchase history.

You can use an official model directly, ask the Skill to recommend one to three directions for the destination and travel style, or choose one primary and one secondary model. The primary model owns place selection and pace; the secondary model may add only one domain or visual tendency. The current release includes two official models:

- `city-craft-rhythm`: urban craft, architecture, markets, slow neighborhoods, and breathing room.
- `food-nightlife-locality`: local food structure, markets, dinner, and compact nighttime routes.

Contributors can also turn the reasoning behind a satisfying itinerary—selection criteria, dislikes, and transferable principles—into a versioned model rather than a list of venues to copy.

## Local-language research and sources

Place discovery follows a five-stage funnel:

1. Establish the factual backbone for tickets, opening status, events, transport, and safety with official sources.
2. Search in the destination's own languages to find local media, forums, and everyday-life discussions that English-only research can miss.
3. Use the trip's Taste Model to filter for places that match its taste, pace, and itinerary roles.
4. Recheck every shortlisted place against recent, official, and traceable sources before it enters the route.
5. Record the check date and when to verify again wherever sources conflict or facts may change close to departure.

The current source provides Regional Source Packs for Global Base, China Mainland, Japan, and francophone France/Belgium. A source pack describes the region's information ecosystem, research methods, and fact boundaries. The current local-language lexicons cover Spanish and Catalan; they provide stable search terms but are not source packs. Spain currently uses Global Base with Spanish and Catalan terms and does not yet have a dedicated Regional Source Pack.

Social media, forums, and named local editorial sources are discovery and experience signals. They do not independently prove opening hours, tickets, transport, or safety. See [Regional Source Packs](skill/references/regional-source-packs.md) and [source verification](skill/references/source-verification.md) for the full rules.

## A map you can use and take with you

For a mainland-China trip, the AMap enhancement appears only when place resolution or route review begins. After installing `@amap-lbs/amap-gui` and creating a Web (JS API) Key in the AMap console, a regular user runs one command once:

```bash
node skill/scripts/amap-credentials.js setup
```

Setup saves the complete pair in macOS Keychain, Windows DPAPI, or Linux Secret Service and performs real POI and route validation. After validation succeeds, later searches and route reviews create and clean up a request-scoped provider session automatically; users do not manually run `amap-gui start` on the normal path. On Linux, an unavailable Secret Service never falls back to plaintext storage: enable a system keyring or use the Advanced/CI environment override for the current session only.

```bash
node skill/scripts/amap-credentials.js status
node skill/scripts/amap-credentials.js update
node skill/scripts/amap-credentials.js remove
```

`status` never prints a Key value or fragment. `update` replaces the old profile only after the new pair passes both real checks. `remove` deletes only this Skill's local configuration. `AMAP_KEY` plus `AMAP_SECURITY_KEY` remain an Advanced/CI complete-pair override and are never mixed with the system store or written to trip files, exports, logs, Git, or release packages. `amap-gui status/start/stop` are troubleshooting-only commands. Planning still works without AMap configuration; the route is then labeled: **AMap road-network verification was not completed. Recheck in AMap before departure.**

A search result or handoff link never upgrades route status. Every formal adjacent segment must have valid route evidence for “Verified with AMap”; a day with only some valid segments is “Partially verified.” Adding, removing, moving, or reordering a place makes the affected day unverified again until Codex replans and rechecks the new adjacency.

Overseas research continues to use ordinary Web search, local-language material, and official pages. **Google Maps URLs do not require an API key.** A place or route URL opens Google Maps, which recalculates directions after opening. The current source does not call Google Places API and does not call Google Routes API; it does not require Google Cloud Billing.

For portable, long-term storage, download individually or generate with the CLI:

```text
places.csv
itinerary.kml
README.md
```

These files are manually imported into Google My Maps. KML contains only reliable WGS84 coordinates; places with only AMap GCJ-02 coordinates stay in CSV for manual name-and-address resolution. The files are **not automatically added to regular Google Maps saved lists**, and they are not automatically added to AMap favorites. See [map provider execution and delivery](skill/references/map-provider-delivery.md) for inputs, statuses, link limits, filesystem safety, and fallbacks.

## Get started

Tell the Skill your destination, dates, companions, budget, energy level, and the experiences you actually care about. If you do not know which direction to choose, it will first suggest a small number of options that would materially change place selection and pace.

```text
Use $interactive-trip-planner to plan seven days in Spain. It is my first visit; I like markets, architecture, desserts, and cocktails, but I do not want every day packed.
```

You can also start from your own research:

```text
Use $interactive-trip-planner to organize this Xiaohongshu board first. Do not download images by default, and save the useful leads for an autumn Yunnan trip in my private travel library.
```

Once you confirm a direction, it builds the factual base and candidate pool, plans each day, creates an editable map, and rechecks affected opening, reservation, transport, and capacity constraints after your edits.

## What the current source can do—and what it cannot guarantee

The current source is a developer preview that can support real trip planning, local-language research, daily route design, and interactive map generation with human oversight. It includes board and single-note imports, a signed-in risk gate, a browsable private library, optional media storage and import validation, real AMap queries, dual-map handoffs, and Google My Maps export.

It cannot yet guarantee a dedicated Regional Source Pack for every country, that search results are inherently correct, or that every route has been checked against a real transport network. Events, hours, prices, transport, reservations, weather, and safety still need the indicated pre-departure checks; social and forum content cannot be their only evidence.

This release is not Public V1. It still requires eight overseas Regional Source Packs, evaluation of each Taste Model in at least three unseen cities, and stronger representative evidence; see the [detailed acceptance boundary](skill/references/taste-and-source-online-logic.md). Public samples, screenshots, and release packages must not include real orders, flights, accommodation, names, accounts, credentials, or private itineraries. OpenStreetMap tiles and Wikimedia Commons images require a browser network connection.

## Contribute your taste and regional knowledge

Non-developers can start from an itinerary they were happy with: explain why choices worked, what did not fit, how the pace was managed, and which decisions should transfer to another city. Developers can turn that material into version-controlled, validated files:

- Taste Models: follow the [Hybrid Taste Model rules](skill/references/hybrid-taste-models.md) and the existing [`taste-models`](skill/assets/taste-models/) structure.
- Regional knowledge and local-language terms: follow the [Regional Source Pack rules](skill/references/regional-source-packs.md), adding named sources, discovery paths, fact boundaries, fallbacks, and lexicons under [`source-packs`](skill/assets/source-packs/).
- Visual themes and destination presets: follow the [theme library](skill/references/theme-library.md), [design-language guidance](skill/references/design-language.md), and existing [`themes`](skill/assets/themes/) structure.
- Representative trips and samples: follow the [sample conventions](skill/assets/samples/README.md), including authorization, representative rationale, and privacy review.

Free-form submissions and community signals do not become trusted facts by themselves. Contributions retain an owner, license, version, traceable sources, and repository validation. Features and fixes can be proposed through a GitHub issue or pull request.

## Installation

**Codex / full GitHub edition**

1. Clone or download this repository.
2. Copy [`skill/`](skill/) to the Codex skills directory as `interactive-trip-planner` (the default path is `~/.codex/skills/interactive-trip-planner/`).
3. Open a new Codex task and invoke `$interactive-trip-planner`.

**REDSkill**

Choose the newest version directory under [`releases/`](releases/), use its complete `interactive-trip-planner/` folder, and follow the `INSTALL.zh-CN.md` in the same release directory. This edition excludes Codex metadata and private travel libraries, and keeps only file formats supported by the platform. Do not mix root source files with an older release package.

## Development and verification

Development requires Node.js 18 or newer. `skill/` is the source; `releases/` contains generated output and should not be edited directly.

```bash
npm run build:redskill
npm test
```

`npm test` checks Core route and state behavior, map templates, Taste Models, Regional Source Packs, discovery scripts, Xiaohongshu import and library behavior, the theme contract, the Skill contract, and REDSkill format and privacy boundaries.

The agent-facing JSON CLIs live in `skill/scripts/`:

```bash
node skill/scripts/recommend-taste-models.js --context <context.json>
node skill/scripts/build-source-query-matrix.js --context <context.json>
node skill/scripts/probe-source-access.js --context <sources.json>
node skill/scripts/check-amap-cli.js
node skill/scripts/amap-cli.js --context <amap-request.json>
node skill/scripts/export-google-my-maps.js --guide <guide-directory> --output <new-directory>
node skill/scripts/fetch-xhs-public.js --context <xiaohongshu-link.json>
node skill/scripts/import-xhs-library.js --workspace <travel-workspace> --context <normalized-import.json>
node skill/scripts/validate-xhs-library.js --library <library-directory>
node skill/scripts/summarize-xhs-import.js --library <library-directory> --import <import-id>
```

Import commands and `amap-cli.js` accept exactly one of `--context <file>` or `--stdin` and return fixed-shape output without echoing cookies, tokens, map credentials, or fetched page bodies. The query matrix only creates research tasks; it does not access the network. The source probe reports bounded access status only and cannot prove that a place exists, is open, can be booked, fits the itinerary, or is safe. The My Maps CLI refuses overwrite by default; `--replace` still replaces only the three known files. See the [taste and source online logic](skill/references/taste-and-source-online-logic.md), [map provider execution and delivery](skill/references/map-provider-delivery.md), and [Xiaohongshu import guide](skill/references/xiaohongshu-import.md) for detailed inputs and outputs.

## Repository structure

```text
interactive-trip-planner/
  skill/                         # Codex Skill source, templates, references, and validators
  scripts/                       # Repository-level REDSkill build and verification entrypoints
  docs/                          # Product design and release documentation
  releases/redskill-<version>/   # Generated REDSkill package
```

The six-stage trip-planning workflow and map interaction contracts live in [`skill/references/`](skill/references/). Reusable templates, Taste Models, Source Packs, themes, and public samples live in [`skill/assets/`](skill/assets/).
