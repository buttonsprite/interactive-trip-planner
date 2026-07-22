# Repository Working Rules

## Source of truth

- `skill/` is the only editable skill source.
- `releases/redskill-<version>/` is generated output. Never edit it directly.
- Keep the public sample isolated from any personal itinerary, booking, identity, hotel, or flight data.

## Change flow

1. Read `skill/SKILL.md` and the relevant references, scripts, templates, and contracts.
2. Make the smallest coherent change in `skill/`.
3. Run `npm run build:redskill`.
4. Run `npm test` and inspect the generated release.
5. For visible map changes, verify both templates in a desktop browser and the public template at a mobile width.

## Release rules

- Set the release version in the root `package.json`.
- The GitHub/Codex source may include `agents/openai.yaml` and local Leaflet source files.
- The REDSkill build must contain only supported Markdown, HTML, CSS, JavaScript, and JSON files.
- REDSkill map HTML files must inline Leaflet CSS/JS; the light template must also inline its Core CSS/JS.
- Do not commit `.DS_Store`, credentials, API keys, local browser state, or private trip material.

## Validation

- `npm run test:skill`: validate the editable skill source.
- `npm run build:redskill`: rebuild the current REDSkill release.
- `npm run test:redskill`: validate formats, inline dependencies, privacy boundaries, and release contracts.
- `npm test`: run the complete sequence.
