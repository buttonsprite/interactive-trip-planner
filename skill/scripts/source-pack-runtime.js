#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function loadSourceRegistry({ skillRoot = defaultSkillRoot } = {}) {
  const root = path.join(skillRoot, "assets", "source-packs");
  const registry = readJson(path.join(root, "index.json"));
  return {
    ...registry,
    packs: registry.packs.map((entry) => ({
      ...entry,
      pack: readJson(path.join(root, entry.path)),
    })),
  };
}

export function selectSourcePacks({ countryCode } = {}, { skillRoot = defaultSkillRoot } = {}) {
  const registry = loadSourceRegistry({ skillRoot });
  const normalized = String(countryCode || "").toUpperCase();
  const selected = ["global-base"];
  const regional = registry.packs.find((entry) => entry.id !== "global-base" && entry.countryCodes.includes(normalized));
  if (regional) selected.push(regional.id);
  return selected;
}

function renderQuery(template, context) {
  return template
    .replaceAll("{destination}", context.destination || "[目的地]")
    .replaceAll("{yearMonth}", context.yearMonth || "[旅行月份 年份]")
    .replaceAll("{tasteTerms}", (context.tasteTerms || []).join(" ") || "[本次偏好词]");
}

export function buildQueryMatrix(context = {}, { skillRoot = defaultSkillRoot } = {}) {
  const registry = loadSourceRegistry({ skillRoot });
  const packIds = selectSourcePacks(context, { skillRoot });
  const activeId = packIds.at(-1);
  const active = registry.packs.find((entry) => entry.id === activeId).pack;
  return {
    packIds,
    languageStrategy: active.languageStrategy,
    intents: active.queryIntents.map((intent) => ({
      id: intent.id,
      sourceRoles: intent.sourceRoles,
      queries: {
        zh: renderQuery(intent.queryTemplates.zh, context),
        en: renderQuery(intent.queryTemplates.en, context),
        local: renderQuery(intent.queryTemplates.local, context),
      },
    })),
    searchFunnel: registry.searchFunnel,
  };
}
